// Synthetic Auth + Firestore + Storage emulator proof for private Partner evidence.
import assert from "node:assert/strict";
import * as admin from "firebase-admin";
import {initializeApp, deleteApp} from "firebase/app";
import {getAuth, connectAuthEmulator, signInAnonymously} from "firebase/auth";
import {getStorage, connectStorageEmulator, getBytes, listAll, ref, uploadBytes} from "firebase/storage";
import {
  finalizePartnerEvidenceUpload,
  getPartnerEvidenceAccess,
  requestPartnerEvidenceUpload,
  savePartnerApplication,
  submitPartnerApplication,
} from "./partnerAuthority.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error("Firestore and Storage emulators are required for this test.");
}
if (!admin.apps.length) admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority", storageBucket: "demo-partner-authority.appspot.com"});
const db = admin.firestore();
const run = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const projectId = process.env.GCLOUD_PROJECT || "demo-partner-authority";
const bucket = `${projectId}.appspot.com`;

const draft = {
  partnershipType: "enterprise",
  legalBusiness: {legalName: "Synthetic Evidence Golf Co", countryOfRegistration: "TH", registrationOrTaxId: "EVIDENCE-TEST-123"},
  golfCourse: {name: "Synthetic Evidence Links", location: "Pattaya", address: "10 Synthetic Lane", phone: "+660000000"},
};

