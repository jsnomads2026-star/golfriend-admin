import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const here = join(__dirname, "..", "src"),
  src = readFileSync(join(here, "smallBusinessRuntime.ts"), "utf8"),
  index = readFileSync(join(here, "index.ts"), "utf8"),
  compactSrc = src.replace(/\s+/g, ""),
  rules = readFileSync(
    join(here, "..", "..", "enterprise-authority.firestore.rules"),
    "utf8",
  );
test("consumer schema and callable exports are stable", () => {
  assert.match(
    readFileSync(join(here, "smallBusinessDomain.ts"), "utf8"),
    /SMALL_BUSINESS_SCHEMA="golfriend\.small-business\.v1"/,
  );
  for (const name of [
    "getSmallBusinessPortalV1",
    "saveSmallBusinessProfileV1",
    "submitSmallBusinessApplicationV1",
    "withdrawSmallBusinessApplicationV1",
    "prepareSmallBusinessPromotionV1",
    "createSmallBusinessSubscriptionIntentV1",
    "discoverSmallBusinessesV1",
    "getSmallBusinessDetailV1",
    "recordSmallBusinessEngagementV1",
    "prepareSmallBusinessInquiryV1",
    "listSmallBusinessApplicationsAdminV1",
    "getSmallBusinessApplicationAdminV1",
    "decideSmallBusinessApplicationAdminV1",
    "reviewSmallBusinessPromotionAdminV1",
    "getSmallBusinessReportingAdminV1",
    "prepareSmallBusinessJhccReportAdminV1",
  ])
    assert.match(index, new RegExp(`\\b${name}\\b`));
});
test("profile correction callables and typed mobile contract are stable", () => {
  for (const name of [
    "getSmallBusinessProfileCorrectionV1",
    "saveSmallBusinessProfileCorrectionV1",
    "submitSmallBusinessProfileCorrectionV1",
    "withdrawSmallBusinessProfileCorrectionV1",
    "listSmallBusinessProfileCorrectionsAdminV1",
    "getSmallBusinessProfileCorrectionAdminV1",
    "decideSmallBusinessProfileCorrectionAdminV1",
  ])
    assert.match(index, new RegExp(`\\b${name}\\b`));
  const contract = readFileSync(
    join(here, "smallBusinessIntegrationContract.ts"),
    "utf8",
  );
  assert.match(contract, /discoverySource:"approved_canonical_profile"/);
  assert.match(contract, /newLocationPlaceholder:"new_<ordinal>"/);
});
test("portal projection matches the mounted consumer", () => {
  for (const token of [
    "business:{businessId",
    "legalName:x.profile",
    "registrationReference:x.profile",
    "serviceArea:x.profile",
    "supportedLocales:x.profile",
    "name:l.name",
    "label:l.name",
    "address:l.address",
    "countryCode:l.countryCode",
    "operatingHours:l.operatingHours",
    "evidenceReferences:(x.profile",
    "evidenceId:e.evidenceId",
    "objectReference:e.objectReference",
    "contentDigest:e.contentDigest",
    "plans:extras.plans",
    "subscriptionIntents:extras.subscriptionIntents",
    "promotions:extras.promotions",
    "receipts:extras.receipts",
    "version:z.businessVersion",
    "contentDigest:z.contentDigest",
    "disclosure:z.sponsoredDisclosure",
    "effectiveAt:iso",
    "expiresAt:iso",
  ])
    assert.ok(compactSrc.includes(token), token);
  for (const forbidden of ["contactEmail", "contactPhone", "representativeUid"])
    assert.doesNotMatch(
      compactSrc.slice(
        compactSrc.indexOf("functionportal"),
        compactSrc.indexOf("asyncfunctioncommand"),
      ),
      new RegExp(forbidden),
    );
});
test("plan catalogue is current EconomyConfig authority and intents are separate", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("asyncfunctioneconomyCatalogue"),
    compactSrc.indexOf("exportconstcreateSmallBusinessSubscriptionIntentV1"),
  );
  for (const token of [
    "enterprise_economy_config",
    "enterprise_economy_config_versions",
    "resolvePlan(configuration,pointer",
    "effectiveFrom:p.effectiveAt",
    "effectiveUntil:p.expiresAt",
    "features:p.features",
    'status:"available"',
  ])
    assert.ok(body.includes(token), token);
  assert.doesNotMatch(compactSrc, /priceDisplay/);
  const portalBody = compactSrc.slice(
    compactSrc.indexOf("exportconstgetSmallBusinessPortalV1"),
    compactSrc.indexOf("exportconstsaveSmallBusinessProfileV1"),
  );
  assert.match(portalBody, /economyCatalogue\(jurisdiction\)/);
  assert.match(portalBody, /subscriptionIntents:intents\.docs/);
});
test("subscription reads the intent before command creates writes", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("exportconstcreateSmallBusinessSubscriptionIntentV1"),
    compactSrc.indexOf("exportconstlistSmallBusinessApplicationsAdminV1"),
  );
  assert.ok(
    body.indexOf("constold=awaittx.get(ref)") <
      body.indexOf("cmd=awaitcommand"),
  );
});
test("engagement exact replay is one transaction", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("exportconstrecordSmallBusinessEngagementV1"),
    compactSrc.indexOf("exportconstprepareSmallBusinessInquiryV1"),
  );
  assert.match(
    body,
    /runTransaction\(async\(tx\)=>\{consts=awaittx\.get\(ref\)/,
  );
  assert.match(body, /payloadDigest/);
});
test("promotion publication trusts only server receipts and suppression state", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("exportconstreviewSmallBusinessPromotionAdminV1"),
    compactSrc.indexOf("exportconstdiscoverSmallBusinessesV1"),
  );
  for (const collection of [
    "small_business_promotion_policy_approvals",
    "small_business_contract_approvals",
    "small_business_promotion_suppressions",
    "small_business_delivery_suppressions",
    "small_business_promotion_publications",
  ])
    assert.ok(body.includes(collection));
  assert.match(body, /policyApprovalReceiptId!==undefined/);
  assert.match(body, /frequencySnap\.size>=x\.frequencyLimit/);
});
test("promotion runtime cannot override current state to publish", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("exportconstreviewSmallBusinessPromotionAdminV1"),
    compactSrc.indexOf("exportconstdiscoverSmallBusinessesV1"),
  );
  assert.match(body, /promotionTransition\(String\(x\.status\),decision\)/);
  assert.doesNotMatch(body, /\.\.\.x,status:"approved"/);
});
test("Admin decision uses decision and maps reactivate server-side", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("exportconstdecideSmallBusinessApplicationAdminV1"),
    compactSrc.indexOf("exportconstreviewSmallBusinessPromotionAdminV1"),
  );
  assert.match(body, /decision=String\(r\.data\?\.decision\)/);
  assert.match(body, /decision==="reactivate"\?"activate":decision/);
});
test("all Small Business backend collections deny direct clients", () => {
  for (const collection of [
    "small_businesses",
    "small_business_representative_bindings",
    "small_business_commands",
    "small_business_profile_corrections",
    "small_business_profile_correction_receipts",
    "small_business_profile_history",
    "small_business_subscription_intents",
    "small_business_promotions",
    "small_business_promotion_policy_approvals",
    "small_business_contract_approvals",
    "small_business_promotion_suppressions",
    "small_business_delivery_suppressions",
    "small_business_promotion_publications",
    "small_business_engagements",
    "small_business_report_events",
    "small_business_jhcc_preparations",
  ])
    assert.match(
      rules,
      new RegExp(
        `match /${collection}/\\{document=\\*\\*\\} \\{ allow read, write: if false; \\}`,
      ),
    );
});
test("report aggregation dedupes source evidence and JHCC replay is transactional", () => {
  const reporting = compactSrc.slice(
    compactSrc.indexOf("exportconstgetSmallBusinessReportingAdminV1"),
  );
  assert.match(reporting, /requireUniqueReportEvidence/);
  const jhcc = compactSrc.slice(
    compactSrc.indexOf("exportconstprepareSmallBusinessJhccReportAdminV1"),
  );
  assert.match(
    jhcc,
    /runTransaction\(async\(tx\)=>\{constold=awaittx\.get\(ref\)/,
  );
});
test("corrections preserve canonical discovery until Admin approval", () => {
  const save = compactSrc.slice(
    compactSrc.indexOf("exportconstsaveSmallBusinessProfileCorrectionV1"),
    compactSrc.indexOf("exportconstsubmitSmallBusinessProfileCorrectionV1"),
  );
  assert.match(save, /canonicalizeLocationIdentity/);
  assert.match(save, /\["approved","active"\]/);
  const decide = compactSrc.slice(
    compactSrc.indexOf(
      "exportconstdecideSmallBusinessProfileCorrectionAdminV1",
    ),
    compactSrc.indexOf("exportconstreviewSmallBusinessPromotionAdminV1"),
  );
  assert.match(decide, /baseBusinessVersion!==businessData\.version/);
  assert.match(decide, /small_business_profile_history/);
  assert.match(decide, /if\(decision==="approve"\)/);
  const discovery = compactSrc.slice(
    compactSrc.indexOf("exportconstdiscoverSmallBusinessesV1"),
    compactSrc.indexOf("exportconstgetSmallBusinessDetailV1"),
  );
  assert.doesNotMatch(discovery, /profile_corrections/);
});
test("terminal corrections restart in a new cycle with exact placeholder contract", () => {
  const save = compactSrc.slice(
    compactSrc.indexOf("exportconstsaveSmallBusinessProfileCorrectionV1"),
    compactSrc.indexOf("exportconstgetSmallBusinessProfileCorrectionV1"),
  );
  assert.match(save, /\["approved","rejected","withdrawn"\]/);
  assert.match(save, /Number\(x\.cycle\|\|1\)\+1/);
  assert.match(save, /correctionId=`sbc_/);
  assert.match(save, /submittedAt:terminal\?admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(save, /reviewedByRef:terminal\?admin\.firestore\.FieldValue\.delete\(\)/);
  const decide = compactSrc.slice(
    compactSrc.indexOf("exportconstdecideSmallBusinessProfileCorrectionAdminV1"),
    compactSrc.indexOf("exportconstreviewSmallBusinessPromotionAdminV1"),
  );
  assert.match(decide, /correctionId:x\.correctionId/);
  assert.match(decide, /cycle:x\.cycle/);
  assert.match(decide, /replacedByCorrectionId:x\.correctionId/);
  assert.match(decide, /correctionCycle:x\.cycle/);
  const contract = readFileSync(
    join(here, "smallBusinessIntegrationContract.ts"),
    "utf8",
  );
  assert.match(contract, /newLocationPlaceholder:"new_<ordinal>"/);
});
test("every command transaction rereads effective authority", () => {
  const body = compactSrc.slice(
    compactSrc.indexOf("asyncfunctioncommand"),
    compactSrc.indexOf("exportconstgetSmallBusinessPortalV1"),
  );
  assert.match(body, /authority=awaittx\.get\(binding\.ref\)/);
  assert.match(body, /!current\(authorityData\)/);
  assert.match(body, /Authoritychangedduringcommand/);
});
test("dual-role interleaving cannot replace request authority", () => {
  assert.doesNotMatch(compactSrc, /authorityRefs/);
  const representativeBody = compactSrc.slice(
    compactSrc.indexOf("asyncfunctionrepresentative"),
    compactSrc.indexOf("asyncfunctionreviewer"),
  );
  const reviewerBody = compactSrc.slice(
    compactSrc.indexOf("asyncfunctionreviewer"),
    compactSrc.indexOf("constfail"),
  );
  assert.match(representativeBody, /commandAuthority:\{ref:snap\.ref,kind:"representative"/);
  assert.match(reviewerBody, /commandAuthority:\{ref:snap\.ref,kind:"admin"/);
  const calls = compactSrc.match(/authority:a\.commandAuthority/g) || [];
  assert.equal(calls.length, 10, `all mutations must pass authority, found ${calls.length}`);
});
