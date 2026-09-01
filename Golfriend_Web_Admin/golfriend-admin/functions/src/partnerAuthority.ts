import * as admin from "firebase-admin";
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {createHash} from "node:crypto";
import {isActiveDirector} from "./authority.js";

type ApplicationState = "draft" | "submitted" | "evidence_requested" | "declined" | "approved";
type ActorAuthority = "applicant" | "active_director";

const APPLICATIONS = "partner_applications";
const ORGANISATIONS = "partner_organisations";
const MEMBERSHIPS = "partner_memberships";
const EVIDENCE = "partner_application_evidence";
const AUDIT = "partner_authority_audit";
// src/firebaseConfig.ts declares asia-southeast1 as the canonical V2 callable
// region. Partner Authority must never silently use the SDK us-central1 default.
export const PARTNER_AUTHORITY_REGION = "asia-southeast1";
const PARTNER_AUTHORITY_CALLABLE_OPTIONS = {
  region: PARTNER_AUTHORITY_REGION,
  memory: "256MiB" as const,
  // Partner application data, private evidence access, and Director decisions
  // must all reject missing or invalid App Check before a handler can read or
  // mutate authority state.
  enforceAppCheck: true,
};
const ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
export const PARTNER_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const PARTNER_EVIDENCE_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const PARTNER_EVIDENCE_CONTENT_TYPE_SET = new Set<string>(PARTNER_EVIDENCE_CONTENT_TYPES);

// firebase-functions@7.2.5 does not copy a callable's per-function `region`
// option into its V2 endpoint manifest. Keep the option above for source
// clarity and set the emitted manifest explicitly, without changing global
// V2 options for unrelated Functions in this codebase.
function partnerAuthorityCallable<T extends {__endpoint: {region?: string[]}}>(callable: T): T {
  callable.__endpoint.region = [PARTNER_AUTHORITY_REGION];
  return callable;
}

type Draft = {
  partnershipType: string;
  legalBusiness: {
    legalName: string;
    countryOfRegistration: string;
    registrationOrTaxId: string;
    website?: string;
  };
  golfCourse: {
    name: string;
    location: string;
    address: string;
    phone: string;
  };
};

type ReplayEntry = {
  action: string;
  actorUid: string;
  payloadHash: string;
  auditEventId: string;
  result: Record<string, unknown>;
};

type PartnerAuthorityErrorCode = "unauthenticated" | "permission-denied" | "not-found" | "invalid-argument" | "failed-precondition" | "already-exists";

function fail(code: PartnerAuthorityErrorCode, message: string): never {
  throw new HttpsError(code, message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid-argument", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 240, optional = false): string | undefined {
  if (optional && (value === undefined || value === null || String(value).trim() === "")) return undefined;
  if (typeof value !== "string") return fail("invalid-argument", `${label} must be text.`);
  const result = value.trim();
  if (!result || result.length > max) return fail("invalid-argument", `${label} is required and must be at most ${max} characters.`);
  return result;
}

function applicationId(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    return fail("invalid-argument", "applicationId is invalid.");
  }
  return value;
}

function idempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value)) {
    return fail("invalid-argument", "idempotencyKey is invalid.");
  }
  return value;
}

function evidenceId(value: unknown): string {
  return applicationId(value);
}

function evidenceContentType(value: unknown): string {
  const candidate = text(value, "contentType", 160)!;
  if (!PARTNER_EVIDENCE_CONTENT_TYPE_SET.has(candidate)) {
    return fail("invalid-argument", "Evidence contentType must be PDF, JPEG, or PNG.");
  }
  return candidate;
}

function evidenceFileName(value: unknown): string {
  const name = text(value, "fileName", 240)!;
  if (/[\\/\0]/.test(name)) return fail("invalid-argument", "fileName is invalid.");
  return name;
}

function evidenceStoragePath(appId: string, evidenceIdValue: string): string {
  return `partner_application_evidence/${appId}/${evidenceIdValue}/original`;
}