function client(name: string) {
  const app = initializeApp({apiKey: "demo-partner-authority", authDomain: "demo-partner-authority.local", projectId, storageBucket: bucket}, name);
  const auth = getAuth(app);
  const storage = getStorage(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  return {app, auth, storage};
}

async function denied(work: Promise<unknown>) {
  await assert.rejects(work, (error: any) => error?.code === "storage/unauthorized" || error?.code === "permission-denied");
}

async function main() {
  const owner = client(`evidence-owner-${run}`);
  const ownerCredential = await signInAnonymously(owner.auth);
  const ownerUid = ownerCredential.user.uid;
  const created = await savePartnerApplication(db, ownerUid, {idempotencyKey: `create_${run}`, draft});
  const applicationId = String(created.applicationId);

  const requested = await requestPartnerEvidenceUpload(db, ownerUid, {
    applicationId,
    idempotencyKey: `request_${run}`,
    fileName: "synthetic-evidence.pdf",
    contentType: "application/pdf",
  });
  const evidenceId = String(requested.evidenceId);
  const storagePath = String(requested.storagePath);
  assert.equal(storagePath, `partner_application_evidence/${applicationId}/${evidenceId}/original`);

  const unsigned = client(`evidence-unsigned-${run}`);
  await denied(uploadBytes(ref(unsigned.storage, storagePath), new Uint8Array([1, 2, 3]), {contentType: "application/pdf"}));
  await deleteApp(unsigned.app);

  const other = client(`evidence-other-${run}`);
  await signInAnonymously(other.auth);
  await assert.rejects(() => requestPartnerEvidenceUpload(db, other.auth.currentUser!.uid, {applicationId, idempotencyKey: `wrong_request_${run}`, fileName: "other.pdf", contentType: "application/pdf"}), (error: any) => error?.code === "permission-denied");
  await denied(uploadBytes(ref(other.storage, storagePath), new Uint8Array([1, 2, 3]), {contentType: "application/pdf"}));
  await denied(uploadBytes(ref(other.storage, `partner_application_evidence/${applicationId}/${evidenceId}/other`), new Uint8Array([1]), {contentType: "application/pdf"}));
  await assert.rejects(() => finalizePartnerEvidenceUpload(db, other.auth.currentUser!.uid, {applicationId, evidenceId, idempotencyKey: `wrong_owner_${run}`}), (error: any) => error?.code === "permission-denied");
  await deleteApp(other.app);
  console.log("  ✓ unauthenticated and wrong-owner uploads/finalisation are denied");

  await denied(uploadBytes(ref(owner.storage, `partner_application_evidence/${applicationId}/not-authorized-id/original`), new Uint8Array([1]), {contentType: "application/pdf"}));
  await assert.rejects(() => requestPartnerEvidenceUpload(db, ownerUid, {applicationId, idempotencyKey: `bad_type_${run}`, fileName: "bad.gif", contentType: "image/gif"}), (error: any) => error?.code === "invalid-argument");
  const oversized = await requestPartnerEvidenceUpload(db, ownerUid, {applicationId, idempotencyKey: `oversized_${run}`, fileName: "large.pdf", contentType: "application/pdf"});
  await denied(uploadBytes(ref(owner.storage, String(oversized.storagePath)), new Uint8Array(10 * 1024 * 1024 + 1), {contentType: "application/pdf"}));
  const missing = await requestPartnerEvidenceUpload(db, ownerUid, {applicationId, idempotencyKey: `missing_${run}`, fileName: "missing.pdf", contentType: "application/pdf"});
  await assert.rejects(() => finalizePartnerEvidenceUpload(db, ownerUid, {applicationId, evidenceId: missing.evidenceId, idempotencyKey: `missing_finalize_${run}`}), (error: any) => error?.code === "failed-precondition");
  await assert.rejects(() => finalizePartnerEvidenceUpload(db, ownerUid, {applicationId, evidenceId, idempotencyKey: `forged_${run}`, sha256: "0".repeat(64)}), (error: any) => error?.code === "invalid-argument");
  console.log("  ✓ wrong path/type, oversized object, missing object, and forged integrity are rejected");

  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]);
  await uploadBytes(ref(owner.storage, storagePath), bytes, {contentType: "application/pdf"});
  await denied(getBytes(ref(owner.storage, storagePath)));
  await denied(listAll(ref(owner.storage, "partner_application_evidence")));
  await denied(uploadBytes(ref(owner.storage, storagePath), bytes, {contentType: "application/pdf"}));
  const finalized = await finalizePartnerEvidenceUpload(db, ownerUid, {applicationId, evidenceId, idempotencyKey: `finalize_${run}`});
  assert.equal(finalized.storageState, "ready");
  assert.match(String(finalized.sha256), /^[a-f0-9]{64}$/);
  const replayed = await finalizePartnerEvidenceUpload(db, ownerUid, {applicationId, evidenceId, idempotencyKey: `finalize_${run}`});
  assert.deepEqual(replayed, finalized);
  const finalizedAudits = await db.collection("partner_authority_audit")
    .where("applicationId", "==", applicationId)
    .where("action", "==", "evidence_upload_finalized")
    .get();
  assert.equal(finalizedAudits.size, 1);
  await assert.rejects(() => finalizePartnerEvidenceUpload(db, ownerUid, {applicationId, evidenceId, idempotencyKey: `different_finalize_${run}`}), (error: any) => error?.code === "failed-precondition");
  assert.equal((await db.collection("partner_authority_audit")
    .where("applicationId", "==", applicationId)
    .where("action", "==", "evidence_upload_finalized")
    .get()).size, 1);
  await assert.rejects(() => finalizePartnerEvidenceUpload(db, other.auth.currentUser!.uid, {applicationId, evidenceId, idempotencyKey: `finalize_${run}`}), (error: any) => error?.code === "permission-denied");
  assert.deepEqual(new Uint8Array(await getBytes(ref(owner.storage, storagePath))), bytes);
  console.log("  ✓ owner request → private upload → server SHA-256 finalise → ready; replay is idempotent and no overwrite/audit duplicate occurs");

  await assert.rejects(() => submitPartnerApplication(db, ownerUid, {applicationId, idempotencyKey: `submit_forged_${run}`, sha256: "bad"}), (error: any) => error?.code === "invalid-argument");
  const submitted = await submitPartnerApplication(db, ownerUid, {applicationId, idempotencyKey: `submit_${run}`});
  assert.equal(submitted.state, "submitted");
  const director = client(`evidence-director-${run}`);
  const directorCredential = await signInAnonymously(director.auth);
  await db.collection("admin_users").doc(directorCredential.user.uid).set({role: "Director", status: "Active"});
  const access = await getPartnerEvidenceAccess(db, directorCredential.user.uid, {applicationId, evidenceId});
  assert.equal(access.delivery, "authenticated_storage_get_only");
  assert.equal(access.publicUrl, null);
  assert.deepEqual(new Uint8Array(await getBytes(ref(director.storage, storagePath))), bytes);
  await deleteApp(director.app);
  console.log("  ✓ submission requires ready evidence; only the owner and active Director receive private access without a URL");

  await deleteApp(owner.app);
  console.log("\npartner evidence Storage emulator proof: PASS");
}

main().catch((error) => { console.error(error); process.exit(1); });
