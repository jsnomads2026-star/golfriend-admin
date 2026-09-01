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
const PARTNER_AUTHORITY_CALLABLE_OPTIONS = {region: PARTNER_AUTHORITY_REGION, memory: "256MiB" as const};
const ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

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

export async function registerPartnerEvidenceMetadata(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const key = idempotencyKey(input.idempotencyKey);
  const metadata = object(input.metadata, "metadata");
  const safeMetadata = {
    fileName: text(metadata.fileName, "metadata.fileName", 240)!,
    contentType: text(metadata.contentType, "metadata.contentType", 160)!,
    byteSize: Number(metadata.byteSize),
  };
  if (!Number.isInteger(safeMetadata.byteSize) || safeMetadata.byteSize <= 0 || safeMetadata.byteSize > 25 * 1024 * 1024) {
    return fail("invalid-argument", "metadata.byteSize is invalid.");
  }
  const payloadHash = digest({metadata: safeMetadata});
  const appRef = db.collection(APPLICATIONS).doc(appId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(appRef);
    const current = ownApplication(snapshot, uid);
    const prior = replay(current, key, "evidence_metadata_registered", uid, payloadHash);
    if (prior) return {...prior.result, replayed: true};
    if (state(current) !== "draft") return fail("failed-precondition", "Evidence metadata can only be registered for a draft application.");
    const evidenceRef = db.collection(EVIDENCE).doc();
    const auditRef = db.collection(AUDIT).doc();
    const result = {applicationId: appId, evidenceId: evidenceRef.id, storageState: "storage_uncommissioned"};
    const entry: ReplayEntry = {action: "evidence_metadata_registered", actorUid: uid, payloadHash, auditEventId: auditRef.id, result};
    // No client can claim a storage reference or integrity result. Until a trusted
    // private Storage writer exists, this is metadata only and cannot complete evidence.
    tx.create(evidenceRef, {
      applicationId: appId,
      ownerUid: uid,
      metadata: safeMetadata,
      storageState: "storage_uncommissioned",
      createdAt: serverTimestamp(),
    });
    tx.update(appRef, {replayKeys: setReplay(current, key, entry), updatedAt: serverTimestamp()});
    tx.create(auditRef, auditPayload(appId, "evidence_metadata_registered", uid, "applicant", "draft", "draft", key));
    return result;
  });
}

export async function submitPartnerApplication(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
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
    if (evidence.empty) return fail("failed-precondition", "Evidence metadata is required before submission.");
    // The ADR requires a durable private object reference plus integrity metadata.
    // This batch deliberately has no Storage writer, so no record can satisfy it.
    return fail("failed-precondition", "Evidence storage is not yet commissioned.");
  });
}

export async function getOwnPartnerApplication(db: Firestore, uid: string, raw: unknown): Promise<Record<string, unknown>> {
  const input = object(raw, "request");
  const appId = applicationId(input.applicationId);
  const snapshot = await db.collection(APPLICATIONS).doc(appId).get();
  const current = ownApplication(snapshot, uid);
  const audit = await db.collection(AUDIT).where("applicationId", "==", appId).get();
  return {
    application: {applicationId: appId, ...current},
    timeline: audit.docs.map((entry) => ({auditEventId: entry.id, ...entry.data()})),
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
  const audit = await db.collection(AUDIT).where("applicationId", "==", appId).get();
  return {application: {applicationId: appId, ...snapshot.data()}, timeline: audit.docs.map((entry) => ({auditEventId: entry.id, ...entry.data()}))};
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
export const partnerRequestEvidence = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  requestPartnerEvidence(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerDeclineApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  declinePartnerApplication(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerApproveApplication = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  approvePartnerApplication(admin.firestore(), await requireDirectorActor(admin.firestore(), request.auth?.uid), request.data)));
export const partnerResolveOrganisation = partnerAuthorityCallable(onCall(PARTNER_AUTHORITY_CALLABLE_OPTIONS, async (request) =>
  resolveOwnPartnerOrganisation(admin.firestore(), requireAuthenticatedUid(request.auth?.uid), request.data)));
