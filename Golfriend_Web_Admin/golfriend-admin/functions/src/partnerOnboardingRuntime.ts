import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {defineString} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {isActiveStaff} from "./authority.js";
import {applicationId, canReview, canReviewEvidence, commercialEligibility, CONTRACT_APPROVAL_SCHEMA, contractEvidenceMatches, evidenceId, evidenceRevision, hasCompleteCatalogueLocales, immutableReceipt, PARTNER_AGREEMENT_DIGEST, PARTNER_AGREEMENT_VERSION, PARTNER_SCHEMA, REPRESENTATION_REQUIREMENTS, representationSatisfied, validateAgreementAcceptance, validateContractApprovalRequest, validateContractConfiguration, validateDraft, validateEvidence, validateRepresentationBasis, validateRepresentative, validateSubmit, type RepresentationBasis} from "./partnerOnboardingDomain.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const evidenceBucket = defineString("PARTNER_APPLICATION_BUCKET", {default: ""});
const at = () => admin.firestore.FieldValue.serverTimestamp();
const docs = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((item) => ({id: item.id, ...item.data()}));

function auth(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return request.auth.uid as string;
}
/**
 * Re-check the CURRENT Firebase account for every sensitive operation.
 *
 * A verified ID token only proves what was true when it was issued. Disabling an account or
 * revoking its refresh tokens does not invalidate a token already in a browser, so an
 * offboarded operator kept full authority until the token happened to expire. Reading the
 * live user record closes that window, and comparing the token issue time against
 * tokensValidAfterTime honours an explicit revocation as well as a disable.
 */
async function currentAccount(request: any) {
  const uid = auth(request);
  let account;
  try { account = await admin.auth().getUser(uid); } catch { throw new HttpsError("permission-denied", "This account is no longer active. Sign in again."); }
  if (account.disabled) throw new HttpsError("permission-denied", "This account is no longer active. Sign in again.");
  const validAfterMs = account.tokensValidAfterTime ? Date.parse(account.tokensValidAfterTime) : NaN;
  const issuedAtMs = Number(request.auth?.token?.auth_time || 0) * 1000;
  // One second of slack: auth_time has second granularity, tokensValidAfterTime does not.
  if (Number.isFinite(validAfterMs) && issuedAtMs > 0 && issuedAtMs < validAfterMs - 1000) throw new HttpsError("permission-denied", "This session was ended. Sign in again.");
  return uid;
}
function command(request: any) {
  const id = String(request.data?.commandId || "");
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new HttpsError("invalid-argument", "Command id invalid.");
  return id;
}
async function staff(uid: string) {
  const snapshot = await db.collection("admin_users").doc(uid).get();
  if (!snapshot.exists || !isActiveStaff(snapshot.data())) throw new HttpsError("permission-denied", "Active Admin role required.");
  return String(snapshot.data()?.role);
}
async function audit(tx: FirebaseFirestore.Transaction, appId: string, commandId: string, kind: string, role: string) {
  const receipt = immutableReceipt(appId, commandId, kind, Date.now());
  const ref = db.collection("partner_application_audits").doc(receipt.id);
  if (!(await tx.get(ref)).exists) tx.create(ref, {...receipt, actorRole: role, createdAt: at()});
  return receipt;
}

export const savePartnerApplicationDraftV2 = onCall({enforceAppCheck: true}, async (request) => {
  const uid = await currentAccount(request); const commandId = command(request);
  let clean: ReturnType<typeof validateDraft>;
  try { clean = validateDraft(request.data); } catch { throw new HttpsError("invalid-argument", "Application details invalid."); }
  const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists && !["draft", "info_needed", "rejected"].includes(String(snapshot.data()?.status))) throw new HttpsError("failed-precondition", "Application is locked for review.");
    const receipt = await audit(tx, id, commandId, "draft_saved", "Applicant");
    tx.set(ref, {schema: PARTNER_SCHEMA, applicationId: id, applicantUid: uid, ...clean, status: "draft", updatedAt: at(), createdAt: snapshot.exists ? snapshot.data()?.createdAt : at()}, {merge: true});
    return {success: true, applicationId: id, status: "draft", receipt};
  });
});

export const saveVerifiedCourseOnboardingDraftV2 = savePartnerApplicationDraftV2;

