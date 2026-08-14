import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {randomUUID} from "node:crypto";
import {isActiveStaff} from "./authority.js";
import {assertQuotaAvailable, buildCourseGrowthRecord, COURSE_SYNC_RECEIPT_SCHEMA, deterministicReceiptId, normalizeCourseCandidates, planCourseUpserts, PROVIDER_CALLS_PER_COURSE, requireProviderConfiguration, RETRY_DELAYS_MS, type Candidate, withDeterministicRetry} from "./courseGrowth.js";
import {assertLeaseOwner, COURSE_INGESTION_RECOVERY_SCHEMA, deterministicRecoveryReceiptId, recoveryReconciliation, requireRecoveryConfiguration, shouldRecoverLease} from "./courseIngestionRecovery.js";

if (!admin.apps.length) admin.initializeApp();
const GOLF_API_KEY = defineSecret("GOLF_API_KEY");
const db = admin.firestore();
const API_BASE = "https://www.golfapi.io/api/v2.3";
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_COURSES_PER_COMMIT = 50;

async function requireActiveLease(jobRef: FirebaseFirestore.DocumentReference, ownerUid: string, leaseToken: string): Promise<void> {
  const snapshot = await jobRef.get();
  try { assertLeaseOwner(snapshot.data(), ownerUid, leaseToken, Date.now()); } catch (error) {
    throw new HttpsError("aborted", error instanceof Error ? error.message : "LEASE_OWNERSHIP_LOST");
  }
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validLatitude(value: number | null): value is number {
  return value !== null && value >= -90 && value <= 90;
}

function validLongitude(value: number | null): value is number {
  return value !== null && value >= -180 && value <= 180;
}

async function requireCoordinator(uid: string): Promise<void> {
  const adminUser = await db.collection("admin_users").doc(uid).get();
  if (!adminUser.exists || !isActiveStaff(adminUser.data())) {
    throw new HttpsError("permission-denied", "Course ingestion requires an authorised coordinator.");
  }
}

async function golfApiGet(path: string, apiKey: string, onAttempt: () => void | Promise<void> = () => {}): Promise<{data: any; callsUsed: number}> {
  const configuredKey = requireProviderConfiguration(apiKey);
  const result = await withDeterministicRetry(async () => {
    await onAttempt();
    const response = await fetch(`${API_BASE}${path}`, {headers: {Authorization: `Bearer ${configuredKey}`}});
    if (response.status === 403 || response.status === 429) throw new HttpsError("resource-exhausted", `Golf API quota rejected the request (${response.status}).`);
    if (!response.ok) throw new HttpsError("unavailable", `Golf API request failed (${response.status}).`);
    return response.json();
  }, (delay) => new Promise((resolve) => setTimeout(resolve, delay)), (error) => error instanceof HttpsError && error.code === "unavailable");
  return {data: result.value, callsUsed: result.attempts};
}

async function reserveQuota(requestedCalls: number): Promise<{remainingAfter: number}> {
  const usageRef = db.collection("platform").doc("golfApiUsage");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    let quota;
    try { quota = assertQuotaAvailable(snapshot.data(), requestedCalls); } catch (error) {
      const code = error instanceof Error ? error.message : "QUOTA_UNCONFIGURED";
      throw new HttpsError(code === "QUOTA_EXHAUSTED" ? "resource-exhausted" : "failed-precondition", code);
    }
    transaction.set(usageRef, {estimatedCallsUsed: quota.used + requestedCalls, lastReservedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    return {remainingAfter: quota.remainingAfter};
  });
}

export const previewCourseRegionImport = onCall({
  secrets: [GOLF_API_KEY],
  enforceAppCheck: true,
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);

  const latitude = finiteNumber(request.data?.latitude);
  const longitude = finiteNumber(request.data?.longitude);
  const radiusKm = Math.min(200, Math.max(1, Math.round(finiteNumber(request.data?.radiusKm) || 50)));
  if (!validLatitude(latitude) || !validLongitude(longitude)) {
    throw new HttpsError("invalid-argument", "Valid latitude and longitude are required.");
  }

  requireProviderConfiguration(GOLF_API_KEY.value());
  const previewReservation = RETRY_DELAYS_MS.length + 1;
  const quota = await reserveQuota(previewReservation);
  let previewCalls = 0;
  const discovery = await golfApiGet(
    `/clubs?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&radius=${radiusKm}`,
    GOLF_API_KEY.value(), () => {previewCalls++;},
  );
  const discovered = normalizeCourseCandidates(discovery.data);
  const refs = discovered.map((course) => db.collection("courses").doc(course.courseID));
  const existingSnapshots = refs.length ? await db.getAll(...refs) : [];
  const existingIds = new Set(existingSnapshots.filter((doc) => doc.exists).map((doc) => doc.id));
  const missing = planCourseUpserts(discovered, existingIds).create;

  const jobRef = db.collection("course_ingestion_jobs").doc();
  await jobRef.set({
    status: "previewed",
    requestedBy: request.auth.uid,
    region: {latitude, longitude, radiusKm},
    discoveredCount: discovered.length,
    existingCount: existingIds.size,
    missingCount: missing.length,
    candidates: missing.slice(0, MAX_COURSES_PER_COMMIT),
    truncated: missing.length > MAX_COURSES_PER_COMMIT,
    apiCallsUsed: previewCalls,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + JOB_TTL_MS),
  });

  await db.collection("platform").doc("golfApiUsage").set({estimatedCallsUsed: admin.firestore.FieldValue.increment(previewCalls - previewReservation), lastCallAt: admin.firestore.FieldValue.serverTimestamp(), lastPreviewJobId: jobRef.id}, {merge: true});

  return {
    jobId: jobRef.id,
    discovered: discovered.length,
    alreadyInFirebase: existingIds.size,
    newCoursesReady: Math.min(missing.length, MAX_COURSES_PER_COMMIT),
    remainingAfterBatch: Math.max(0, missing.length - MAX_COURSES_PER_COMMIT),
    apiCallsUsed: previewCalls,
    quotaRemainingAfter: quota.remainingAfter + (previewReservation - previewCalls),
    courses: missing.slice(0, MAX_COURSES_PER_COMMIT).map(({courseID, clubName, name, country}) =>
      ({courseID, clubName, name, country})),
  };
});

