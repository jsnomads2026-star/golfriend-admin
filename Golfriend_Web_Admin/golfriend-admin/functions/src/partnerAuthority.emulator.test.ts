// Local Firestore-emulator transaction test. It uses only synthetic IDs and
// Admin SDK access for fixture setup; browser access is tested separately under
// the deployed rules file. Run through `npm run test:partner-authority:emulator`.
import assert from "node:assert";
import * as admin from "firebase-admin";
import {
  approvePartnerApplication,
  declinePartnerApplication,
  getOwnPartnerApplication,
  registerPartnerEvidenceMetadata,
  requestPartnerEvidence,
  requireAuthenticatedUid,
  requireDirectorActor,
  resolveOwnPartnerOrganisation,
  savePartnerApplication,
  submitPartnerApplication,
} from "./partnerAuthority.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required for this test.");
if (!admin.apps.length) admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"});
const db = admin.firestore();
const run = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const uidA = `applicant_a_${run}`;
const uidB = `applicant_b_${run}`;
const uidDirector = `director_${run}`;
const uidManager = `manager_${run}`;
const app = (name: string) => `partner_${name}_${run}`;

const draft = {
  partnershipType: "enterprise",
  legalBusiness: {legalName: "Synthetic Golf Co", countryOfRegistration: "TH", registrationOrTaxId: "TEST-123", website: "https://example.test"},
  golfCourse: {name: "Synthetic Links", location: "Pattaya", address: "1 Test Lane", phone: "+660000000"},
};

function expectCode(promise: Promise<unknown> | (() => unknown), code: string, message?: string) {
  const work = typeof promise === "function" ? Promise.resolve().then(promise) : promise;
  return assert.rejects(work, (error: any) => error?.code === code && (!message || error?.message === message));
}

