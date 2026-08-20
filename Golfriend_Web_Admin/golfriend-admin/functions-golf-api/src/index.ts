import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { isActiveStaffOrDirector } from './authority.js';
import { classifyCourseSync, type CourseRecord, type ProviderCourse } from './courseSyncCore.js';
import { nextUsage, parseApplyRequest, parsePreviewRequest } from './syncPlan.js';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const GOLF_API_KEY = defineSecret('GOLF_API_KEY');
const REGION = 'asia-southeast1';
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const courseCollection = db.collection('courses');
const previewCollection = db.collection('golf_api_sync_previews');
const auditCollection = db.collection('golf_api_sync_audit');
const usageRef = db.collection('platform').doc('golfApiUsage');

const monthKey = (now: Date) => now.toISOString().slice(0, 7);
const timestamp = () => new Date().toISOString();

async function requireStaffOrDirector(uid: string) {
  const staff = await db.collection('admin_users').doc(uid).get();
  if (!isActiveStaffOrDirector(staff.exists ? staff.data() : null)) throw new HttpsError('permission-denied', 'Only active staff or a Director can run Golf API sync.');
}

async function fetchProviderCourse(providerId: string): Promise<ProviderCourse | null> {
  const response = await fetch(`https://www.golfapi.io/api/v2.3/courses/${encodeURIComponent(providerId)}`, { headers: { Authorization: `Bearer ${GOLF_API_KEY.value()}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}.`);
  const body = await response.json() as Record<string, unknown>;
  const value = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  return { courseID: value.courseID ?? value.id ?? providerId, latitude: value.latitude ?? null, longitude: value.longitude ?? null };
}

export const syncCoursesFromProvider = onCall({ region: REGION, secrets: [GOLF_API_KEY], memory: '256MiB', timeoutSeconds: 120 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  await requireStaffOrDirector(request.auth.uid);
  const mode = (request.data as { mode?: unknown } | undefined)?.mode;

  if (mode === 'preview') {
    let input;
    try { input = parsePreviewRequest(request.data); } catch (error) { throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid preview request.'); }
    const courseSnapshots = await Promise.all(input.courseIds.map((id) => courseCollection.doc(id).get()));
    const targets = courseSnapshots.map((snapshot, index) => ({ providerId: input.courseIds[index], snapshot })).filter(({ snapshot }) => snapshot.exists);
    if (!targets.length) throw new HttpsError('not-found', 'None of the requested courses exist; no provider request was made.');
    const now = new Date();
    let usage;
    try {
      usage = await db.runTransaction(async (tx) => {
        const current = await tx.get(usageRef);
        const next = nextUsage(monthKey(now), current.exists ? current.data() : null, targets.length);
        tx.set(usageRef, { schema: 'golfriend.platform.golf-api-usage.v1', ...next, monthlyBudget: 100, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return next;
      });
    } catch (error) { throw new HttpsError('resource-exhausted', error instanceof Error ? error.message : 'Usage reservation failed.'); }
    const rows = await Promise.all(targets.map(async ({ providerId, snapshot }) => {
      try {
        const provider = await fetchProviderCourse(providerId);
        const decision = classifyCourseSync(providerId, snapshot.data() as CourseRecord, provider);
        return { courseId: snapshot.id, providerId, provider, ...decision };
      } catch (error) {
        return { courseId: snapshot.id, providerId, provider: null, result: 'error', before: { latitude: null, longitude: null }, error: error instanceof Error ? error.message : 'Provider request failed.' };
      }
    }));
    const previewRef = previewCollection.doc();
    const fetchedAt = timestamp();
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MS).toISOString();
    await previewRef.create({ schema: 'golfriend.golf-api-sync-preview.v1', status: 'previewed', actorUid: request.auth.uid, fetchedAt, expiresAt, rows, usage, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await auditCollection.doc(previewRef.id).create({ schema: 'golfriend.golf-api-sync-audit.v1', eventType: 'preview', previewId: previewRef.id, actorUid: request.auth.uid, providerRequestsReserved: targets.length, usage, fetchedAt, rows, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { mode: 'preview', previewId: previewRef.id, expiresAt, providerRequestsReserved: targets.length, usage, results: rows };
  }

  if (mode !== 'apply') throw new HttpsError('invalid-argument', 'mode must be "preview" or "apply".');
  let input;
  try { input = parseApplyRequest(request.data); } catch (error) { throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid apply request.'); }
  const previewRef = previewCollection.doc(input.previewId);
  const applied = await db.runTransaction(async (tx) => {
    const preview = await tx.get(previewRef);
    if (!preview.exists) throw new HttpsError('not-found', 'Preview not found.');
    const data = preview.data() as { actorUid?: unknown; status?: unknown; expiresAt?: unknown; appliedResults?: unknown; rows?: unknown };
    if (data.actorUid !== request.auth!.uid) throw new HttpsError('permission-denied', 'Only the previewing staff member can apply this preview.');
    if (data.status === 'applied') return { idempotent: true, results: data.appliedResults ?? [] };
    if (data.status !== 'previewed' || typeof data.expiresAt !== 'string' || Date.parse(data.expiresAt) < Date.now() || !Array.isArray(data.rows) || data.rows.length > 25) throw new HttpsError('failed-precondition', 'Preview is invalid or expired; create a new preview.');
    const refs = data.rows.map((row) => courseCollection.doc(String((row as { courseId?: unknown }).courseId)));
    const fresh = await Promise.all(refs.map((ref) => tx.get(ref)));
    const results = fresh.map((snapshot, index) => {
      const row = data.rows![index] as { providerId?: unknown; provider?: ProviderCourse | null; result?: unknown };
      if (!snapshot.exists || typeof row.providerId !== 'string' || row.result === 'error') return { courseId: snapshot.id, result: 'conflict', reason: 'Course or preview evidence is unavailable.' };
      const decision = classifyCourseSync(row.providerId, snapshot.data() as CourseRecord, row.provider ?? null);
      if (decision.result === 'updated' && decision.after) tx.set(snapshot.ref, { latitude: decision.after.latitude, longitude: decision.after.longitude, lat: decision.after.latitude, lng: decision.after.longitude, gpsSource: 'golfapi', providerId: row.providerId, providerFetchedAt: timestamp(), updatedByUid: request.auth!.uid, apiImported: true }, { merge: true });
      return { courseId: snapshot.id, providerId: row.providerId, ...decision };
    });
    const applyAudit = auditCollection.doc(`${previewRef.id}_apply`);
    tx.create(applyAudit, { schema: 'golfriend.golf-api-sync-audit.v1', eventType: 'apply', previewId: previewRef.id, actorUid: request.auth!.uid, results, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(previewRef, { status: 'applied', appliedAt: admin.firestore.FieldValue.serverTimestamp(), appliedResults: results });
    return { idempotent: false, results };
  });
  return { mode: 'apply', previewId: input.previewId, ...applied };
});
