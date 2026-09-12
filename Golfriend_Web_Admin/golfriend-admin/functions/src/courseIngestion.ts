import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {randomUUID} from "node:crypto";
import {isActiveStaff} from "./authority.js";
import {assertQuotaAvailable, buildClubhouseRecord, buildCourseGrowthRecord, classifyClubhouse, COURSE_SYNC_RECEIPT_SCHEMA, deterministicReceiptId, expandClubShells, hasCompleteEmbeddedCourses, normalizeClubDetailClubhouses, planCourseUpserts, previewProviderAttemptReservation, providerClubs, PROVIDER_CALLS_PER_COURSE, requireProviderConfiguration, RETRY_DELAYS_MS, type Candidate, type ProviderClubhouse, withDeterministicRetry} from "./courseGrowth.js";
import {assertLeaseOwner, COURSE_INGESTION_RECOVERY_SCHEMA, deterministicRecoveryReceiptId, recoveryReconciliation, requireRecoveryConfiguration, shouldRecoverLease} from "./courseIngestionRecovery.js";
import {COURSE_OPERATIONS_SCHEMA, COURSE_RETRY_SCHEMA, countryCode, deterministicRetryJobId, projectCountryGrowth, projectQuota, retryableStatus, retryCandidates} from "./courseOperationsProjection.js";
import {distanceKm, inspectClubRegion, normalizeClubInspectionInput} from "./courseInspection.js";
import {MAX_RECONCILIATION_CLUBHOUSES, MAX_RECONCILIATION_WRITES, assertExecutablePlan, hasEquivalentPatch, planCourseClubhouseReconciliation, reconciliationExecutionDisposition, reconciliationReceiptId, type ReconciliationPlan} from "./courseClubhouseReconciliation.js";
import {assertCataloguePreviewFresh, catalogueProviderBatch, encodeCataloguePreviewCursor, MAX_CATALOGUE_PREVIEW_SCAN_ROWS, parseCataloguePreviewRequest} from "./courseCataloguePreview.js";
import {isValidProviderId} from "./courseSync.js";

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

function reconciliationTargetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECONCILIATION_CLUBHOUSES) throw new HttpsError("invalid-argument", "A bounded providerClubIds list is required.");
  const ids = [...new Set(value.map((id) => String(id || "").trim()))].sort();
  if (ids.length !== value.length || ids.some((id) => !isValidProviderId(id))) throw new HttpsError("invalid-argument", "providerClubIds must be distinct valid provider IDs.");
  return ids;
}

async function reconciliationPlanFor(providerClubIds: readonly string[]): Promise<{plan: ReconciliationPlan; courseRowsMeasured: number; providerClubhouses: ProviderClubhouse[]}> {
  if (!providerClubIds.length) return {plan: planCourseClubhouseReconciliation([], [], []), courseRowsMeasured: 0, providerClubhouses: []};
  const [clubhouseSnapshots, courseSnapshots, providerClubhouses] = await Promise.all([
    db.getAll(...providerClubIds.map((id) => db.collection("clubhouses").doc(id))),
    Promise.all(providerClubIds.map((id) => db.collection("courses").where("providerClubId", "==", id).limit(MAX_RECONCILIATION_WRITES).get())),
    Promise.all(providerClubIds.map(async (id) => {
      const response = await golfApiGet(`/clubs/${encodeURIComponent(id)}`, GOLF_API_KEY.value());
      const normalized = normalizeClubDetailClubhouses({clubID: id}, response.data);
      const clubhouse = normalized.find((row) => row.providerClubId === id);
      if (!clubhouse) throw new HttpsError("failed-precondition", `PROVIDER_CLUB_DETAIL_MISSING:${id}`);
      return clubhouse;
    })),
  ]);
  const existingCourses = courseSnapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})));
  const existingClubhouses = clubhouseSnapshots.filter((doc) => doc.exists).map((doc) => ({id: doc.id, ...doc.data()}));
  return {plan: planCourseClubhouseReconciliation(providerClubhouses, existingCourses, existingClubhouses), courseRowsMeasured: existingCourses.length, providerClubhouses};
}