export const acceptVerifiedCourseOnboardingAgreementV2 = onCall({enforceAppCheck: true}, async (request) => {
  const uid = await currentAccount(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
  let representative: ReturnType<typeof validateRepresentative>; let agreement: ReturnType<typeof validateAgreementAcceptance>;
  try { representative = validateRepresentative(request.data?.representative); agreement = validateAgreementAcceptance(request.data?.agreement, id); } catch { throw new HttpsError("invalid-argument", "Authorized representative and agreement acceptance are invalid."); }
  const verifiedEmail = request.auth?.token?.email_verified === true ? String(request.auth.token.email || "").toLowerCase() : "";
  if (!verifiedEmail || representative.email !== verifiedEmail) throw new HttpsError("failed-precondition", "The authorized representative must match the verified sign-in email.");
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref); if (!snapshot.exists || !["draft", "info_needed", "rejected"].includes(String(snapshot.data()?.status))) throw new HttpsError("failed-precondition", "An editable saved application is required.");
    const evidence = await tx.get(ref.collection("evidence").doc(representative.authorityEvidenceId)); if (!evidence.exists || evidence.data()?.verificationStatus !== "verified" || evidence.data()?.verifiedByRole == null) throw new HttpsError("failed-precondition", "Representative authority evidence has not been verified by authorized staff.");
    const agreementRef = db.collection("partner_application_audits").doc(agreement.receiptId); const prior = await tx.get(agreementRef);
    if (prior.exists) return {success: true, applicationId: id, agreementReceiptId: agreement.receiptId, restarted: true};
    if (!prior.exists) tx.create(agreementRef, {schema: "golfriend.partner-agreement-receipt.v1", ...agreement, applicationId: id, commandId, actorRole: "Applicant", acceptedAt: at(), createdAt: at()});
    tx.update(ref, {representative: {...representative, verifiedEmail: true, verificationSource: "firebase_auth_and_staff_verified_evidence"}, agreement: {...agreement, acceptedAt: at()}, updatedAt: at()});
    return {success: true, applicationId: id, agreementReceiptId: agreement.receiptId, restarted: false};
  });
});

export const submitPartnerApplicationV2 = onCall({enforceAppCheck: true}, async (request) => {
  const uid = await currentAccount(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
  const verifiedEmail = request.auth?.token?.email_verified === true ? String(request.auth.token.email || "").toLowerCase() : "";
  if (!verifiedEmail) throw new HttpsError("failed-precondition", "A verified sign-in email is required.");
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    let representative: ReturnType<typeof validateRepresentative>; let agreement: ReturnType<typeof validateAgreementAcceptance>;
    try { representative = validateRepresentative(snapshot.data()?.representative); agreement = validateAgreementAcceptance(snapshot.data()?.agreement, id); } catch { throw new HttpsError("failed-precondition", "Verified representative evidence and explicit current agreement acceptance are required."); }
    if (representative.email !== verifiedEmail) throw new HttpsError("failed-precondition", "The authorized representative must match the verified sign-in email.");
    if (!snapshot.exists || !validateSubmit(snapshot.data()) || !hasCompleteCatalogueLocales(snapshot.data())) throw new HttpsError("failed-precondition", "Complete the organization, course profile, and exact eight-locale catalogue first.");
    const representativeEvidence = await tx.get(ref.collection("evidence").doc(representative.authorityEvidenceId)); if (!representativeEvidence.exists || representativeEvidence.data()?.verificationStatus !== "verified") throw new HttpsError("failed-precondition", "Representative authority verification is no longer valid.");
    // Proportionate proof: a company must show registration AND an authority instrument, a sole
    // proprietor a single registration or identity document, and an approved alternative exactly
    // the document Admin agreed to accept. Nobody is asked for more than their basis requires.
    let basis: ReturnType<typeof validateRepresentationBasis>;
    try { basis = validateRepresentationBasis(snapshot.data()?.representationBasis || "company"); } catch { throw new HttpsError("failed-precondition", "Choose how you represent this organization before submitting."); }
    const onFile = await tx.get(ref.collection("evidence"));
    const proof = representationSatisfied(basis, onFile.docs.map((item) => item.data()));
    if (!proof.satisfied) throw new HttpsError("failed-precondition", "More verified proof of authority is needed before this application can be reviewed.");
    if (String(snapshot.data()?.contactEmail || "").toLowerCase() !== verifiedEmail) throw new HttpsError("failed-precondition", "The contact email must match the verified sign-in email.");
    if (!["draft", "info_needed", "rejected"].includes(String(snapshot.data()?.status))) throw new HttpsError("failed-precondition", "Application cannot be submitted.");
    const agreementRef = db.collection("partner_application_audits").doc(agreement.receiptId); const priorAgreement = await tx.get(agreementRef);
    const receipt = await audit(tx, id, commandId, "submitted", "Applicant");
    tx.update(ref, {status: "submitted", representative: {...representative, verifiedEmail: true, verificationSource: "firebase_auth_and_staff_verified_evidence"}, agreement: snapshot.data()?.agreement, commercial: commercialEligibility({status: "submitted", agreement}), submittedAt: at(), updatedAt: at()});
    if (!priorAgreement.exists) tx.create(agreementRef, {schema: "golfriend.partner-agreement-receipt.v1", ...agreement, applicationId: id, actorRole: "Applicant", createdAt: at()});
    tx.create(ref.collection("notifications").doc(receipt.id), {kind: "submitted", locale: snapshot.data()?.locale, createdAt: at()});
    return {success: true, applicationId: id, status: "submitted", receipt};
  });
});

