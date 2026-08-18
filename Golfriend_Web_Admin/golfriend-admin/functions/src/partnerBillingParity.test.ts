import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {
  BOOKING_COMMISSION_BPS, GOLFRIEND_OWNED_RECEIVABLES, PARTNER_BILLING_POLICY_VERSION,
  SMALL_BUSINESS_SUBSCRIPTION, TRIAL_DAYS, TRIAL_DISCOUNT_BPS,
} from "./partnerBillingDomain.js";
import {FOUNDING_COMMISSION_BPS} from "./partnerOnboardingDomain.js";

// functions/ has `rootDir: "src"`, so it cannot import src/economy/economyConfig.mjs at
// compile time. The rate therefore exists in two surfaces, and this gate is what stops them
// drifting: it loads the central authority at runtime and asserts the mirror matches.
// If this test fails, the fix is to correct the mirror -- never to edit the assertion.
function locateEconomyConfig() {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, "src", "economy", "economyConfig.mjs");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error("economyConfig.mjs not found — the central pricing authority moved");
}

const DAY = "2026-08-18";
let cached: any = null;
const load = async () => (cached ??= await import(pathToFileURL(locateEconomyConfig()).href));

test("the central pricing authority is effective and Founder approved", async () => {
  const authority = await load();
  const policy = authority.economyPolicyFor(DAY);
  assert.ok(policy, "no effective economy policy");
  assert.equal(policy.version, PARTNER_BILLING_POLICY_VERSION);
  assert.equal(policy.approvedBy, "Founder");
  assert.equal(authority.economyPolicyFor("2026-08-17").version, "2026-08-15.v1", "earlier days keep the earlier version");
});

test("the Enterprise commission has one value across every surface", async () => {
  const authority = await load();
  const policy = authority.economyPolicyFor(DAY);
  assert.equal(policy.bookingCommissionBps, BOOKING_COMMISSION_BPS);
  assert.equal(FOUNDING_COMMISSION_BPS, BOOKING_COMMISSION_BPS, "partner onboarding must not re-declare the rate");
  assert.equal(BOOKING_COMMISSION_BPS, 300);
  assert.equal(authority.validateCommissionBps(300, DAY).valid, true);
  assert.equal(authority.validateCommissionBps(301, DAY).reason, "rate_exceeds_authorized_ceiling");
});

test("the Small Business subscription comes from the authority, not a local literal", async () => {
  const authority = await load();
  assert.deepEqual(authority.smallBusinessSubscription(DAY), {...SMALL_BUSINESS_SUBSCRIPTION});
  assert.equal(authority.smallBusinessSubscription("2026-08-17"), null, "the rate must not exist before its effective date");
});

test("trial terms are 90 days at a 100% discount in both surfaces", async () => {
  const authority = await load();
  assert.deepEqual(authority.trialTerms(DAY), {days: TRIAL_DAYS, discountBps: TRIAL_DISCOUNT_BPS});
  assert.equal(TRIAL_DAYS, 90);
  assert.equal(TRIAL_DISCOUNT_BPS, 10000);
});

test("only the three Golfriend-owned receivables are invoiceable, and third-party money is prohibited", async () => {
  const authority = await load();
  const policy = authority.economyPolicyFor(DAY);
  assert.deepEqual(authority.golfriendOwnedReceivables(DAY), [...GOLFRIEND_OWNED_RECEIVABLES]);
  for (const kind of GOLFRIEND_OWNED_RECEIVABLES) assert.equal(authority.isGolfriendOwnedReceivable(kind, DAY), true);
  for (const external of ["course_tee_time_payment", "tournament_entry_fee", "tournament_prize", "organizer_funds", "betting", "stakes", "escrow"]) {
    assert.equal(authority.isGolfriendOwnedReceivable(external, DAY), false, `${external} must never be invoiceable`);
  }
  for (const banned of ["course tee-time payment", "tournament entry fee", "tournament prize", "organizer funds", "betting", "stakes", "escrow", "Small Business booking commission"]) {
    assert.ok(policy.prohibited.includes(banned), `policy must prohibit ${banned}`);
  }
});

test("policy versions stay immutable and cannot be backdated", async () => {
  const authority = await load();
  assert.equal(Object.isFrozen(authority.ECONOMY_POLICY_VERSIONS), true);
  assert.equal(authority.policyAppliesToReceipt(PARTNER_BILLING_POLICY_VERSION, "2026-08-17").reason, "policy_cannot_be_backdated");
  assert.equal(authority.policyAppliesToReceipt(PARTNER_BILLING_POLICY_VERSION, "2026-09-01").applies, true);
});