type CatalogueCourseRow = Record<string, unknown>;
function catalogueRows(snapshot: FirebaseFirestore.QuerySnapshot): CatalogueCourseRow[] { return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})); }
function catalogueWindowHash(rows: readonly CatalogueCourseRow[]): string { return catalogueProviderBatch(rows, null, MAX_CATALOGUE_PREVIEW_SCAN_ROWS).sourceWindowHash; }
async function cataloguePreviewSourceWindow(): Promise<CatalogueCourseRow[]> {
  // This fixed, bounded first window is re-read before every continuation.  A changed
  // window invalidates the signed continuation rather than allowing mixed previews.
  return catalogueRows(await db.collection("courses").orderBy("providerClubId").limit(MAX_CATALOGUE_PREVIEW_SCAN_ROWS).get());
}
async function cataloguePreviewPage(afterProviderClubId: string | null): Promise<CatalogueCourseRow[]> {
  let query: FirebaseFirestore.Query = db.collection("courses").orderBy("providerClubId");
  if (afterProviderClubId) query = query.startAfter(afterProviderClubId);
  return catalogueRows(await query.limit(MAX_CATALOGUE_PREVIEW_SCAN_ROWS).get());
}
async function catalogueInvalidProviderRows(afterCourseDocumentId: string | null): Promise<FirebaseFirestore.QuerySnapshot> {
  let query: FirebaseFirestore.Query = db.collection("courses").orderBy(admin.firestore.FieldPath.documentId());
  if (afterCourseDocumentId) query = query.startAfter(afterCourseDocumentId);
  return query.limit(MAX_CATALOGUE_PREVIEW_SCAN_ROWS).get();
}
function previewMetrics(plan: ReconciliationPlan, courseRowsMeasured: number, providerClubhouses: readonly ProviderClubhouse[], invalidProviderClubIdRows = 0) {
  const providerContactFactsAvailable = providerClubhouses.filter((clubhouse) => Boolean(clubhouse.phone || clubhouse.mobile || clubhouse.email || clubhouse.website || clubhouse.contactPhone || clubhouse.contactEmail || clubhouse.bookingUrl || clubhouse.reservationUrl || clubhouse.teeTimeUrl || clubhouse.reservationPhone || clubhouse.reservationEmail)).length;
  const proposedWrites = plan.clubhouseUpserts.length + plan.coursePatches.length;
  return {courseRowsMeasured, providerGroupsInspected: plan.targetProviderClubIds.length, provenClubHouses: plan.clubhouseUpserts.length, safelyLinkableCourses: plan.coursePatches.length, unchangedTrustedLinks: plan.unchangedCourseLinks.length, ambiguousGroups: plan.ambiguousGroups.length, invalidGeography: plan.invalidGeography.length, invalidProviderClubIdRows, providerContactFactsAvailable, bookingAuthorityUnavailable: plan.bookingAuthorityUnavailable, enrichmentRequired: plan.ambiguousGroups.length + plan.invalidGeography.length + plan.unmatchedProviderLayouts.length + invalidProviderClubIdRows, proposedWrites, productionWrites: 0};
}
function previewEvidence(providerClubhouses: readonly ProviderClubhouse[]) {
  const evidence = providerClubhouses.map((clubhouse) => {
    const classification = classifyClubhouse(clubhouse);
    const distanceFromPattayaKm = distanceKm({latitude: 12.9236, longitude: 100.8825}, clubhouse.latitude, clubhouse.longitude);
    return {providerClubId: clubhouse.providerClubId, providerPropertyId: clubhouse.providerPropertyId, providerBookable: clubhouse.providerBookable, providerClubName: clubhouse.providerClubName, providerCourseIds: clubhouse.layouts.map((layout) => layout.providerCourseId).sort(), coordinates: {latitude: clubhouse.latitude, longitude: clubhouse.longitude}, status: classification.status === "proven" ? "PROVEN" : "AMBIGUOUS", evidence: classification.reason, providerContactFactsAvailable: Boolean(clubhouse.phone || clubhouse.mobile || clubhouse.email || clubhouse.website || clubhouse.contactPhone || clubhouse.contactEmail || clubhouse.bookingUrl || clubhouse.reservationUrl || clubhouse.teeTimeUrl || clubhouse.reservationPhone || clubhouse.reservationEmail), bookingAuthorityStatus: "unavailable" as const, distanceFromPattayaKm, within50Km: distanceFromPattayaKm !== null && distanceFromPattayaKm <= 50};
  });
  return {siamEvidence: evidence.filter((row) => row.providerClubName.toLocaleLowerCase().includes("siam country club")), seoulEvidence: evidence.filter((row) => row.providerClubName.toLocaleLowerCase().includes("seoul") && row.providerClubName.toLocaleLowerCase().includes("siam"))};
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
  let previewReservation = RETRY_DELAYS_MS.length + 1;
  let quota = await reserveQuota(previewReservation);
  let previewCalls = 0;
  const discovery = await golfApiGet(
    `/clubs?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&radius=${radiusKm}`,
    GOLF_API_KEY.value(), () => {previewCalls++;},
  );
  const clubShellCount = providerClubs(discovery.data).filter((club) => !hasCompleteEmbeddedCourses(club)).length;
  const detailReservation = previewProviderAttemptReservation(clubShellCount) - previewReservation;
  try {
    if (detailReservation) quota = await reserveQuota(detailReservation);
    previewReservation += detailReservation;
  } catch (error) {
    await db.collection("platform").doc("golfApiUsage").set({estimatedCallsUsed: admin.firestore.FieldValue.increment(previewCalls - previewReservation), lastCallAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    throw error;
  }
  let expansion;
  try {
    expansion = await expandClubShells(discovery.data, async (clubID) => {
      const detail = await golfApiGet(`/clubs/${encodeURIComponent(clubID)}`, GOLF_API_KEY.value(), () => {previewCalls++;});
      return detail.data;
    });
  } catch (error) {
    await db.collection("platform").doc("golfApiUsage").set({estimatedCallsUsed: admin.firestore.FieldValue.increment(previewCalls - previewReservation), lastCallAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
    throw error;
  }
  const discovered = expansion.candidates;
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
    // Bounded authoritative club-house facts for the later approved commit; layouts remain separate.
    clubhouses: expansion.clubhouses.slice(0, MAX_COURSES_PER_COMMIT),
    truncated: missing.length > MAX_COURSES_PER_COMMIT,
    apiCallsUsed: previewCalls,
    clubDetailCallsReserved: detailReservation,
    clubShellsExpanded: expansion.expandedClubIds,
    unresolvedClubShells: expansion.unresolvedClubShells,
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

/** Credentialed inspection boundary only: Auth/App Check protected and deliberately Firestore-write-free. */
export const inspectGolfApiClubRegion = onCall({
  secrets: [GOLF_API_KEY],
  enforceAppCheck: true,
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  let input;
  try { input = normalizeClubInspectionInput(request.data); } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "INVALID_INSPECTION_INPUT");
  }
  requireProviderConfiguration(GOLF_API_KEY.value());
  let providerCallsUsed = 0;
  const inspection = await inspectClubRegion(input, async (path) => {
    const response = await golfApiGet(path, GOLF_API_KEY.value(), () => {providerCallsUsed++;});
    return response.data;
  });
  return {...inspection, summary: {...inspection.summary, providerCallsUsed}};
});

/** Bounded read-only plan. It intentionally creates no job, quota, receipt, or catalogue record. */
export const previewCourseClubhouseReconciliation = onCall({
  secrets: [GOLF_API_KEY], enforceAppCheck: true, memory: "512MiB", timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  let previewRequest;
  try { previewRequest = parseCataloguePreviewRequest(request.data, GOLF_API_KEY.value()); } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_CATALOGUE_PREVIEW_REQUEST";
    throw new HttpsError("invalid-argument", message);
  }
  requireProviderConfiguration(GOLF_API_KEY.value());
  if (previewRequest.mode === "explicit") {
    const result = await reconciliationPlanFor(previewRequest.providerClubIds);
    return {...result.plan, mode: "explicit", summary: {...previewMetrics(result.plan, result.courseRowsMeasured, result.providerClubhouses), productionWrites: 0, providerClubGroups: previewRequest.providerClubIds.length, provenClubhouses: result.plan.clubhouseUpserts.length, coursesSafelyLinkable: result.plan.coursePatches.length, unchangedCourseLinks: result.plan.unchangedCourseLinks.length, unmatchedProviderLayouts: result.plan.unmatchedProviderLayouts.length}};
  }
  const sourceWindow = await cataloguePreviewSourceWindow();
  const sourceWindowHash = catalogueWindowHash(sourceWindow);
  try { assertCataloguePreviewFresh(previewRequest.cursor, sourceWindowHash); } catch (error) { throw new HttpsError("aborted", error instanceof Error ? error.message : "STALE_PREVIEW"); }
  const rows = await cataloguePreviewPage(previewRequest.cursor?.afterProviderClubId || null);
  const inventorySnapshot = await catalogueInvalidProviderRows(previewRequest.cursor?.afterCourseDocumentId || null);
  const page = catalogueProviderBatch(rows, previewRequest.cursor?.afterProviderClubId || null, previewRequest.batchSize);
  const inventory = catalogueProviderBatch(catalogueRows(inventorySnapshot), null, MAX_CATALOGUE_PREVIEW_SCAN_ROWS);
  const result = await reconciliationPlanFor(page.providerClubIds);
  const lastProviderClubId = page.lastScannedProviderClubId;
  const lastCourseDocumentId = inventorySnapshot.empty ? null : inventorySnapshot.docs[inventorySnapshot.docs.length - 1].id;
  const complete = rows.length < MAX_CATALOGUE_PREVIEW_SCAN_ROWS && inventorySnapshot.size < MAX_CATALOGUE_PREVIEW_SCAN_ROWS;
  const nextCursor = complete || (!lastProviderClubId && !lastCourseDocumentId) ? null : encodeCataloguePreviewCursor({version: 1, afterProviderClubId: lastProviderClubId, afterCourseDocumentId: lastCourseDocumentId, sourceWindowHash}, GOLF_API_KEY.value());
  return {...result.plan, mode: "catalogue", batch: {providerClubIds: page.providerClubIds, count: page.providerClubIds.length}, nextCursor, complete, metrics: {...previewMetrics(result.plan, result.courseRowsMeasured, result.providerClubhouses, inventory.invalidProviderClubIdRows), productionWrites: 0}, ambiguousGroups: result.plan.ambiguousGroups, invalidGeography: result.plan.invalidGeography, ...previewEvidence(result.providerClubhouses), planHash: result.plan.planHash, sourceStateHash: result.plan.sourceStateHash};
});

/** Explicit hash-bound executor. Deployment alone does nothing; caller must provide a reviewed plan and source hash. */
export const executeCourseClubhouseReconciliation = onCall({
  secrets: [GOLF_API_KEY], enforceAppCheck: true, memory: "512MiB", timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  const providerClubIds = reconciliationTargetIds(request.data?.providerClubIds);
  const approvedPlanHash = String(request.data?.approvedPlanHash || "").trim();
  const expectedSourceStateHash = String(request.data?.sourceStateHash || "").trim();
  if (!/^[a-f0-9]{64}$/.test(approvedPlanHash) || !/^[a-f0-9]{64}$/.test(expectedSourceStateHash)) throw new HttpsError("invalid-argument", "Exact approved planHash and sourceStateHash are required.");
  const receiptId = reconciliationReceiptId(approvedPlanHash);
  const receiptRef = db.collection("course_clubhouse_backfill_receipts").doc(receiptId);
  const existingReceipt = await receiptRef.get();
  if (reconciliationExecutionDisposition(existingReceipt.exists) === "replayed") return {receiptId, replayed: true, result: existingReceipt.data()?.result || null};
  requireProviderConfiguration(GOLF_API_KEY.value());
  const {plan} = await reconciliationPlanFor(providerClubIds);
  if (plan.sourceStateHash !== expectedSourceStateHash) throw new HttpsError("aborted", "STALE_RECONCILIATION_PLAN");
  if (plan.ambiguousGroups.length) throw new HttpsError("failed-precondition", "AMBIGUOUS_CLUBHOUSE_HIERARCHY");
  try { assertExecutablePlan(plan, approvedPlanHash, plan); } catch (error) { throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "APPROVED_PLAN_HASH_MISMATCH"); }
  const refs = [...plan.clubhouseUpserts.map((op) => db.collection("clubhouses").doc(op.id)), ...plan.coursePatches.map((op) => db.collection("courses").doc(op.id))];
  const result = await db.runTransaction(async (transaction) => {
    const [latestReceipt, ...snapshots] = await Promise.all([transaction.get(receiptRef), ...refs.map((ref) => transaction.get(ref))]);
    if (latestReceipt.exists) return {replayed: true, result: latestReceipt.data()?.result || null};
    let writes = 0; let cursor = 0;
    for (const operation of plan.clubhouseUpserts) { const existing = snapshots[cursor++]; if (!hasEquivalentPatch(existing.data(), operation.patch)) { transaction.set(existing.ref, operation.patch, {merge: true}); writes++; } }
    for (const operation of plan.coursePatches) { const existing = snapshots[cursor++]; if (!existing.exists) throw new HttpsError("aborted", "STALE_RECONCILIATION_PLAN"); if (!hasEquivalentPatch(existing.data(), operation.patch)) { transaction.set(existing.ref, operation.patch, {merge: true}); writes++; } }
    if (writes > MAX_RECONCILIATION_WRITES) throw new HttpsError("failed-precondition", "RECONCILIATION_WRITE_LIMIT_EXCEEDED");
    const summary = {clubhouseUpserts: plan.clubhouseUpserts.length, coursePatches: plan.coursePatches.length, ambiguousGroups: plan.ambiguousGroups.length, invalidGeography: plan.invalidGeography.length, unchangedCourseLinks: plan.unchangedCourseLinks.length, unmatchedProviderLayouts: plan.unmatchedProviderLayouts.length, bookingAuthorityUnavailable: plan.bookingAuthorityUnavailable, writes, deletes: 0, creates: 0};
    transaction.create(receiptRef, {schemaVersion: plan.schemaVersion, receiptId, immutable: true, action: "course_clubhouse_reconciliation", approvedPlanHash, sourceStateHash: plan.sourceStateHash, targetProviderClubIds: plan.targetProviderClubIds, result: summary, createdBy: request.auth!.uid, createdAt: admin.firestore.FieldValue.serverTimestamp()});
    return {replayed: false, result: summary};
  });
  return {receiptId, ...result};
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
  const clubhouses = (Array.isArray(claimed.job.clubhouses) ? claimed.job.clubhouses : []).slice(0, MAX_COURSES_PER_COMMIT) as ProviderClubhouse[];
  const clubhouseByProviderId = new Map(clubhouses.map((clubhouse) => [clubhouse.providerClubId, clubhouse]));
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
  const countryBreakdown:Record<string,{added:number;updated:number;failed:number}> = {};
  const countryRow=(candidate:Candidate)=>countryBreakdown[countryCode(candidate.country)] ||= {added:0,updated:0,failed:0};
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
        const clubhouse = candidate.providerClubId ? clubhouseByProviderId.get(candidate.providerClubId) : undefined;
        if (clubhouse) transaction.set(db.collection("clubhouses").doc(clubhouse.providerClubId), buildClubhouseRecord(clubhouse), {merge: true});
        transaction.create(courseRef, record);
        return true;
      });
      if (created) {
        added++;
        countryRow(candidate).added++;
        if (growthRecord.requiresCoordinatorReview === true) reviewRequired++;
      } else {
        skippedExisting++;
      }
    } catch (error: any) {
      failed++;
      countryRow(candidate).failed++;
      errors.push({courseID: candidate.courseID, message: error?.message || "Unknown ingestion error"});
      if (error instanceof HttpsError && error.code === "resource-exhausted") break;
      logger.error("Course ingestion failed", {jobId, courseID: candidate.courseID, error});
    }
  }

  const result = {added, updated:0, skippedExisting, reviewRequired, failed, apiCallsUsed, countryBreakdown, errors: errors.slice(0, 20), quotaRemainingAfter: quota.remainingAfter + (reservedCalls - apiCallsUsed)};
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

