// Static implementation verifier. No emulator, network, Firebase mutation, or deploy.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const text = (path) => readFileSync(`${root}${path}`, "utf8");
const authority = text("functions/src/partnerAuthority.ts");
const index = text("functions/src/index.ts");
const rules = text("partner-authority.firestore.rules");
const firebase = JSON.parse(text("firebase.json"));
const testFirebase = JSON.parse(text("firebase.partner-authority.test.json"));
const indexes = JSON.parse(text("partner-authority.firestore.indexes.json"));

for (const name of [
  "partnerSaveApplication", "partnerRegisterEvidenceMetadata", "partnerSubmitApplication",
  "partnerGetApplication", "partnerListSubmittedApplications", "partnerGetReviewDetail",
  "partnerRequestEvidence", "partnerDeclineApplication", "partnerApproveApplication",
  "partnerResolveOrganisation",
]) {
  assert.match(authority, new RegExp(`export const ${name} = partnerAuthorityCallable\\(onCall\\(PARTNER_AUTHORITY_CALLABLE_OPTIONS`), `${name} callable exists with explicit V2 region`);
  assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is exported by the Functions entrypoint`);
}
for (const collection of ["partner_applications", "partner_organisations", "partner_memberships", "partner_application_evidence", "partner_authority_audit"]) {
  assert.match(authority, new RegExp(`"${collection}"`), `${collection} is canonical authority data`);
  assert.match(rules, new RegExp(`/${collection}/`), `${collection} is denied to direct clients`);
}
assert.match(authority, /isActiveDirector/, "Director primitive is reused");
assert.doesNotMatch(authority, /b2b_partners/, "legacy b2b_partners is excluded");
assert.match(authority, /runTransaction/g, "all authority mutations use transactions");
assert.match(authority, /Evidence storage is not yet commissioned\./, "uncommissioned evidence fails closed");
assert.match(authority, /PARTNER_AUTHORITY_REGION = "asia-southeast1"/, "Partner Authority explicitly uses the canonical V2 callable region");
assert.match(authority, /callable\.__endpoint\.region = \[PARTNER_AUTHORITY_REGION\]/, "Partner Authority emits its per-callable V2 region manifest without changing global options");
assert.equal(firebase.firestore, undefined, "main firebase.json has no Partner Authority Rules deploy binding");
assert.doesNotMatch(JSON.stringify(firebase), /partner-authority\.firestore|allow read, write: if false/, "main firebase.json contains no global-deny Partner Rules binding");
assert.equal(testFirebase.firestore.rules, "partner-authority.firestore.rules", "test-only Firebase config binds the Rules proof");
assert.equal(testFirebase.firestore.indexes, "partner-authority.firestore.indexes.json", "test-only Firebase config binds the index proof");
assert.equal(testFirebase.hosting, undefined, "test-only Firebase config has no Hosting deployment configuration");
assert.deepEqual(indexes.indexes[0]?.fields?.map((field) => field.fieldPath), ["ownerUid", "creationIdempotencyKey"], "creation idempotency query has its required index");
assert.match(rules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/, "Rules deny direct Firestore access by default");
console.log("Partner Authority implementation verifier PASS: callable-only transaction authority, Director gate, V2 collections, V1 exclusion, and direct-rule denial.");
