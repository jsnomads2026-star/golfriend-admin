// Callable-boundary proof against local Auth, Firestore, and Functions emulators.
import assert from "node:assert";
import * as admin from "firebase-admin";
import {initializeApp, deleteApp} from "firebase/app";
import {getAuth, connectAuthEmulator, signInAnonymously} from "firebase/auth";
import {getFunctions, connectFunctionsEmulator, httpsCallable} from "firebase/functions";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required for this test.");
if (!admin.apps.length) admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"});
const db = admin.firestore();
const run = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const applicationId = `partner_callable_${run}`;

function client(name: string) {
  const app = initializeApp({apiKey: "demo-partner-authority", authDomain: "demo-partner-authority.local", projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"}, name);
  const auth = getAuth(app);
  const functions = getFunctions(app, "asia-southeast1");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {app, auth, functions};
}

async function expectCode(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: any) => error?.code === code);
}

async function main() {
  const unsigned = client(`partner-unsigned-${run}`);
  await expectCode(httpsCallable(unsigned.functions, "partnerListSubmittedApplications")({}), "functions/unauthenticated");
  await deleteApp(unsigned.app);

  const applicant = client(`partner-applicant-${run}`);
  const applicantCredential = await signInAnonymously(applicant.auth);
  await expectCode(httpsCallable(applicant.functions, "partnerListSubmittedApplications")({}), "functions/permission-denied");
  await expectCode(httpsCallable(applicant.functions, "partnerApproveApplication")({applicationId, idempotencyKey: `approve_${run}`}), "functions/permission-denied");
  await deleteApp(applicant.app);

  const directorClient = client(`partner-director-${run}`);
  const directorCredential = await signInAnonymously(directorClient.auth);
  await db.collection("admin_users").doc(directorCredential.user.uid).set({role: "Director", status: "Active"});
  await db.collection("partner_applications").doc(applicationId).set({
    ownerUid: applicantCredential.user.uid,
    state: "submitted",
    draft: {
      partnershipType: "enterprise",
      legalBusiness: {legalName: "Callable Synthetic Co", countryOfRegistration: "TH", registrationOrTaxId: "TEST-456"},
      golfCourse: {name: "Callable Links", location: "Pattaya", address: "2 Test Lane", phone: "+660000001"},
    },
    replayKeys: {},
  });
  const listed = await httpsCallable(directorClient.functions, "partnerListSubmittedApplications")({});
  assert.equal((listed.data as any).applications.length, 1);
  await expectCode(httpsCallable(directorClient.functions, "partnerRequestEvidence")({applicationId, idempotencyKey: `missing_reason_${run}`, reason: ""}), "functions/invalid-argument");
  const decision = await httpsCallable(directorClient.functions, "partnerRequestEvidence")({applicationId, idempotencyKey: `request_${run}`, reason: "Provide test evidence."});
  assert.equal((decision.data as any).state, "evidence_requested");
  assert.equal((await db.collection("partner_authority_audit").where("applicationId", "==", applicationId).get()).size, 1);
  await deleteApp(directorClient.app);
  console.log("Partner Authority callable emulator proof PASS: unauthenticated/non-Director denied; active Director list and reasoned evidence request succeed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