function rejectClientIntegrity(input: Record<string, unknown>) {
  for (const key of ["sha256", "checksum", "storagePath", "storageState", "ready", "byteSize"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      return fail("invalid-argument", `${key} is server-owned.`);
    }
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanDraft(raw: unknown): Draft {
  const input = object(raw, "draft");
  const legal = object(input.legalBusiness, "legalBusiness");
  const course = object(input.golfCourse, "golfCourse");
  return {
    partnershipType: text(input.partnershipType, "partnershipType", 80)!,
    legalBusiness: {
      legalName: text(legal.legalName, "legalBusiness.legalName")!,
      countryOfRegistration: text(legal.countryOfRegistration, "legalBusiness.countryOfRegistration", 120)!,
      registrationOrTaxId: text(legal.registrationOrTaxId, "legalBusiness.registrationOrTaxId", 160)!,
      ...(text(legal.website, "legalBusiness.website", 512, true) ? {website: text(legal.website, "legalBusiness.website", 512, true)} : {}),
    },
    golfCourse: {
      name: text(course.name, "golfCourse.name")!,
      location: text(course.location, "golfCourse.location", 160)!,
      address: text(course.address, "golfCourse.address", 500)!,
      phone: text(course.phone, "golfCourse.phone", 80)!,
    },
  };
}

function ownApplication(snapshot: admin.firestore.DocumentSnapshot, uid: string): Record<string, unknown> {
  if (!snapshot.exists) return fail("not-found", "Partner application was not found.");
  const data = snapshot.data() as Record<string, unknown>;
  if (data.ownerUid !== uid) return fail("permission-denied", "This partner application belongs to another applicant.");
  return data;
}

function state(data: Record<string, unknown>): ApplicationState {
  const candidate = data.state;
  if (candidate === "draft" || candidate === "submitted" || candidate === "evidence_requested" || candidate === "declined" || candidate === "approved") return candidate;
  return fail("failed-precondition", "Partner application has an invalid authority state.");
}

function replay(data: Record<string, unknown>, key: string, action: string, uid: string, payloadHash: string): ReplayEntry | null {
  const entries = objectOrEmpty(data.replayKeys);
  const entry = entries[key];
  if (!entry) return null;
  const stored = object(entry, "stored replay");
  if (stored.action !== action || stored.actorUid !== uid || stored.payloadHash !== payloadHash) {
    return fail("already-exists", "idempotencyKey was already used with different request data.");
  }
  return stored as ReplayEntry;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

function setReplay(data: Record<string, unknown>, key: string, value: ReplayEntry): Record<string, unknown> {
  return {...objectOrEmpty(data.replayKeys), [key]: value};
}

function auditPayload(applicationIdValue: string, action: string, actorUid: string, actorAuthority: ActorAuthority, priorState: ApplicationState | null, newState: ApplicationState, idempotency: string, reason?: string): Record<string, unknown> {
  return {
    applicationId: applicationIdValue,
    action,
    actorUid,
    actorAuthority,
    priorState,
    newState,
    ...(reason ? {reason} : {}),
    idempotencyKey: idempotency,
    replayed: false,
    createdAt: serverTimestamp(),
  };
}

export function requireAuthenticatedUid(uid: string | undefined): string {
  if (!uid) return fail("unauthenticated", "Sign in to continue.");
  return uid;
}

export async function requireDirectorActor(db: Firestore, uid: string | undefined): Promise<string> {
  const callerUid = requireAuthenticatedUid(uid);
  const director = await db.collection("admin_users").doc(callerUid).get();
  if (!director.exists || !isActiveDirector(director.data())) {
    return fail("permission-denied", "Only an active Director can review partner applications.");
  }
  return callerUid;
}

export async function savePartnerApplication(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const key = idempotencyKey(input.idempotencyKey);
  const draft = cleanDraft(input.draft);
  const payloadHash = digest({draft});
  const suppliedId = input.applicationId === undefined ? null : applicationId(input.applicationId);

  const ref = suppliedId ? db.collection(APPLICATIONS).doc(suppliedId) : db.collection(APPLICATIONS).doc();
  return db.runTransaction(async (tx) => {
    // The creation-key query is part of the same transaction as the document
    // create, so two concurrent retries cannot create two applications.
    if (!suppliedId) {
      const existing = await tx.get(db.collection(APPLICATIONS)
        .where("ownerUid", "==", uid)
        .where("creationIdempotencyKey", "==", key));
      if (existing.size > 1) return fail("failed-precondition", "Duplicate partner application creation key detected.");
      if (existing.size === 1) {
        const data = ownApplication(existing.docs[0], uid);
        const prior = replay(data, key, "draft_saved", uid, payloadHash);
        if (prior) return {...prior.result, replayed: true};
        return fail("already-exists", "creation idempotencyKey was already used with different request data.");
      }
    }
    const snapshot = await tx.get(ref);
    const auditRef = db.collection(AUDIT).doc();
    if (!snapshot.exists) {
      const result = {applicationId: ref.id, state: "draft"};
      const entry: ReplayEntry = {action: "draft_saved", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
      tx.create(ref, {
        ownerUid: uid,
        state: "draft",
        draft,
        creationIdempotencyKey: key,
        replayKeys: {[key]: entry},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.create(auditRef, auditPayload(ref.id, "draft_saved", uid, "applicant", null, "draft", key));
      return result;
    }

    const current = ownApplication(snapshot, uid);
    const prior = replay(current, key, "draft_saved", uid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    if (state(current) !== "draft") return fail("failed-precondition", "Only a draft application can be changed.");
    const result = {applicationId: ref.id, state: "draft"};
    const entry: ReplayEntry = {action: "draft_saved", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
    tx.update(ref, {draft, replayKeys: setReplay(current, key, entry), updatedAt: serverTimestamp()});
    tx.create(auditRef, auditPayload(ref.id, "draft_saved", uid, "applicant", "draft", "draft", key));
    return result;
  });
}

export async function requestPartnerEvidenceUpload(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  rejectClientIntegrity(input);
  const appId = applicationId(input.applicationId);
  const key = idempotencyKey(input.idempotencyKey);
  const fileName = evidenceFileName(input.fileName);
  const contentType = evidenceContentType(input.contentType);
  const payloadHash = digest({applicationId: appId, fileName, contentType});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(appRef);
    const current = ownApplication(snapshot, uid);
    const prior = replay(current, key, "evidence_upload_requested", uid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    const currentState = state(current);
    if (currentState !== "draft" && currentState !== "evidence_requested") {
      return fail("failed-precondition", "Evidence can only be uploaded for a draft or evidence-requested application.");
    }
    const evidenceRef = db.collection(EVIDENCE).doc();
    const auditRef = db.collection(AUDIT).doc();
    const storagePath = evidenceStoragePath(appId, evidenceRef.id);
    const result = {applicationId: appId, evidenceId: evidenceRef.id, storagePath, storageState: "upload_requested", maxByteSize: PARTNER_EVIDENCE_MAX_BYTES, contentType};
    const entry: ReplayEntry = {action: "evidence_upload_requested", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
    tx.create(evidenceRef, {
      applicationId: appId,
      ownerUid: uid,
      storagePath,
      fileName,
      expectedContentType: contentType,
      maxByteSize: PARTNER_EVIDENCE_MAX_BYTES,
      storageState: "upload_requested",
      createdAt: serverTimestamp(),
    });
    tx.update(appRef, {replayKeys: setReplay(current, key, entry), updatedAt: serverTimestamp()});
    tx.create(auditRef, auditPayload(appId, "evidence_upload_requested", uid, "applicant", currentState, currentState, key));
    return result;
  });
}

// Compatibility entrypoint: it now creates a private upload authority record,
// never client-controlled metadata that could be marked complete.
export async function registerPartnerEvidenceMetadata(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const metadata = object(input.metadata, "metadata");
  return requestPartnerEvidenceUpload(db, uid, {
    applicationId: input.applicationId,
    idempotencyKey: input.idempotencyKey,
    fileName: metadata.fileName,
    contentType: metadata.contentType,
  });
}

export async function finalizePartnerEvidenceUpload(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  rejectClientIntegrity(input);
  const appId = applicationId(input.applicationId);
  const evidenceIdValue = evidenceId(input.evidenceId);
  const key = idempotencyKey(input.idempotencyKey);
  const payloadHash = digest({applicationId: appId, evidenceId: evidenceIdValue});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  const evidenceRef = db.collection(EVIDENCE).doc(evidenceIdValue);
  const before = await Promise.all([appRef.get(), evidenceRef.get()]);
  const current = ownApplication(before[0], uid);
  const evidence = before[1];
  if (!evidence.exists) return fail("not-found", "Evidence was not found.");
  const evidenceData = evidence.data() as Record<string, unknown>;
  if (evidenceData.applicationId !== appId || evidenceData.ownerUid !== uid) return fail("permission-denied", "Evidence belongs to another applicant.");
  if (state(current) !== "draft" && state(current) !== "evidence_requested") return fail("failed-precondition", "Evidence cannot be finalised for this application state.");
  // Check a bound replay before looking at ready state or reading Storage. The
  // payload hash includes the application and evidence IDs, while replay()
  // also binds action and actor UID. Therefore a successful retry returns the
  // original server result without re-downloading, re-hashing, or auditing.
  const prior = replay(current, key, "evidence_upload_finalized", uid, payloadHash);
  if (prior) return prior.result;
  if (evidenceData.storageState !== "upload_requested") return fail("failed-precondition", "Evidence is not awaiting finalisation.");
  const expectedPath = evidenceStoragePath(appId, evidenceIdValue);
  if (evidenceData.storagePath !== expectedPath) return fail("failed-precondition", "Evidence storage path is invalid.");
  const file = admin.storage().bucket().file(expectedPath);
  let metadata: Record<string, unknown>;
  let bytes: Buffer;
  try {
    const [rawMetadata] = await file.getMetadata();
    const [downloaded] = await file.download();
    metadata = rawMetadata as Record<string, unknown>;
    bytes = downloaded;
  } catch {
    return fail("failed-precondition", "Evidence object is missing from private storage.");
  }
  const actualContentType = metadata.contentType;
  const actualByteSize = Number(metadata.size);
  if (typeof actualContentType !== "string" || !PARTNER_EVIDENCE_CONTENT_TYPE_SET.has(actualContentType) || actualContentType !== evidenceData.expectedContentType) {
    return fail("failed-precondition", "Evidence object content type is invalid.");
  }
  if (!Number.isInteger(actualByteSize) || actualByteSize <= 0 || actualByteSize > PARTNER_EVIDENCE_MAX_BYTES || actualByteSize !== bytes.length) {
    return fail("failed-precondition", "Evidence object size is invalid.");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return db.runTransaction(async (tx) => {
    const [latestApp, latestEvidence] = await Promise.all([tx.get(appRef), tx.get(evidenceRef)]);
    const latest = ownApplication(latestApp, uid);
    const latestEvidenceData = latestEvidence.exists ? latestEvidence.data() as Record<string, unknown> : fail("not-found", "Evidence was not found.");
    const prior = replay(latest, key, "evidence_upload_finalized", uid, payloadHash);
    if (prior) return prior.result;
    if (latestEvidenceData.applicationId !== appId || latestEvidenceData.ownerUid !== uid || latestEvidenceData.storagePath !== expectedPath || latestEvidenceData.storageState !== "upload_requested") {
      return fail("failed-precondition", "Evidence finalisation invariant is invalid.");
    }
    const latestState = state(latest);
    if (latestState !== "draft" && latestState !== "evidence_requested") return fail("failed-precondition", "Evidence cannot be finalised for this application state.");
    const auditRef = db.collection(AUDIT).doc();
    const result = {applicationId: appId, evidenceId: evidenceIdValue, storageState: "ready", sha256, byteSize: actualByteSize, contentType: actualContentType};
    const entry: ReplayEntry = {action: "evidence_upload_finalized", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
    tx.update(evidenceRef, {storageState: "ready", contentType: actualContentType, byteSize: actualByteSize, sha256, storageGeneration: metadata.generation ?? null, finalizedAt: serverTimestamp()});
    tx.update(appRef, {replayKeys: setReplay(latest, key, entry), updatedAt: serverTimestamp()});
    tx.create(auditRef, auditPayload(appId, "evidence_upload_finalized", uid, "applicant", latestState, latestState, key));
    return result;
  });
}

export async function submitPartnerApplication(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  rejectClientIntegrity(input);
  const appId = applicationId(input.applicationId);
  const key = idempotencyKey(input.idempotencyKey);
  const payloadHash = digest({applicationId: appId});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  const evidenceQuery = db.collection(EVIDENCE).where("applicationId", "==", appId);
  return db.runTransaction(async (tx) => {
    const [snapshot, evidence] = await Promise.all([tx.get(appRef), tx.get(evidenceQuery)]);
    const current = ownApplication(snapshot, uid);
    const prior = replay(current, key, "submitted", uid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    if (state(current) !== "draft") return fail("failed-precondition", "Only a draft application can be submitted.");
    // Re-validate only the stored, normalised draft. No client payload can change
    // required fields at submission time.
    cleanDraft(current.draft);
    const readyEvidence = evidence.docs.filter((entry) => {
      const item = entry.data() as Record<string, unknown>;
      return item.storageState === "ready" && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256);
    });
    if (readyEvidence.length === 0) return fail("failed-precondition", "At least one server-verified ready evidence item is required before submission.");
    const auditRef = db.collection(AUDIT).doc();
    const result = {applicationId: appId, state: "submitted", readyEvidenceCount: readyEvidence.length};
    const entry: ReplayEntry = {action: "submitted", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
    tx.update(appRef, {state: "submitted", submittedAt: serverTimestamp(), replayKeys: setReplay(current, key, entry), updatedAt: serverTimestamp()});
    tx.create(auditRef, auditPayload(appId, "submitted", uid, "applicant", "draft", "submitted", key));
    return result;
  });
}

export async function getOwnPartnerApplication(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const snapshot = await db.collection(APPLICATIONS).doc(appId).get();
  const current = ownApplication(snapshot, uid);
  const [audit, evidence] = await Promise.all([
    db.collection(AUDIT).where("applicationId", "==", appId).get(),
    db.collection(EVIDENCE).where("applicationId", "==", appId).where("ownerUid", "==", uid).get(),
  ]);
  return {
    application: {applicationId: appId, ...current},
    timeline: audit.docs.map((entry) => ({auditEventId: entry.id, ...entry.data()})),
    evidence: evidence.docs.map((entry) => ({evidenceId: entry.id, ...entry.data()})),
  };
}

export async function listSubmittedPartnerApplications(db: Firestore): Promise<Record<string, unknown>> {
  const snapshot = await db.collection(APPLICATIONS).where("state", "==", "submitted").get();
  return {applications: snapshot.docs.map((entry) => ({applicationId: entry.id, ...entry.data()}))};
}

export async function getPartnerReviewDetail(db: Firestore, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const snapshot = await db.collection(APPLICATIONS).doc(appId).get();
  if (!snapshot.exists) return fail("not-found", "Partner application was not found.");
  const [audit, evidence] = await Promise.all([
    db.collection(AUDIT).where("applicationId", "==", appId).get(),
    db.collection(EVIDENCE).where("applicationId", "==", appId).get(),
  ]);
  return {application: {applicationId: appId, ...snapshot.data()}, timeline: audit.docs.map((entry) => ({auditEventId: entry.id, ...entry.data()})), evidence: evidence.docs.map((entry) => ({evidenceId: entry.id, ...entry.data()}))};
}

export async function getPartnerEvidenceAccess(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const evidenceIdValue = evidenceId(input.evidenceId);
  const [application, evidence] = await Promise.all([
    db.collection(APPLICATIONS).doc(appId).get(),
    db.collection(EVIDENCE).doc(evidenceIdValue).get(),
  ]);
  if (!application.exists || !evidence.exists) return fail("not-found", "Evidence was not found.");
  const applicationData = application.data() as Record<string, unknown>;
  const evidenceData = evidence.data() as Record<string, unknown>;
  if (evidenceData.applicationId !== appId) return fail("not-found", "Evidence was not found.");
  let actorAuthority: ActorAuthority;
  if (applicationData.ownerUid === uid && evidenceData.ownerUid === uid) {
    actorAuthority = "applicant";
  } else {
    await requireDirectorActor(db, uid);
    const reviewState = state(applicationData);
    if (reviewState !== "submitted" && reviewState !== "evidence_requested") {
      return fail("failed-precondition", "Evidence is not available for Director review in this application state.");
    }
    actorAuthority = "active_director";
  }
  if (evidenceData.storageState !== "ready" || evidenceData.storagePath !== evidenceStoragePath(appId, evidenceIdValue)) {
    return fail("failed-precondition", "Evidence is not server-verified and ready.");
  }
  // This is intentionally not a signed/public URL. The caller must use an
  // authenticated Storage SDK get against the protected path; cloud delivery
  // signing remains a separate, unimplemented production capability.
  return {
    applicationId: appId,
    evidenceId: evidenceIdValue,
    actorAuthority,
    storagePath: evidenceData.storagePath,
    delivery: "authenticated_storage_get_only",
    publicUrl: null,
  };
}

async function directorDecision(db: Firestore, directorUid: string, raw: unknown, action: "evidence_requested" | "declined"): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const key = idempotencyKey(input.idempotencyKey);
  const reason = text(input.reason, "reason", 1000)!;
  const payloadHash = digest({applicationId: appId, reason});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(appRef);
    if (!snapshot.exists) return fail("not-found", "Partner application was not found.");
    const current = snapshot.data() as Record<string, unknown>;
    const prior = replay(current, key, action, directorUid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    const priorState = state(current);
    const allowed = action === "evidence_requested" ? priorState === "submitted" : priorState === "submitted" || priorState === "evidence_requested";
    if (!allowed) return fail("failed-precondition", `Application cannot transition from ${priorState} to ${action}.`);
    const auditRef = db.collection(AUDIT).doc();
    const result = {applicationId: appId, state: action};
    const entry: ReplayEntry = {action, actorUid: directorUid, payloadHash, auditEventId: auditRef.id, result};
    tx.update(appRef, {
      state: action,
      lastDecisionAt: serverTimestamp(),
      lastDecisionReason: reason,
      replayKeys: setReplay(current, key, entry),
      updatedAt: serverTimestamp(),
    });
    tx.create(auditRef, auditPayload(appId, action, directorUid, "active_director", priorState, action, key, reason));
    return result;
  });
}

export async function requestPartnerEvidence(db: Firestore, directorUid: string, raw: unknown): Promise<Record<string, unknown>> {
  return directorDecision(db, directorUid, raw, "evidence_requested");
}

export async function declinePartnerApplication(db: Firestore, directorUid: string, raw: unknown): Promise<Record<string, unknown>> {
  return directorDecision(db, directorUid, raw, "declined");
}

export async function approvePartnerApplication(db: Firestore, directorUid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const key = idempotencyKey(input.idempotencyKey);
  const payloadHash = digest({applicationId: appId});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  const organisationRef = db.collection(ORGANISATIONS).doc(appId);
  return db.runTransaction(async (tx) => {
    const [snapshot, organisation] = await Promise.all([tx.get(appRef), tx.get(organisationRef)]);
    if (!snapshot.exists) return fail("not-found", "Partner application was not found.");
    const current = snapshot.data() as Record<string, unknown>;
    const prior = replay(current, key, "approved", directorUid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    const priorState = state(current);
    if (priorState !== "submitted" && priorState !== "evidence_requested") {
      return fail("failed-precondition", `Application cannot transition from ${priorState} to approved.`);
    }
    const ownerUid = typeof current.ownerUid === "string" ? current.ownerUid : fail("failed-precondition", "Application owner is invalid.");
    const membershipRef = db.collection(MEMBERSHIPS).doc(`${appId}_${ownerUid}`);
    const membership = await tx.get(membershipRef);
    if (organisation.exists || membership.exists) {
      return fail("failed-precondition", "Approval invariant is broken: an organisation or owner membership already exists.");
    }
    const draft = cleanDraft(current.draft);
    const auditRef = db.collection(AUDIT).doc();
    const result = {applicationId: appId, state: "approved", organisationId: appId, membershipId: membershipRef.id};
    const entry: ReplayEntry = {action: "approved", actorUid: directorUid, payloadHash, auditEventId: auditRef.id, result};
    tx.create(organisationRef, {
      applicationId: appId,
      displayName: draft.legalBusiness.legalName,
      createdAt: serverTimestamp(),
      createdByUid: directorUid,
    });
    tx.create(membershipRef, {
      organisationId: appId,
      uid: ownerUid,
      role: "owner",
      createdAt: serverTimestamp(),
      createdByUid: directorUid,
    });
    tx.update(appRef, {
      state: "approved",
      organisationId: appId,
      lastDecisionAt: serverTimestamp(),
      replayKeys: setReplay(current, key, entry),
      updatedAt: serverTimestamp(),
    });
    tx.create(auditRef, auditPayload(appId, "approved", directorUid, "active_director", priorState, "approved", key));
    return result;
  });
}

export async function resolveOwnPartnerOrganisation(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const organisationId = applicationId(input.organisationId);
  const membership = await db.collection(MEMBERSHIPS).doc(`${organisationId}_${uid}`).get();
  if (!membership.exists || membership.data()?.uid !== uid || membership.data()?.role !== "owner") {
    return fail("permission-denied", "No approved partner organisation is available for this applicant.");
  }
  const organisation = await db.collection(ORGANISATIONS).doc(organisationId).get();
  if (!organisation.exists || organisation.data()?.applicationId !== organisationId) {
    return fail("failed-precondition", "Approved partner organisation is incomplete.");
  }
  return {organisationId, organisation: organisation.data(), membership: membership.data()};
}

export const partnerSaveApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  savePartnerApplication(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerRegisterEvidenceMetadata = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  registerPartnerEvidenceMetadata(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerRequestEvidenceUpload = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  requestPartnerEvidenceUpload(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerFinalizeEvidenceUpload = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  finalizePartnerEvidenceUpload(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerSubmitApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  submitPartnerApplication(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerGetApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  getOwnPartnerApplication(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerListSubmittedApplications = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) => {
  await requireDirectorActor(admin.firestore(), request.auth?.uid);
  return listSubmittedPartnerApplications(admin.firestore());
}));
export const partnerGetReviewDetail = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) => {
  await requireDirectorActor(admin.firestore(), request.auth?.uid);
  return getPartnerReviewDetail(admin.firestore(), request.data);
}));
export const partnerGetEvidenceAccess = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  getPartnerEvidenceAccess(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
export const partnerRequestEvidence = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  requestPartnerEvidence(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerDeclineApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  declinePartnerApplication(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerApproveApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  approvePartnerApplication(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerResolveOrganisation = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  resolveOwnPartnerOrganisation(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
