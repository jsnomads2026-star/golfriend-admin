// Callable-boundary proof against local Auth, Firestore, and Functions emulators.
import assert from "node:assert";
import * as admin from "firebase-admin";
import {initializeApp, deleteApp} from "firebase/app";
import {CustomProvider, initializeAppCheck} from "firebase/app-check";
import {getAuth, connectAuthEmulator, signInAnonymously} from "firebase/auth";
import {getFunctions, connectFunctionsEmulator, httpsCallable} from "firebase/functions";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST is required for this test.");
if (!admin.apps.length) admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"});
const db = admin.firestore();
const run = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const applicationId = `partner_callable_${run}`;
const blockedApplicationId = `partner_appcheck_blocked_${run}`;
type AppCheckMode = "missing" | "invalid" | "valid";

function syntheticAppCheckToken(subject: string) {
  const header = Buffer.from(JSON.stringify({alg: "none", typ: "JWT"})).toString("base64url");
  const payload = Buffer.from(JSON.stringify({sub: subject, aud: "demo-partner-authority", exp: Math.floor(Date.now() / 1000) + 3600})).toString("base64url");
  return `${header}.${payload}.emulator-test-only`;
}

function client(name: string, appCheckMode: AppCheckMode = "valid") {
  const app = initializeApp({apiKey: "demo-partner-authority", authDomain: "demo-partner-authority.local", projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"}, name);
  if (appCheckMode !== "missing") {
    // The dedicated emulator runner enables firebase-functions' documented
    // test-only token verifier bypass. This client still supplies a token;
    // production never receives that environment flag and enforces App Check.
    initializeAppCheck(app, {
      provider: new CustomProvider({getToken: async () => ({
        token: appCheckMode === "valid" ? syntheticAppCheckToken(`appcheck-${name}`) : "not-a-valid-app-check-token",
        expireTimeMillis: Date.now() + 60_000,
      })}),
      isTokenAutoRefreshEnabled: false,
    });
  }
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
  const unsigned = client(`partner-unsigned-${run}`, "missing");
  await expectCode(httpsCallable(unsigned.functions, "partnerListSubmittedApplications")({}), "functions/unauthenticated");
  await expectCode(httpsCallable(unsigned.functions, "partnerRequestEvidenceUpload")({applicationId, idempotencyKey: `request_${run}`, fileName: "synthetic.pdf", contentType: "application/pdf"}), "functions/unauthenticated");
  await expectCode(httpsCallable(unsigned.functions, "partnerFinalizeEvidenceUpload")({applicationId, evidenceId: applicationId, idempotencyKey: `finalize_${run}`}), "functions/unauthenticated");
  await deleteApp(unsigned.app);

  const missingAppCheck = client(`partner-appcheck-missing-${run}`, "missing");
  await signInAnonymously(missingAppCheck.auth);
  await expectCode(httpsCallable(missingAppCheck.functions, "partnerSaveApplication")({
    applicationId: blockedApplicationId,
    idempotencyKey: `appcheck_missing_${run}`,
    draft: {
      partnershipType: "enterprise",
      legalBusiness: {legalName: "Blocked Synthetic Co", countryOfRegistration: "TH", registrationOrTaxId: "TEST-BLOCKED"},
      golfCourse: {name: "Blocked Links", location: "Pattaya", address: "3 Test Lane", phone: "+660000003"},
    },
  }), "functions/unauthenticated");
  assert.equal((await db.collection("partner_applications").doc(blockedApplicationId).get()).exists, false);
  await deleteApp(missingAppCheck.app);

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
  console.log("Partner Authority callable emulator proof PASS: synthetic valid App Check preserves applicant and active-Director authority gates.");
}

main().catch((error) => { console.error(error); process.exit(1); });