export const submitVerifiedCourseOnboardingV2 = submitPartnerApplicationV2;

export const getMyPartnerApplicationV2 = onCall({enforceAppCheck: true}, async (request) => {
  const uid = auth(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id); const snapshot = await ref.get();
  if (!snapshot.exists) return {schema: "golfriend.partner-application-view.v2", application: null, agreement: {version: PARTNER_AGREEMENT_VERSION, digest: PARTNER_AGREEMENT_DIGEST, legalReviewComplete: false}, checklist: null, evidenceStorageConfigured: Boolean(evidenceBucket.value()), messages: [], notifications: [], audits: [], evidence: [], materials: []};
  const [messages, notifications, audits, evidence, materials] = await Promise.all([
    ref.collection("messages").orderBy("createdAt").limit(100).get(), ref.collection("notifications").orderBy("createdAt", "desc").limit(50).get(),
    db.collection("partner_application_audits").where("applicationId", "==", id).limit(100).get(), ref.collection("evidence").limit(50).get(),
    db.collection("marketing_assets").where("state", "==", "approved").limit(50).get(),
  ]);
  // The checklist is derived on the SERVER from the same rule the submit gate applies, so the
  // applicant is never shown a requirement the server does not actually enforce.
  const basis = ["company", "sole_proprietor", "approved_alternative"].includes(String(snapshot.data()?.representationBasis)) ? String(snapshot.data()?.representationBasis) as RepresentationBasis : "company";
  const proof = representationSatisfied(basis, docs(evidence));
  return {schema: "golfriend.partner-application-view.v2", application: snapshot.data(), agreement: {version: PARTNER_AGREEMENT_VERSION, digest: PARTNER_AGREEMENT_DIGEST, legalReviewComplete: false}, checklist: {representationBasis: basis, required: REPRESENTATION_REQUIREMENTS[basis], satisfied: proof.satisfied, missing: proof.missing, verifiedCount: proof.verifiedCount}, evidenceStorageConfigured: Boolean(evidenceBucket.value()), messages: docs(messages), notifications: docs(notifications), audits: docs(audits), evidence: docs(evidence), materials: docs(materials).filter((item: any) => ["course_letter", "partner_letter", "app_store_asset"].includes(item.category))};
});

export const getMyVerifiedCourseOnboardingV2 = getMyPartnerApplicationV2;