export const getCourseIngestionOperations = onCall({enforceAppCheck:true},async(request)=>{
  if(!request.auth?.uid)throw new HttpsError("unauthenticated","Sign in to Admin first.");await requireCoordinator(request.auth.uid);
  const [coursesSnapshot,receiptsSnapshot,quotaSnapshot,jobsSnapshot]=await Promise.all([
    db.collection("courses").get(),db.collection("course_sync_receipts").orderBy("createdAt","desc").limit(100).get(),db.collection("platform").doc("golfApiUsage").get(),db.collection("course_ingestion_jobs").where("status","in",["completed_with_errors","recovered"]).limit(20).get(),
  ]);
  const receipts=receiptsSnapshot.docs.map(doc=>{const value=doc.data();return {...value,createdAt:value.createdAt?.toDate?.().toISOString?.()||null};});
  const failedJobs=jobsSnapshot.docs.map(doc=>{const value=doc.data();return {jobId:doc.id,status:value.status,failed:Number(value.result?.failed)||0,createdAt:value.createdAt?.toDate?.().toISOString?.()||null,retryJobId:value.retryJobId||null};});
  return {schemaVersion:COURSE_OPERATIONS_SCHEMA,countries:projectCountryGrowth(coursesSnapshot.docs.map(doc=>doc.data()),receipts),quota:projectQuota(quotaSnapshot.data()),failedJobs};
});