export const commitCourseRegionImport = onCall({
  secrets: [GOLF_API_KEY],
  enforceAppCheck: true,
  memory: "1GiB",
  timeoutSeconds: 540,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  const jobId = String(request.data?.jobId || "").trim();
  if (!jobId) throw new HttpsError("invalid-argument", "A preview job ID is required.");

  const jobRef = db.collection("course_ingestion_jobs").doc(jobId);
  requireProviderConfiguration(GOLF_API_KEY.value());
  const recoverySnapshot = await db.collection("platform").doc("courseIngestionRecovery").get();
  let recoveryConfig;
  try { recoveryConfig = requireRecoveryConfiguration(recoverySnapshot.data()); } catch {
    throw new HttpsError("failed-precondition", "RECOVERY_UNCONFIGURED");
  }
  const leaseToken = randomUUID();
  const leaseExpiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + recoveryConfig.leaseDurationMs);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || !job) throw new HttpsError("not-found", "Preview job not found.");
    if (job.requestedBy !== request.auth?.uid) throw new HttpsError("permission-denied", "This preview belongs to another coordinator.");
    if (job.status === "completed" || job.status === "completed_with_errors") return {job, replay: true};
    if (job.status !== "previewed") throw new HttpsError("failed-precondition", "Preview is already running or unavailable.");
    if (job.expiresAt?.toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Preview expired; run it again.");
    transaction.update(jobRef, {status: "running", startedAt: admin.firestore.FieldValue.serverTimestamp(), lease: {ownerUid: request.auth!.uid, token: leaseToken, expiresAt: leaseExpiresAt}});
    return {job, replay: false};
  });

  const receiptId = deterministicReceiptId(jobId);
  if (claimed.replay) return {...claimed.job.result, receiptId, replayed: true};

  const candidates = (Array.isArray(claimed.job.candidates) ? claimed.job.candidates : []).slice(0, MAX_COURSES_PER_COMMIT) as Candidate[];
  const reservedCalls = candidates.length * PROVIDER_CALLS_PER_COURSE * (RETRY_DELAYS_MS.length + 1);
  let quota;
  try { quota = await reserveQuota(reservedCalls); } catch (error) {
    await jobRef.set({status: "previewed", reservationFailedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    throw error;
  }
  await jobRef.set({quotaReservation: {reservedCalls, attemptedCalls: 0}}, {merge: true});
  let added = 0;
  let skippedExisting = 0;
  let reviewRequired = 0;
  let failed = 0;
  let apiCallsUsed = 0;
  const errors: Array<{courseID: string; message: string}> = [];

  for (const candidate of candidates) {
    await requireActiveLease(jobRef, request.auth.uid, leaseToken);
    const courseRef = db.collection("courses").doc(candidate.courseID);
    if ((await courseRef.get()).exists) {
      skippedExisting++;
      continue;
    }
    try {
      const recordAttempt = async () => { apiCallsUsed++; await jobRef.set({"quotaReservation.attemptedCalls": apiCallsUsed}, {merge: true}); };
      const courseResponse = await golfApiGet(`/courses/${encodeURIComponent(candidate.courseID)}`, GOLF_API_KEY.value(), recordAttempt);
      const course = courseResponse.data?.data || courseResponse.data || {};
      const coordinateResponse = await golfApiGet(`/coordinates/${encodeURIComponent(candidate.courseID)}`, GOLF_API_KEY.value(), recordAttempt);
      const coordinates: any = coordinateResponse.data?.data || coordinateResponse.data || {};

      const growthRecord = buildCourseGrowthRecord(candidate, course, coordinates);
      const record = {
        ...growthRecord,
        sourceJobId: jobId,
        cachedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      };

      const created = await db.runTransaction(async (transaction) => {
        const [leaseSnapshot, latest] = await Promise.all([transaction.get(jobRef), transaction.get(courseRef)]);
        try { assertLeaseOwner(leaseSnapshot.data(), request.auth!.uid, leaseToken, Date.now()); } catch (error) {
          throw new HttpsError("aborted", error instanceof Error ? error.message : "LEASE_OWNERSHIP_LOST");
        }
        if (latest.exists) return false;
        transaction.create(courseRef, record);
        return true;
      });
      if (created) {
        added++;
        if (growthRecord.requiresCoordinatorReview === true) reviewRequired++;
      } else {
        skippedExisting++;
      }
    } catch (error: any) {
      failed++;
      errors.push({courseID: candidate.courseID, message: error?.message || "Unknown ingestion error"});
      if (error instanceof HttpsError && error.code === "resource-exhausted") break;
      logger.error("Course ingestion failed", {jobId, courseID: candidate.courseID, error});
    }
  }

  const result = {added, skippedExisting, reviewRequired, failed, apiCallsUsed, errors: errors.slice(0, 20), quotaRemainingAfter: quota.remainingAfter + (reservedCalls - apiCallsUsed)};
  await requireActiveLease(jobRef, request.auth.uid, leaseToken);
  const batch = db.batch();
  batch.set(jobRef, {
    status: failed > 0 ? "completed_with_errors" : "completed",
    result,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  batch.set(db.collection("platform").doc("golfApiUsage"), {
    estimatedCallsUsed: admin.firestore.FieldValue.increment(apiCallsUsed - reservedCalls),
    lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
    lastCommitJobId: jobId,
    lastCommitResult: result,
  }, {merge: true});
  batch.create(db.collection("course_sync_receipts").doc(receiptId), {
    schemaVersion: COURSE_SYNC_RECEIPT_SCHEMA, receiptId, jobId, requestedBy: request.auth.uid,
    status: failed > 0 ? "completed_with_errors" : "completed", result,
    provider: {state: "configured", externalTransmission: false},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return {...result, receiptId, replayed: false};
});

export const recoverExpiredCourseIngestionJobs = onCall({enforceAppCheck: true}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  const configSnapshot = await db.collection("platform").doc("courseIngestionRecovery").get();
  let config;
  try { config = requireRecoveryConfiguration(configSnapshot.data()); } catch {
    throw new HttpsError("failed-precondition", "RECOVERY_UNCONFIGURED");
  }
  const jobs = await db.collection("course_ingestion_jobs").where("status", "==", "running").limit(config.maxJobs).get();
  let recovered = 0;
  for (const snapshot of jobs.docs) {
    const observed = snapshot.data();
    const token = String(observed.lease?.token || "");
    if (!shouldRecoverLease(observed, token, Date.now())) continue;
    const receiptId = deterministicRecoveryReceiptId(snapshot.id, token);
    const didRecover = await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(snapshot.ref);
      const latest = latestSnapshot.data();
      if (!shouldRecoverLease(latest, token, Date.now())) return false;
      const reconciliation = recoveryReconciliation(latest);
      transaction.update(snapshot.ref, {status: "recovered", recoveredAt: admin.firestore.FieldValue.serverTimestamp(), recoveredBy: request.auth!.uid, recoveryReceiptId: receiptId, recovery: reconciliation});
      transaction.set(db.collection("platform").doc("golfApiUsage"), {estimatedCallsUsed: admin.firestore.FieldValue.increment(-reconciliation.releaseCalls), lastRecoveryJobId: snapshot.id}, {merge: true});
      transaction.create(db.collection("course_sync_recovery_receipts").doc(receiptId), {schemaVersion: COURSE_INGESTION_RECOVERY_SCHEMA, receiptId, jobId: snapshot.id, leaseTokenHash: receiptId.slice("recovery_".length), recoveredBy: request.auth!.uid, reconciliation, providerExecution: "not_retried", createdAt: admin.firestore.FieldValue.serverTimestamp()});
      return true;
    });
    if (didRecover) recovered++;
  }
  return {schemaVersion: COURSE_INGESTION_RECOVERY_SCHEMA, inspected: jobs.size, recovered};
});

export const listCourseSyncReceipts = onCall({enforceAppCheck: true}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  const snapshot = await db.collection("course_sync_receipts").orderBy("createdAt", "desc").limit(20).get();
  return {schemaVersion: COURSE_SYNC_RECEIPT_SCHEMA, receipts: snapshot.docs.map((doc) => {
    const value = doc.data();
    return {receiptId: doc.id, jobId: value.jobId, status: value.status, result: value.result, createdAt: value.createdAt?.toDate?.().toISOString?.() || null};
  })};
});