export const uploadPartnerApplicationEvidenceV2 = onCall({enforceAppCheck: true, timeoutSeconds: 60}, async (request) => {
  const uid = await currentAccount(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Save the application before uploading evidence.");
  const bucketName = evidenceBucket.value();
  if (!bucketName) throw new HttpsError("failed-precondition", "PROVIDER_UNCONFIGURED");
  let metadata: ReturnType<typeof validateEvidence>;
  try { metadata = validateEvidence(request.data); } catch { throw new HttpsError("invalid-argument", "Evidence metadata invalid."); }
  const bytes = Buffer.from(String(request.data?.base64 || ""), "base64");
  if (bytes.length !== metadata.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== metadata.checksum) throw new HttpsError("invalid-argument", "Evidence checksum mismatch.");
  const idempotentId = evidenceId(id, metadata.checksum); const path = `partner-applications/${id}/${idempotentId}`;
  const file = admin.storage().bucket(bucketName).file(path);
  if (!(await file.exists())[0]) await file.save(bytes, {resumable: false, metadata: {contentType: metadata.contentType, metadata: {applicationId: id, evidenceId: idempotentId}}});
  const receipt = immutableReceipt(id, commandId, "evidence_uploaded", Date.now());
  await db.runTransaction(async (tx) => {
    const auditRef = db.collection("partner_application_audits").doc(receipt.id);
    if (!(await tx.get(auditRef)).exists) tx.create(auditRef, {...receipt, actorRole: "Applicant", createdAt: at()});
    tx.set(ref.collection("evidence").doc(idempotentId), {evidenceId: idempotentId, ...metadata, storagePath: path, uploadedAt: at()}, {merge: false});
  });
  return {success: true, evidenceId: idempotentId, receipt};
});

export const sendPartnerSupportMessageV2 = onCall({enforceAppCheck: true}, async (request) => {
  const uid = auth(request); const commandId = command(request); const id = applicationId(uid); const message = String(request.data?.message || "").trim().slice(0, 2000);
  if (!message) throw new HttpsError("invalid-argument", "Message required.");
  const ref = db.collection("partner_applications_v2").doc(id); if (!(await ref.get()).exists) throw new HttpsError("not-found", "Application missing.");
  const receipt = immutableReceipt(id, commandId, "applicant_message", Date.now());
  await ref.collection("messages").doc(receipt.id).create({id: receipt.id, sender: "applicant", message, createdAt: at()}).catch((error: any) => { if (error?.code !== 6) throw error; });
  return {success: true, receipt};
});

export const listPartnerApplicationsV2 = onCall({enforceAppCheck: true}, async (request) => {
  await staff(await currentAccount(request)); const snapshot = await db.collection("partner_applications_v2").orderBy("updatedAt", "desc").limit(250).get();
  return {schema: "golfriend.admin.partner-applications.v2", items: docs(snapshot)};
});

export const getPartnerApplicationAdminV2 = onCall({enforceAppCheck: true}, async (request) => {
  await staff(await currentAccount(request)); const id = String(request.data?.applicationId || ""); const ref = db.collection("partner_applications_v2").doc(id); const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Application missing.");
  const [messages, audits, evidence, approvals] = await Promise.all([ref.collection("messages").orderBy("createdAt").limit(100).get(), db.collection("partner_application_audits").where("applicationId", "==", id).limit(100).get(), ref.collection("evidence").limit(50).get(), db.collection("partner_contract_approvals").where("applicationId", "==", id).limit(20).get()]);
  const basis = ["company", "sole_proprietor", "approved_alternative"].includes(String(snapshot.data()?.representationBasis)) ? String(snapshot.data()?.representationBasis) as RepresentationBasis : "company";
  const proof = representationSatisfied(basis, docs(evidence));
  return {application: snapshot.data(), messages: docs(messages), audits: docs(audits), evidence: docs(evidence), contractApprovals: docs(approvals), agreement: {version: PARTNER_AGREEMENT_VERSION, digest: PARTNER_AGREEMENT_DIGEST}, checklist: {representationBasis: basis, required: REPRESENTATION_REQUIREMENTS[basis], satisfied: proof.satisfied, missing: proof.missing, verifiedCount: proof.verifiedCount}};
});

export const sendAdminPartnerSupportMessageV2 = onCall({enforceAppCheck: true}, async (request) => {
  const role = await staff(await currentAccount(request)); const commandId = command(request); const id = String(request.data?.applicationId || ""); const message = String(request.data?.message || "").trim().slice(0, 2000);
  if (!message) throw new HttpsError("invalid-argument", "Message required.");
  const ref = db.collection("partner_applications_v2").doc(id); if (!(await ref.get()).exists) throw new HttpsError("not-found", "Application missing.");
  const receipt = immutableReceipt(id, commandId, "admin_message", Date.now());
  await Promise.all([ref.collection("messages").doc(receipt.id).create({id: receipt.id, sender: "admin", message, createdAt: at()}), db.collection("partner_application_audits").doc(receipt.id).create({...receipt, actorRole: role, createdAt: at()})]).catch((error: any) => { if (error?.code !== 6) throw error; });
  return {success: true, receipt};
});

export const reviewPartnerApplicationV2 = onCall({enforceAppCheck: true}, async (request) => {
  const role = await staff(await currentAccount(request)); const commandId = command(request); const id = String(request.data?.applicationId || ""); const to = String(request.data?.status || ""); const note = String(request.data?.note || "").trim().slice(0, 2000); const ref = db.collection("partner_applications_v2").doc(id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || !canReview(String(snapshot.data()?.status), to, role)) throw new HttpsError("failed-precondition", "Review transition denied.");
    let contract: ReturnType<typeof validateContractConfiguration> | null = null;
    if (to === "approved") {
      const representative = snapshot.data()?.representative; const agreement = snapshot.data()?.agreement;
      if (!representative?.authorityEvidenceId || agreement?.receiptId == null) throw new HttpsError("failed-precondition", "Verified representative and current agreement are required.");
      const approvalId = String(request.data?.contractApprovalId || "");
      // An absent or malformed id previously reached Firestore as an empty document path, which
      // threw an unhandled error and surfaced as INTERNAL. It still denied, but an operator saw a
      // provider fault instead of the missing-evidence reason. Same shape validateContractConfiguration uses.
      if (!/^pca_[a-f0-9]{32}$/.test(approvalId)) throw new HttpsError("failed-precondition", "Immutable onboarding approval evidence is incomplete.");
      const [representativeEvidence, agreementReceipt, approvalEvidence] = await Promise.all([tx.get(ref.collection("evidence").doc(representative.authorityEvidenceId)), tx.get(db.collection("partner_application_audits").doc(agreement.receiptId)), tx.get(db.collection("partner_contract_approvals").doc(approvalId))]);
      if (!representativeEvidence.exists || representativeEvidence.data()?.verificationStatus !== "verified" || !agreementReceipt.exists || agreementReceipt.data()?.version !== agreement.version || !approvalEvidence.exists || approvalEvidence.data()?.applicationId !== id) throw new HttpsError("failed-precondition", "Immutable onboarding approval evidence is incomplete.");
      // A contract approval that does not carry the exact accepted agreement version and digest
      // is not an approval OF THIS agreement, so approval must not proceed on it.
      if (!contractEvidenceMatches(approvalEvidence.data(), agreement)) throw new HttpsError("failed-precondition", "The recorded contract approval does not match the accepted agreement version and digest.");
      try { contract = validateContractConfiguration({approvalId, ...approvalEvidence.data()}); } catch { throw new HttpsError("failed-precondition", "Contractual approval for the effective three-percent founding commission is required."); }
    }
    const receipt = await audit(tx, id, commandId, `review_${to}`, role);
    const commercial = commercialEligibility({status: to, agreement: snapshot.data()?.agreement, contract, suspended: to === "suspended"});
    tx.update(ref, {status: to, reviewNote: note, reviewedAt: at(), updatedAt: at(), approvedCourseCandidate: to === "approved", ...(contract ? {contract} : {}), commercial});
    tx.set(ref.collection("messages").doc(receipt.id), {id: receipt.id, sender: "admin", message: note || to, createdAt: at()});
    tx.set(ref.collection("notifications").doc(receipt.id), {kind: to, locale: snapshot.data()?.locale, createdAt: at()});
    if (to === "approved") tx.set(db.collection("course_growth_candidates").doc(id), {schema: "golfriend.course-growth-candidate.v1", sourceApplicationId: id, organization: snapshot.data()?.organization, organizationIdentity: snapshot.data()?.organizationIdentity, course: snapshot.data()?.course, courseProfile: snapshot.data()?.courseProfile, country: snapshot.data()?.country, agreementReceiptId: snapshot.data()?.agreement?.receiptId, contract, pilot: {status: "pending_verified_activation", startsAt: null, durationDays: 90}, status: "admin_review_required", partnerStatus: "unavailable_until_verified_activation", invoiceEligible: false, publishToApp: false, createdAt: at()}, {merge: false});
    return {success: true, status: to, receipt, courseCandidateCreated: to === "approved", partnerStatus: commercial.isPartner ? "partner" : "unavailable", invoiceEligible: commercial.invoiceEligible, publishedToApp: false};
  });
});