async function seedSubmitted(applicationId: string, ownerUid: string) {
  await db.collection("partner_applications").doc(applicationId).set({
    ownerUid,
    state: "submitted",
    draft,
    replayKeys: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function count(collection: string, applicationId: string): Promise<number> {
  const field = collection === "partner_memberships" ? "organisationId" : "applicationId";
  return (await db.collection(collection).where(field, "==", applicationId).get()).size;
}

async function main() {
  await db.collection("admin_users").doc(uidDirector).set({role: "Director", status: "Active"});
  await db.collection("admin_users").doc(uidManager).set({role: "Manager", status: "Active"});

  // 1. Ownership and direct draft mutation protection through the server service.
  const createARequest = {idempotencyKey: `create_a_${run}`, draft};
  const [createdA, replayedA] = await Promise.all([
    savePartnerApplication(db, uidA, createARequest),
    savePartnerApplication(db, uidA, createARequest),
  ]);
  assert.equal(createdA.applicationId, replayedA.applicationId);
  assert.equal((await db.collection("partner_applications").where("ownerUid", "==", uidA).where("creationIdempotencyKey", "==", createARequest.idempotencyKey).get()).size, 1);
  const createdB = await savePartnerApplication(db, uidB, {idempotencyKey: `create_b_${run}`, draft});
  const appA = String(createdA.applicationId);
  const appB = String(createdB.applicationId);
  await expectCode(getOwnPartnerApplication(db, uidA, {applicationId: appB}), "permission-denied");
  await expectCode(savePartnerApplication(db, uidA, {applicationId: appB, idempotencyKey: `cross_save_${run}`, draft}), "permission-denied");
  console.log("  ✓ applicant A cannot read or write applicant B application");

  // 2. Authentication and Director-only review authority.
  assert.throws(() => requireAuthenticatedUid(undefined), (error: any) => error?.code === "unauthenticated");
  await expectCode(requireDirectorActor(db, undefined), "unauthenticated");
  await expectCode(requireDirectorActor(db, uidManager), "permission-denied");
  const director = await requireDirectorActor(db, uidDirector);
  assert.equal(director, uidDirector);
  console.log("  ✓ unauthenticated and non-Director review calls are denied");

  // An upload authority record alone is not ready evidence. Submission must
  // fail closed until the Storage object is server-finalised and verified.
  await registerPartnerEvidenceMetadata(db, uidA, {
    applicationId: appA,
    idempotencyKey: `evidence_a_${run}`,
    metadata: {fileName: "tiny-test.pdf", contentType: "application/pdf"},
  });
  await expectCode(submitPartnerApplication(db, uidA, {applicationId: appA, idempotencyKey: `submit_a_${run}`}), "failed-precondition", "At least one server-verified ready evidence item is required before submission.");
  assert.equal(await count("partner_organisations", appA), 0);
  assert.equal(await count("partner_memberships", appA), 0);
  console.log("  ✓ unfinalised evidence cannot submit or create authority records");

  // 3. Evidence request and decline require reasons and write audit records.
  const evidenceApp = app("evidence");
  await seedSubmitted(evidenceApp, uidA);
  await expectCode(requestPartnerEvidence(db, uidDirector, {applicationId: evidenceApp, idempotencyKey: `request_missing_${run}`, reason: ""}), "invalid-argument");
  await requestPartnerEvidence(db, uidDirector, {applicationId: evidenceApp, idempotencyKey: `request_${run}`, reason: "Please provide licence evidence."});
  assert.equal((await db.collection("partner_applications").doc(evidenceApp).get()).data()?.state, "evidence_requested");
  assert.equal(await count("partner_authority_audit", evidenceApp), 1);

  const declineApp = app("decline");
  await seedSubmitted(declineApp, uidB);
  await expectCode(declinePartnerApplication(db, uidDirector, {applicationId: declineApp, idempotencyKey: `decline_missing_${run}`, reason: ""}), "invalid-argument");
  await declinePartnerApplication(db, uidDirector, {applicationId: declineApp, idempotencyKey: `decline_${run}`, reason: "Synthetic test decision."});
  assert.equal((await db.collection("partner_applications").doc(declineApp).get()).data()?.state, "declined");
  assert.equal(await count("partner_authority_audit", declineApp), 1);
  assert.equal(await count("partner_organisations", evidenceApp), 0);
  assert.equal(await count("partner_memberships", evidenceApp), 0);
  assert.equal(await count("partner_organisations", declineApp), 0);
  assert.equal(await count("partner_memberships", declineApp), 0);
  console.log("  ✓ Director reasons and immutable audits are enforced; non-approval states create no authority records");

  // 4–6. Concurrent/replayed approval creates the deterministic records once.
  const approvalApp = app("approve");
  await seedSubmitted(approvalApp, uidA);
  const approvalRequest = {applicationId: approvalApp, idempotencyKey: `approve_${run}`};
  const results = await Promise.all([
    approvePartnerApplication(db, uidDirector, approvalRequest),
    approvePartnerApplication(db, uidDirector, approvalRequest),
  ]);
  assert.equal(results[0].organisationId, approvalApp);
  assert.equal(results[1].organisationId, approvalApp);
  assert.equal(await count("partner_organisations", approvalApp), 1);
  assert.equal(await count("partner_memberships", approvalApp), 1);
  assert.equal(await count("partner_authority_audit", approvalApp), 1);
  const membership = await db.collection("partner_memberships").doc(`${approvalApp}_${uidA}`).get();
  assert.equal(membership.data()?.role, "owner");
  console.log("  ✓ concurrent/replayed approval creates exactly one organisation, owner membership, and decision audit");

  // 7. An approved owner may resolve only the membership tied to their UID.
  const resolved = await resolveOwnPartnerOrganisation(db, uidA, {organisationId: approvalApp});
  assert.equal(resolved.organisationId, approvalApp);
  await expectCode(resolveOwnPartnerOrganisation(db, uidB, {organisationId: approvalApp}), "permission-denied");
  await expectCode(resolveOwnPartnerOrganisation(db, uidB, {organisationId: evidenceApp}), "permission-denied");
  console.log("  ✓ approved owner resolves only their own organisation; unapproved applicant is denied");

  console.log("\npartner authority emulator transactions: PASS");
}

main().catch((error) => { console.error(error); process.exit(1); });