export const prepareCourseIngestionRetry = onCall({enforceAppCheck:true},async(request)=>{
  if(!request.auth?.uid)throw new HttpsError("unauthenticated","Sign in to Admin first.");await requireCoordinator(request.auth.uid);
  const sourceJobId=String(request.data?.jobId||"").trim();if(!sourceJobId)throw new HttpsError("invalid-argument","A failed job ID is required.");
  const sourceRef=db.collection("course_ingestion_jobs").doc(sourceJobId);const sourceSnapshot=await sourceRef.get();const source=sourceSnapshot.data();
  if(!sourceSnapshot.exists||!source)throw new HttpsError("not-found","Failed job not found.");if(!retryableStatus(source.status))throw new HttpsError("failed-precondition","Job is not retryable.");
  const candidates=Array.isArray(source.candidates)?source.candidates.slice(0,MAX_COURSES_PER_COMMIT):[];const refs=candidates.map((item:any)=>db.collection("courses").doc(String(item.courseID||"")));const existing=refs.length?await db.getAll(...refs):[];
  const pending=retryCandidates(candidates,new Set(existing.filter(doc=>doc.exists).map(doc=>doc.id)));if(!pending.length)throw new HttpsError("failed-precondition","No unresolved courses remain.");
  const retryJobId=deterministicRetryJobId(sourceJobId),retryRef=db.collection("course_ingestion_jobs").doc(retryJobId);
  const result=await db.runTransaction(async transaction=>{const [latest,retry]=await Promise.all([transaction.get(sourceRef),transaction.get(retryRef)]);const value=latest.data();if(!value||!retryableStatus(value.status))throw new HttpsError("failed-precondition","Job is no longer retryable.");if(retry.exists)return {jobId:retryJobId,replayed:true,count:Number(retry.data()?.missingCount)||pending.length};
    transaction.create(retryRef,{status:"previewed",requestedBy:request.auth!.uid,retryOf:sourceJobId,retrySchemaVersion:COURSE_RETRY_SCHEMA,candidates:pending,missingCount:pending.length,createdAt:admin.firestore.FieldValue.serverTimestamp(),expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+JOB_TTL_MS)});transaction.update(sourceRef,{retryJobId,retryPreparedAt:admin.firestore.FieldValue.serverTimestamp()});return {jobId:retryJobId,replayed:false,count:pending.length};});
  return {schemaVersion:COURSE_RETRY_SCHEMA,...result};
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