/**
 * The exact agreement an applicant is asked to accept.
 *
 * The version and digest are SERVER constants; the applicant sees them verbatim and posts them
 * back verbatim, and acceptance is refused on any mismatch. Legal review is reported as
 * incomplete because it is: the wording is still with legal, and saying otherwise on an
 * applicant-facing screen would be a false claim.
 */
export const getPartnerAgreementV2 = onCall({enforceAppCheck: true}, async (request) => {
  auth(request);
  return {
    schema: "golfriend.partner-agreement.v1",
    version: PARTNER_AGREEMENT_VERSION,
    digest: PARTNER_AGREEMENT_DIGEST,
    legalReviewComplete: false,
    // Clause KEYS, not prose: the localized wording lives in the eight-locale client copy, and
    // the server owns only the identity of the document being accepted.
    clauseKeys: ["scope", "commission", "trial", "dataProtection", "termination", "governingLaw"],
  };
});

/**
 * Admin decision on one representative-authority document.
 *
 * This is the surface that did not exist: `verificationStatus` was required by agreement
 * acceptance and by approval, but nothing in the product could ever set it, so the chain could
 * only be completed by writing to the database out of band. The server owns every field of the
 * decision - status, reviewer, reason, timestamp and revision - and the client can only ask.
 */
export const reviewPartnerApplicationEvidenceV2 = onCall({enforceAppCheck: true}, async (request) => {
  const reviewerUid = await currentAccount(request); const role = await staff(reviewerUid); const commandId = command(request);
  const id = String(request.data?.applicationId || ""); const documentId = String(request.data?.evidenceId || "");
  const decision = String(request.data?.decision || ""); const reason = String(request.data?.reason || "").trim().slice(0, 2000);
  if (!/^pa_[a-f0-9]{24}$/.test(id) || !/^pae_[a-f0-9]{32}$/.test(documentId)) throw new HttpsError("invalid-argument", "Application or document reference invalid.");
  if (!canReviewEvidence(role, decision)) throw new HttpsError("permission-denied", "That decision is outside your Admin role.");
  if (decision !== "verified" && !reason) throw new HttpsError("invalid-argument", "A reason is required when rejecting a document or asking for an alternative.");
  const ref = db.collection("partner_applications_v2").doc(id); const documentRef = ref.collection("evidence").doc(documentId);
  return db.runTransaction(async (tx) => {
    const [application, document] = await Promise.all([tx.get(ref), tx.get(documentRef)]);
    if (!application.exists || !document.exists) throw new HttpsError("not-found", "That document is no longer available.");
    const revision = evidenceRevision(document.data()?.revision);
    // Optimistic concurrency: two reviewers opening the same document cannot silently overwrite
    // each other, and the second one is told why.
    if (request.data?.expectedRevision != null && Number(request.data.expectedRevision) !== revision) throw new HttpsError("failed-precondition", "Another reviewer has already decided this document. Reload the review.");
    const receipt = await audit(tx, id, commandId, `evidence_${decision}`, role);
    tx.set(documentRef, {
      verificationStatus: decision,
      // Only a verification records a verifying role: downstream gates read exactly this field.
      verifiedByRole: decision === "verified" ? role : null,
      reviewedByUid: reviewerUid, reviewerRole: role, reviewReason: reason,
      reviewedAt: at(), revision: revision + 1, reviewReceiptId: receipt.id,
    }, {merge: true});
    tx.set(ref.collection("messages").doc(receipt.id), {id: receipt.id, sender: "admin", message: reason || decision, createdAt: at()});
    tx.set(ref.collection("notifications").doc(receipt.id), {kind: `document_${decision}`, locale: application.data()?.locale, createdAt: at()});
    // Asking for an alternative is an information request: it must actually reopen the
    // application for the applicant, otherwise the request is unanswerable.
    const status = String(application.data()?.status || "");
    const reopened = decision === "alternative_requested" && canReview(status, "info_needed", role);
    tx.update(ref, {updatedAt: at(), ...(reopened ? {status: "info_needed", reviewNote: reason} : {}), ...(decision === "alternative_requested" ? {alternativeEvidenceRequest: {evidenceId: documentId, reason, requestedByRole: role, requestedAt: at()}} : {})});
    return {success: true, applicationId: id, evidenceId: documentId, decision, revision: revision + 1, reopened, receipt};
  });
});

