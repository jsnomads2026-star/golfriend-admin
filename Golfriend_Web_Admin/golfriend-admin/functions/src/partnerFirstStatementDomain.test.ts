import assert from "node:assert/strict";
import test from "node:test";
import {buildFirstTrialStatement, classifyOrganizationShape, resolveFinalTier, statementId, statementNumber, verifyStoredStatement} from "./partnerFirstStatementDomain.js";

const DIGEST = "e16d5070c66bbf4b89beade4407b415def779076c71dbb48237db7b1157adc11";
const base = {
  organizationId: "org_acme", applicationId: "pa_1", activatedAt: "2026-09-01T00:00:00.000Z",
  agreementVersion: "golfriend.course-partner.v1", agreementDigest: DIGEST,
};

test("final tier is decided server-side and never from client-selected intent", () => {
  // A course-shaped organization IS an Enterprise relationship. It does not wait on a contract
  // record: a real golf course used to land on Small Business purely because the approval had
  // not been written yet.
  assert.equal(resolveFinalTier({applicationOrganizationType: "golf_course"}), "enterprise");
  assert.equal(resolveFinalTier({applicationOrganizationType: "enterprise"}), "enterprise");
  assert.equal(resolveFinalTier({applicationOrganizationType: "country_club"}), "enterprise");
  // ...and an Admin cannot downgrade a course to Small Business.
  assert.equal(resolveFinalTier({applicationOrganizationType: "golf_course", adminTierDecision: "small_business"}), "enterprise");
  // Small Business covers organizers, cafes, restaurants, transport, accommodation and
  // similar approved service categories.
  for (const type of ["golf_cafe", "restaurant", "organizer", "transport", "accommodation", "brand"]) {
    assert.equal(resolveFinalTier({applicationOrganizationType: type, contractApproved: true, contractCommissionBps: 300}), "small_business", type);
  }
  // Least privilege for anything unclassified, and for absent evidence.
  assert.equal(resolveFinalTier({}), "small_business", "absent evidence must not grant Enterprise");
  assert.equal(resolveFinalTier({applicationOrganizationType: "something_new"}), "small_business");
  // An Admin override must be an explicit valid value; junk falls back to derivation.
  assert.equal(resolveFinalTier({adminTierDecision: "enterprise"}), "enterprise");
  assert.equal(resolveFinalTier({adminTierDecision: "master_host", applicationOrganizationType: "golf_cafe"}), "small_business");
});

test("organization shape classification separates course from Small Business categories", () => {
  assert.equal(classifyOrganizationShape("GOLF_COURSE"), "course");
  assert.equal(classifyOrganizationShape("cafe"), "small_business");
  assert.equal(classifyOrganizationShape(""), "unclassified");
  assert.equal(classifyOrganizationShape(undefined), "unclassified");
});

test("Small Business first statement is $29.00 normal, $29.00 discount, $0.00 due", () => {
  const statement = buildFirstTrialStatement({...base, tier: "small_business"});
  assert.equal(statement.totals.normalMinor, 2900);
  assert.equal(statement.totals.discountMinor, 2900);
  assert.equal(statement.totals.dueMinor, 0);
  assert.equal(statement.totals.payableMinor, 0);
  assert.equal(statement.currency, "USD");
  assert.equal(statement.basis.kind, "subscription");
  assert.equal(statement.lines[0]!.discountReason, "trial_100_percent");
});

test("Enterprise first statement shows a truthful zero basis, not an invented figure", () => {
  const statement = buildFirstTrialStatement({...base, tier: "enterprise"});
  assert.equal(statement.totals.dueMinor, 0);
  assert.equal(statement.totals.normalMinor, 0, "no verified attributed bookings exist yet");
  assert.equal(statement.basis.kind, "attributed_bookings");
  assert.equal((statement.basis as any).verifiedBookingCount, 0);
  assert.equal((statement.basis as any).grossMinor, 0);
  assert.match((statement.basis as any).note, /no_verified_attributed_bookings_yet/);
  assert.equal(statement.lines.length, 0, "an empty basis must not fabricate a commission line");
});

test("the receipt carries pricing version, trial dates, agreement digest and organization", () => {
  const statement = buildFirstTrialStatement({...base, tier: "small_business"});
  assert.equal(statement.pricingPolicyVersion, "2026-08-18.v1");
  assert.equal(statement.trialStartsAt, "2026-09-01T00:00:00.000Z");
  assert.equal(statement.trialEndsAt, "2026-11-30T00:00:00.000Z");
  assert.equal(statement.trialDays, 90);
  assert.equal(statement.agreementDigest, DIGEST);
  assert.equal(statement.organizationId, "org_acme");
  assert.equal(statement.immutable, true);
  assert.equal(statement.legalReviewComplete, false);
});

test("statement id and number are deterministic per organization so a retry cannot mint a second", () => {
  assert.equal(statementId("org_acme"), statementId("org_acme"));
  assert.notEqual(statementId("org_acme"), statementId("org_other"));
  assert.match(statementNumber("org_acme"), /^GF-TRIAL-[0-9A-F]{10}$/);
  assert.equal(buildFirstTrialStatement({...base, tier: "small_business"}).statementId, statementId("org_acme"));
});

test("a zero-due trial receipt issues as final without any tax authority", () => {
  const statement = buildFirstTrialStatement({...base, tier: "small_business"});
  assert.equal(statement.issueMode, "final");
  assert.equal(statement.tax.collected, false);
  assert.equal(statement.tax.state, "authority_missing");
  assert.notEqual(statement.tax.treatment, "exempt", "absent authority must not read as exempt");
  assert.match(statement.issueReason, /needs_no_tax_authority/);
});

test("the external money boundary is restated on the receipt", () => {
  const statement = buildFirstTrialStatement({...base, tier: "enterprise"});
  assert.match(statement.externalMoneyBoundary, /Tournament entry fees, prizes, organizer funds, betting, stakes and escrow remain outside Golfriend/);
});

test("the digest seals the receipt so post-issue alteration is detectable", () => {
  const statement = buildFirstTrialStatement({...base, tier: "small_business"});
  assert.equal(verifyStoredStatement(statement).valid, true);
  // Portal and Admin read the same stored doc; tampering with either copy is caught.
  const tampered = {...statement, totals: {...statement.totals, dueMinor: 999}};
  assert.equal(verifyStoredStatement(tampered).valid, false);
  assert.equal(verifyStoredStatement(tampered).reason, "receipt_digest_mismatch");
  assert.equal(verifyStoredStatement({schema: "other"}).valid, false);
});

test("invalid organization, tier or agreement evidence fails closed", () => {
  assert.throws(() => buildFirstTrialStatement({...base, organizationId: "x", tier: "small_business"}), /ORGANIZATION_INVALID/);
  assert.throws(() => buildFirstTrialStatement({...base, tier: "gold" as any}), /TIER_INVALID/);
  assert.throws(() => buildFirstTrialStatement({...base, tier: "small_business", agreementDigest: "short"}), /AGREEMENT_EVIDENCE_INVALID/);
  assert.throws(() => buildFirstTrialStatement({...base, tier: "small_business", agreementVersion: ""}), /AGREEMENT_EVIDENCE_INVALID/);
});
