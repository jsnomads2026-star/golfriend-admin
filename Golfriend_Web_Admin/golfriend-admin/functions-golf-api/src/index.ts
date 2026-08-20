import admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { isActiveStaffOrDirector } from './authority.js';
import { classifyCourseSync, type CourseRecord, type ProviderCourse } from './courseSyncCore.js';
import { nextUsage, parseApplyRequest, parsePreviewRequest } from './syncPlan.js';
import { buildGolfApiSyncStatus } from './statusView.js';
import { classifyProviderFailure, dueForRun, type DurableJob } from './ingestionReliability.js';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(), GOLF_API_KEY = defineSecret('GOLF_API_KEY'), REGION = 'asia-southeast1';
const courses = db.collection('courses'), audits = db.collection('golf_api_sync_audit'), usage = db.collection('platform').doc('golfApiUsage'), jobs = db.collection('golf_api_ingestion_jobs');
// One request per durable scheduler tick keeps quota accounting exact even when a provider call fails.
const BATCH_SIZE = 1, LEASE_MS = 14 * 60 * 1000;
const month = (d: Date) => d.toISOString().slice(0, 7), stamp = (d: Date) => d.toISOString();

async function requireStaffOrDirector(uid: string) {
  const staff = await db.collection('admin_users').doc(uid).get();
  if (!isActiveStaffOrDirector(staff.exists ? staff.data() : null)) throw new HttpsError('permission-denied', 'Only active staff or a Director can run Golf API sync.');
}
type ProviderOutcome = { kind: 'success'; course: ProviderCourse | null } | { kind: 'failure'; status: number; retryAfter: string | null };
/** This is intentionally called only by runGolfApiIngestion. */
async function fetchProviderOutcome(id: string): Promise<ProviderOutcome> {
  let response: Response;
  try { response = await fetch(`https://www.golfapi.io/api/v2.3/courses/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${GOLF_API_KEY.value()}` } }); }
  catch { return { kind: 'failure', status: 503, retryAfter: null }; }
  if (response.status === 404) return { kind: 'failure', status: 404, retryAfter: null };
  if (!response.ok) return { kind: 'failure', status: response.status, retryAfter: response.headers.get('retry-after') };
  try {
    const body = await response.json() as Record<string, unknown>, value = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
    return { kind: 'success', course: { courseID: value.courseID ?? value.id ?? id, latitude: value.latitude ?? null, longitude: value.longitude ?? null } };
  } catch { return { kind: 'failure', status: 422, retryAfter: null }; }
}
const remaining = (job: DurableJob) => job.courseIds.filter((id) => !job.completed.includes(id));

/** Preview performs local validation only: no provider call, quota reservation, or write. */
export const syncCoursesFromProvider = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 120 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  await requireStaffOrDirector(request.auth.uid);
  const mode = (request.data as { mode?: unknown } | undefined)?.mode;
  if (mode === 'preview') {
    let input; try { input = parsePreviewRequest(request.data); } catch (e) { throw new HttpsError('invalid-argument', e instanceof Error ? e.message : 'Invalid preview request.'); }
    const snaps = await Promise.all(input.courseIds.map((id) => courses.doc(id).get()));
    const results = snaps.map((snap, i) => ({ courseId: input.courseIds[i], providerId: input.courseIds[i], result: snap.exists ? 'proposed_for_worker' : 'missing_local_course', before: { latitude: null, longitude: null } }));
    const summary = results.reduce((out: Record<string, number>, row) => { out[row.result] = (out[row.result] ?? 0) + 1; return out; }, {});
    return { success: true, mode, processed: results.length, providerRequestsReserved: 0, summary, results, note: 'Preview is local validation only; Apply queues a server-owned job.' };
  }
  if (mode !== 'apply') throw new HttpsError('invalid-argument', 'mode must be "preview" or "apply".');
  let input; try { input = parseApplyRequest(request.data); } catch (e) { throw new HttpsError('invalid-argument', e instanceof Error ? e.message : 'Invalid apply request.'); }
  const ref = jobs.doc(input.requestId);
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return { idempotent: true, state: existing.get('state') };
    const local = await Promise.all(input.courseIds.map((id) => tx.get(courses.doc(id))));
    const courseIds = input.courseIds.filter((_, i) => local[i].exists);
    if (!courseIds.length) throw new HttpsError('failed-precondition', 'No requested courses exist locally.');
    tx.create(ref, { schema: 'golfriend.golf-api-ingestion-job.v1', state: 'queued', cursor: 0, courseIds, completed: [], attempts: {}, terminalErrors: {}, counters: { processed: 0, proposed: 0, unchanged: 0, permanentFailures: 0, temporaryFailures: 0 }, quotaContext: null, nextRetryAt: null, leaseUntil: null, runId: null, requestedBy: request.auth!.uid, requestId: input.requestId, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(audits.doc(`job_${input.requestId}_enqueued`), { schema: 'golfriend.golf-api-sync-audit.v1', eventType: 'job_enqueued', jobId: input.requestId, actorUid: request.auth!.uid, courseCount: courseIds.length, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { idempotent: false, state: 'queued' };
  });
  return { success: true, mode, jobId: input.requestId, providerRequestsReserved: 0, ...result };
});