/**
 * Admin legal and commercial approval of the partner contract.
 *
 * Writes `partner_contract_approvals/{pca_...}` - the record `reviewPartnerApplicationV2`
 * demands before it will approve an application, and which previously no product surface could
 * create. The approval is immutable, deterministic per (application, scope) so a retry cannot
 * mint a second one, and it records who approved what, against which agreement version and
 * digest, and whether legal review is actually complete.
 */
export const approvePartnerContractV2 = onCall({enforceAppCheck: true}, async (request) => {
  const approverUid = await currentAccount(request); const role = await staff(approverUid); const commandId = command(request);
  const id = String(request.data?.applicationId || "");
  if (!/^pa_[a-f0-9]{24}$/.test(id)) throw new HttpsError("invalid-argument", "Application reference invalid.");
  if (!["Director", "Manager"].includes(role)) throw new HttpsError("permission-denied", "Legal and commercial approval requires a Director or Manager.");
  let approval: ReturnType<typeof validateContractApprovalRequest>;
  try { approval = validateContractApprovalRequest(request.data, id, role); } catch (error: any) {
    if (String(error?.message) === "LEGAL_REVIEW_EVIDENCE_INVALID") throw new HttpsError("failed-precondition", "Only a Director may record legal review as complete, and only against a legal review reference.");
    throw new HttpsError("invalid-argument", "Contract scope, effective date and commission are invalid.");
  }
  const ref = db.collection("partner_applications_v2").doc(id);
  const approvalRef = db.collection("partner_contract_approvals").doc(approval.approvalId);
  return db.runTransaction(async (tx) => {
    const [application, existing] = await Promise.all([tx.get(ref), tx.get(approvalRef)]);
    if (!application.exists) throw new HttpsError("not-found", "That application is no longer available.");
    const agreement = application.data()?.agreement; const representative = application.data()?.representative;
    if (!representative?.authorityEvidenceId || !agreement?.receiptId) throw new HttpsError("failed-precondition", "A verified authorized representative and an accepted agreement are required before contract approval.");
    const [document, agreementReceipt] = await Promise.all([
      tx.get(ref.collection("evidence").doc(String(representative.authorityEvidenceId))),
      tx.get(db.collection("partner_application_audits").doc(String(agreement.receiptId))),
    ]);
    if (!document.exists || document.data()?.verificationStatus !== "verified") throw new HttpsError("failed-precondition", "The authorized representative document has not been verified.");
    // Unapproved or mismatched agreement evidence stops the approval outright.
    if (!agreementReceipt.exists || agreementReceipt.data()?.version !== agreement.version || agreement.version !== PARTNER_AGREEMENT_VERSION || agreement.digest !== PARTNER_AGREEMENT_DIGEST) {
      throw new HttpsError("failed-precondition", "The accepted agreement does not match the current agreement version and digest.");
    }
    if (existing.exists) {
      if (existing.data()?.applicationId !== id) throw new HttpsError("already-exists", "That approval reference belongs to another application.");
      return {success: true, approvalId: approval.approvalId, scope: approval.scope, restarted: true, legalReviewComplete: existing.data()?.legalReviewComplete === true};
    }
    const receipt = await audit(tx, id, commandId, `contract_approved_${approval.scope}`, role);
    tx.create(approvalRef, {
      schema: CONTRACT_APPROVAL_SCHEMA, applicationId: id, ...approval,
      agreementVersion: PARTNER_AGREEMENT_VERSION, agreementDigest: PARTNER_AGREEMENT_DIGEST,
      approverUid, approverRole: role, approvedAt: at(), receiptId: receipt.id, immutable: true, createdAt: at(),
    });
    tx.update(ref, {contractApproval: {approvalId: approval.approvalId, scope: approval.scope, approverRole: role, legalReviewComplete: approval.legalReviewComplete, approvedAt: at()}, updatedAt: at()});
    return {success: true, approvalId: approval.approvalId, scope: approval.scope, restarted: false, legalReviewComplete: approval.legalReviewComplete, receipt};
  });
});
