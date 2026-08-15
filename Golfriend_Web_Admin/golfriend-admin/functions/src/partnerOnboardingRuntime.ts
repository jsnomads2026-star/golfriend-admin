import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {defineString} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {isActiveStaff} from "./authority.js";
import {applicationId, canReview, commercialEligibility, evidenceId, hasCompleteCatalogueLocales, immutableReceipt, PARTNER_SCHEMA, validateAgreementAcceptance, validateContractConfiguration, validateDraft, validateEvidence, validateRepresentative, validateSubmit} from "./partnerOnboardingDomain.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const evidenceBucket = defineString("PARTNER_APPLICATION_BUCKET", {default: ""});
const at = () => admin.firestore.FieldValue.serverTimestamp();
const docs = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map((item) => ({id: item.id, ...item.data()}));

function auth(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return request.auth.uid as string;
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
  const uid = auth(request); const commandId = command(request);
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
  const uid = auth(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
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
  const uid = auth(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
  const verifiedEmail = request.auth?.token?.email_verified === true ? String(request.auth.token.email || "").toLowerCase() : "";
  if (!verifiedEmail) throw new HttpsError("failed-precondition", "A verified sign-in email is required.");
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    let representative: ReturnType<typeof validateRepresentative>; let agreement: ReturnType<typeof validateAgreementAcceptance>;
    try { representative = validateRepresentative(snapshot.data()?.representative); agreement = validateAgreementAcceptance(snapshot.data()?.agreement, id); } catch { throw new HttpsError("failed-precondition", "Verified representative evidence and explicit current agreement acceptance are required."); }
    if (representative.email !== verifiedEmail) throw new HttpsError("failed-precondition", "The authorized representative must match the verified sign-in email.");
    if (!snapshot.exists || !validateSubmit(snapshot.data()) || !hasCompleteCatalogueLocales(snapshot.data())) throw new HttpsError("failed-precondition", "Complete the organization, course profile, and exact eight-locale catalogue first.");
    const representativeEvidence = await tx.get(ref.collection("evidence").doc(representative.authorityEvidenceId)); if (!representativeEvidence.exists || representativeEvidence.data()?.verificationStatus !== "verified") throw new HttpsError("failed-precondition", "Representative authority verification is no longer valid.");
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
  if (!snapshot.exists) return {schema: "golfriend.partner-application-view.v2", application: null, evidenceStorageConfigured: Boolean(evidenceBucket.value()), messages: [], notifications: [], audits: [], evidence: [], materials: []};
  const [messages, notifications, audits, evidence, materials] = await Promise.all([
    ref.collection("messages").orderBy("createdAt").limit(100).get(), ref.collection("notifications").orderBy("createdAt", "desc").limit(50).get(),
    db.collection("partner_application_audits").where("applicationId", "==", id).limit(100).get(), ref.collection("evidence").limit(50).get(),
    db.collection("marketing_assets").where("state", "==", "approved").limit(50).get(),
  ]);
  return {schema: "golfriend.partner-application-view.v2", application: snapshot.data(), evidenceStorageConfigured: Boolean(evidenceBucket.value()), messages: docs(messages), notifications: docs(notifications), audits: docs(audits), evidence: docs(evidence), materials: docs(materials).filter((item: any) => ["course_letter", "partner_letter", "app_store_asset"].includes(item.category))};
});

export const getMyVerifiedCourseOnboardingV2 = getMyPartnerApplicationV2;

export const uploadPartnerApplicationEvidenceV2 = onCall({enforceAppCheck: true, timeoutSeconds: 60}, async (request) => {
  const uid = auth(request); const commandId = command(request); const id = applicationId(uid); const ref = db.collection("partner_applications_v2").doc(id);
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
  await staff(auth(request)); const snapshot = await db.collection("partner_applications_v2").orderBy("updatedAt", "desc").limit(250).get();
  return {schema: "golfriend.admin.partner-applications.v2", items: docs(snapshot)};
});

export const getPartnerApplicationAdminV2 = onCall({enforceAppCheck: true}, async (request) => {
  await staff(auth(request)); const id = String(request.data?.applicationId || ""); const ref = db.collection("partner_applications_v2").doc(id); const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Application missing.");
  const [messages, audits, evidence] = await Promise.all([ref.collection("messages").orderBy("createdAt").limit(100).get(), db.collection("partner_application_audits").where("applicationId", "==", id).limit(100).get(), ref.collection("evidence").limit(50).get()]);
  return {application: snapshot.data(), messages: docs(messages), audits: docs(audits), evidence: docs(evidence)};
});

export const sendAdminPartnerSupportMessageV2 = onCall({enforceAppCheck: true}, async (request) => {
  const role = await staff(auth(request)); const commandId = command(request); const id = String(request.data?.applicationId || ""); const message = String(request.data?.message || "").trim().slice(0, 2000);
  if (!message) throw new HttpsError("invalid-argument", "Message required.");
  const ref = db.collection("partner_applications_v2").doc(id); if (!(await ref.get()).exists) throw new HttpsError("not-found", "Application missing.");
  const receipt = immutableReceipt(id, commandId, "admin_message", Date.now());
  await Promise.all([ref.collection("messages").doc(receipt.id).create({id: receipt.id, sender: "admin", message, createdAt: at()}), db.collection("partner_application_audits").doc(receipt.id).create({...receipt, actorRole: role, createdAt: at()})]).catch((error: any) => { if (error?.code !== 6) throw error; });
  return {success: true, receipt};
});

export const reviewPartnerApplicationV2 = onCall({enforceAppCheck: true}, async (request) => {
  const role = await staff(auth(request)); const commandId = command(request); const id = String(request.data?.applicationId || ""); const to = String(request.data?.status || ""); const note = String(request.data?.note || "").trim().slice(0, 2000); const ref = db.collection("partner_applications_v2").doc(id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || !canReview(String(snapshot.data()?.status), to, role)) throw new HttpsError("failed-precondition", "Review transition denied.");
    let contract: ReturnType<typeof validateContractConfiguration> | null = null;
    if (to === "approved") {
      const representative = snapshot.data()?.representative; const agreement = snapshot.data()?.agreement;
      if (!representative?.authorityEvidenceId || agreement?.receiptId == null) throw new HttpsError("failed-precondition", "Verified representative and current agreement are required.");
      const approvalId = String(request.data?.contractApprovalId || "");
      const [representativeEvidence, agreementReceipt, approvalEvidence] = await Promise.all([tx.get(ref.collection("evidence").doc(representative.authorityEvidenceId)), tx.get(db.collection("partner_application_audits").doc(agreement.receiptId)), tx.get(db.collection("partner_contract_approvals").doc(approvalId))]);
      if (!representativeEvidence.exists || representativeEvidence.data()?.verificationStatus !== "verified" || !agreementReceipt.exists || agreementReceipt.data()?.version !== agreement.version || !approvalEvidence.exists || approvalEvidence.data()?.applicationId !== id) throw new HttpsError("failed-precondition", "Immutable onboarding approval evidence is incomplete.");
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