export const getGolfApiSyncStatus = onCall({ region: REGION, memory: '256MiB' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  await requireStaffOrDirector(request.auth.uid);
  const [used, recent] = await Promise.all([usage.get(), audits.orderBy('createdAt', 'desc').limit(10).get()]);
  return buildGolfApiSyncStatus({ usage: used.exists ? used.data() ?? null : null, audits: recent.docs.map((d) => d.data()) });
});

/** The sole provider caller. A lease transaction makes duplicate scheduler deliveries harmless. */
export const runGolfApiIngestion = onSchedule({ region: REGION, schedule: 'every 15 minutes', timeZone: 'Asia/Bangkok', secrets: [GOLF_API_KEY], memory: '256MiB', timeoutSeconds: 120 }, async () => {
  const now = new Date(), candidates = await jobs.where('state', 'in', ['queued', 'waiting_retry']).limit(5).get();
  for (const candidate of candidates.docs) {
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(candidate.ref), job = snap.data() as DurableJob | undefined;
      if (!job || !dueForRun(job, now)) return null;
      const ids = remaining(job).slice(0, BATCH_SIZE);
      if (!ids.length) { tx.update(candidate.ref, { state: 'completed', leaseUntil: null, runId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return null; }
      const runId = `${candidate.id}_${now.getTime()}`;
      tx.update(candidate.ref, { state: 'running', runId, leaseUntil: stamp(new Date(now.getTime() + LEASE_MS)), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { job, ids, runId };
    });
    if (!claim) continue;
    let quota;
    try { quota = await db.runTransaction(async (tx) => { const current = await tx.get(usage); const next = nextUsage(month(now), current.exists ? current.data() ?? null : null, claim.ids.length); tx.set(usage, { schema: 'golfriend.platform.golf-api-usage.v1', ...next, monthlyBudget: 100, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); return next; }); }
    catch { await candidate.ref.update({ state: 'quota_exhausted', leaseUntil: null, runId: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); await audits.doc(`job_${candidate.id}_${claim.runId}_quota`).create({ schema: 'golfriend.golf-api-sync-audit.v1', eventType: 'quota_exhausted', jobId: candidate.id, createdAt: admin.firestore.FieldValue.serverTimestamp() }); continue; }
    // One bounded request per tick; subsequent ticks resume at the first incomplete ID.
    const id = claim.ids[0], outcome = await fetchProviderOutcome(id);
    if (outcome.kind === 'failure') {
      const failure = classifyProviderFailure(outcome.status, outcome.retryAfter, now, claim.job.attempts[id] ?? 0, Math.floor(Math.random() * 1000));
      const patch = failure.kind === 'temporary'
        ? { state: 'waiting_retry', nextRetryAt: failure.retryAt, leaseUntil: null, runId: null, [`attempts.${id}`]: admin.firestore.FieldValue.increment(1), 'counters.temporaryFailures': admin.firestore.FieldValue.increment(1) }
        : { state: 'failed_permanent', leaseUntil: null, runId: null, [`terminalErrors.${id}`]: failure.reason, 'counters.permanentFailures': admin.firestore.FieldValue.increment(1) };
      await candidate.ref.update({ ...patch, quotaContext: quota, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await audits.doc(`job_${candidate.id}_${claim.runId}_${id}`).create({ schema: 'golfriend.golf-api-sync-audit.v1', eventType: failure.kind === 'temporary' ? 'provider_retry' : 'provider_permanent_failure', jobId: candidate.id, courseId: id, reason: failure.reason, ...(failure.kind === 'temporary' ? { retryAt: failure.retryAt } : {}), createdAt: admin.firestore.FieldValue.serverTimestamp() });
      continue;
    }
    await db.runTransaction(async (tx) => {
      const [jobSnap, courseSnap] = await Promise.all([tx.get(candidate.ref), tx.get(courses.doc(id))]), current = jobSnap.data() as DurableJob | undefined;
      if (!current || current.runId !== claim.runId || current.completed.includes(id)) return;
      const decision = classifyCourseSync(id, (courseSnap.data() ?? {}) as CourseRecord, outcome.course);
      if (decision.result === 'updated' && decision.after) tx.set(courseSnap.ref, { latitude: decision.after.latitude, longitude: decision.after.longitude, lat: decision.after.latitude, lng: decision.after.longitude, gpsSource: 'golfapi', providerId: id, providerFetchedAt: stamp(now), apiImported: true }, { merge: true });
      const completed = current.completed.length + 1 === current.courseIds.length;
      tx.update(candidate.ref, { completed: admin.firestore.FieldValue.arrayUnion(id), cursor: Math.max(current.cursor, current.courseIds.indexOf(id) + 1), state: completed ? 'completed' : 'queued', nextRetryAt: null, leaseUntil: null, runId: null, 'counters.processed': admin.firestore.FieldValue.increment(1), ...(decision.result === 'updated' ? { 'counters.proposed': admin.firestore.FieldValue.increment(1) } : { 'counters.unchanged': admin.firestore.FieldValue.increment(1) }), quotaContext: quota, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.create(audits.doc(`job_${candidate.id}_${claim.runId}_${id}`), { schema: 'golfriend.golf-api-sync-audit.v1', eventType: 'provider_result', jobId: candidate.id, courseId: id, result: decision.result, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  }
});
