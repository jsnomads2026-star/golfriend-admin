import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

// The activation transaction cannot execute without the Firestore emulator, so this gate
// asserts the wiring contract in source: what authority is used, what is created with
// tx.create (duplicate-safe), and what may never be trusted from the client.
const src = fs.readFileSync(path.join(__dirname, "..", "src", "partnerActivationRuntime.ts"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");

test("the final tier is derived server-side and never read straight from the request", () => {
  assert.match(src, /resolveFinalTier\(\{applicationOrganizationType:app\.data\(\)\?\.organizationType/);
  // The old `tier=String(r.data?.tier||"small_business")` would have granted a client-chosen
  // tier by default. Any reintroduction of that pattern fails here.
  assert.doesNotMatch(src, /tier\s*=\s*String\(r\.data\?\.tier\s*\|\|\s*"small_business"\)/);
  assert.match(src, /adminTierDecision=String\(r\.data\?\.tier\|\|""\)/, "an Admin override must be explicit, not defaulted");
});

test("activation creates exactly one organization, role, trial and statement, duplicate-safe", () => {
  for (const created of [
    /tx\.create\(orgRef/,
    /tx\.create\(db\.collection\("partner_memberships"\)/,
    /tx\.create\(db\.collection\("partner_trials"\)\.doc\(orgId\)/,
    /tx\.create\(db\.collection\("partner_statements"\)\.doc\(firstStatement\.statementId\)/,
  ]) assert.match(src, created, `must be created transactionally: ${created}`);
  // Deterministic ids mean a concurrent or retried activation collides instead of duplicating.
  assert.match(src, /orgId=organizationId\(appId\)/);
  assert.match(src, /if\(org\.exists\)\{[^}]*restarted:true/, "an existing organization must short-circuit, not re-create");
});

test("the Portal role document is written only during a successful activation", () => {
  assert.match(src, /tx\.set\(db\.collection\("b2b_partners"\)\.doc\(owner\),\{uid:owner,organizationId:orgId,status:"active_partner",tier/);
  assert.match(src, /app\.data\(\)\?\.status!=="approved"/, "activation requires an approved application");
});

test("an accepted agreement with a digest is required before a statement is issued", () => {
  assert.match(src, /if\(!agreement\?\.version\|\|!agreement\?\.digest\)throw new HttpsError/);
  assert.match(src, /buildFirstTrialStatement\(\{organizationId:orgId,applicationId:appId,tier,activatedAt,agreementVersion/);
});

test("Portal and Admin read the same stored receipt and never recalculate it", () => {
  assert.match(src, /export const getPartnerTrialReceiptV1=onCall/);
  assert.match(src, /export const getAdminPartnerTrialReceiptV1=onCall/);
  assert.match(src, /async function storedTrialReceipt\(orgId:string\)/);
  // One shared reader, so the two surfaces cannot diverge.
  assert.equal((src.match(/storedTrialReceipt\(/g) || []).length, 3, "both callables must use the one shared reader");
  assert.match(src, /verifyStoredStatement\(sealed\)/, "a stored receipt must be digest-verified on read");
  assert.doesNotMatch(src, /buildFirstTrialStatement[\s\S]{0,200}storedTrialReceipt/, "reads must not rebuild the statement");
});

test("cross-organization and unauthenticated access fail closed on both readers", () => {
  assert.match(src, /if\(requested&&requested!==orgId\)throw new HttpsError\("permission-denied","Cross-organization access denied\."\)/);
  assert.match(src, /const uid=await currentAccount\(r\),membership=await member\(uid\)/, "partner reader requires an active membership");
  assert.match(src, /await staff\(await currentAccount\(r\)\)/, "admin reader requires active staff");
  assert.equal((src.match(/enforceAppCheck:true/g) || []).length >= 2, true);
});

test("both receipt callables are exported from the functions entrypoint", () => {
  assert.match(index, /getPartnerTrialReceiptV1/);
  assert.match(index, /getAdminPartnerTrialReceiptV1/);
});

test("activation writes no external-money field", () => {
  for (const banned of ["entryFee", "prize", "escrow", "wager", "stake", "teeTimePayment", "organizerFunds"]) {
    assert.doesNotMatch(src, new RegExp(`${banned}\\s*:`), `activation must never write ${banned}`);
  }
});

// --- Regressions proven against the Firebase emulator by
// --- scripts/partner-acquisition-journey-emulator.mjs, pinned here so a refactor cannot
// --- silently reintroduce either defect.

test("a retried activation is decided BEFORE the candidate-state gate", () => {
  // The first activation moves the candidate to "activation_ready". While the candidate state
  // was checked first, the restart branch could never run and every retry failed with
  // "Approved application and candidate required." — proven against the emulator.
  const restart = src.indexOf("if(org.exists){");
  const candidateGate = src.indexOf('candidate.data()?.status!=="admin_review_required"');
  assert.ok(restart > 0 && candidateGate > 0, "both branches must exist");
  assert.ok(restart < candidateGate, "the restart branch must be evaluated before the candidate-state gate");
  // A restart must still prove the organization belongs to THIS application and course.
  assert.match(src, /if\(org\.data\(\)\?\.sourceApplicationId!==appId\|\|!org\.data\(\)\?\.authorizedCourseIds\?\.includes\(courseId\)\)throw new HttpsError\("already-exists"/);
});

test("a retried activation never creates a second trial or statement", () => {
  // Deterministic ids plus tx.create are what make the retry collide instead of duplicating.
  assert.match(src, /tx\.create\(db\.collection\("partner_trials"\)\.doc\(orgId\)/);
  assert.match(src, /tx\.create\(db\.collection\("partner_statements"\)\.doc\(firstStatement\.statementId\)/);
});

test("a missing or malformed contract approval id fails closed with a stated reason", () => {
  const onboarding = fs.readFileSync(path.join(__dirname, "..", "src", "partnerOnboardingRuntime.ts"), "utf8");
  // An empty id reached Firestore as an empty document path and surfaced as INTERNAL rather
  // than as the missing-evidence precondition — proven against the emulator.
  assert.match(onboarding, /if \(!\/\^pca_\[a-f0-9\]\{32\}\$\/\.test\(approvalId\)\) throw new HttpsError\("failed-precondition"/);
  const guard = onboarding.indexOf("test(approvalId)");
  const read = onboarding.indexOf('db.collection("partner_contract_approvals").doc(approvalId)');
  assert.ok(guard > 0 && read > 0 && guard < read, "the id must be validated before it is used as a document path");
});
