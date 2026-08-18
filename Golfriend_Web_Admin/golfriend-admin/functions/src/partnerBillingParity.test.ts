import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {BOOKING_COMMISSION_BPS, GOLFRIEND_OWNED_RECEIVABLES, SMALL_BUSINESS_SUBSCRIPTION, TRIAL_DAYS, TRIAL_DISCOUNT_BPS} from "./partnerBillingDomain.js";
import {ECONOMY_POLICY_VERSIONS, PRICING_PROJECTION_DIGEST, PRICING_PROJECTION_SOURCE, economyPolicyFor} from "./generated/pricingProjection.js";
import {FOUNDING_COMMISSION_BPS} from "./partnerOnboardingDomain.js";

// generated/pricingProjection.ts is DERIVED from src/economy/economyConfig.mjs, the single
// pricing authority. This gate recomputes the digest from the authority and compares it to
// the one baked into the projection, so it catches both a stale projection and a hand edit
// of the generated file. If it fails, regenerate — never edit the assertion.
function locate(relative: string) {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, ...relative.split("/"));
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error(`${relative} not found — the pricing authority moved`);
}

const canonical = (value: any): any => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};

const DAY = "2026-08-18";
let cached: any = null;
const load = async () => (cached ??= await import(pathToFileURL(locate(PRICING_PROJECTION_SOURCE)).href));

test("the generated projection carries the digest of the authority it was derived from", async () => {
  const authority = await load();
  const digest = createHash("sha256").update(JSON.stringify(canonical(authority.ECONOMY_POLICY_VERSIONS))).digest("hex");
  assert.equal(digest, PRICING_PROJECTION_DIGEST, "projection is stale or hand-edited — run scripts/generate-pricing-projection.mjs");
});

test("the projected policy versions equal the authority's, value for value", async () => {
  const authority = await load();
  assert.deepEqual(canonical(ECONOMY_POLICY_VERSIONS), canonical(authority.ECONOMY_POLICY_VERSIONS));
});

test("effective dating resolves identically in the authority and the projection", async () => {
  const authority = await load();
  for (const day of ["2026-08-15", "2026-08-17", "2026-08-18", "2027-01-01"]) {
    assert.equal(economyPolicyFor(day)?.version, authority.economyPolicyFor(day)?.version, `divergent policy on ${day}`);
  }
  assert.equal(economyPolicyFor("2026-08-14"), null, "no policy before the first effective date");
  assert.equal(economyPolicyFor("not-a-day"), null);
});

test("the Enterprise commission has exactly one definition across every surface", async () => {
  const authority = await load();
  assert.equal(authority.economyPolicyFor(DAY).bookingCommissionBps, BOOKING_COMMISSION_BPS);
  assert.equal(FOUNDING_COMMISSION_BPS, BOOKING_COMMISSION_BPS, "partner onboarding must not re-declare the rate");
  assert.equal(BOOKING_COMMISSION_BPS, 300);
  assert.equal(authority.validateCommissionBps(301, DAY).reason, "rate_exceeds_authorized_ceiling");
});

test("Small Business subscription and trial terms come from the authority", async () => {
  const authority = await load();
  assert.deepEqual(authority.smallBusinessSubscription(DAY), {...SMALL_BUSINESS_SUBSCRIPTION});
  assert.equal(authority.smallBusinessSubscription("2026-08-17"), null, "the rate must not exist before its effective date");
  assert.deepEqual(authority.trialTerms(DAY), {days: TRIAL_DAYS, discountBps: TRIAL_DISCOUNT_BPS});
  assert.equal(TRIAL_DAYS, 90);
  assert.equal(TRIAL_DISCOUNT_BPS, 10000);
});

test("only the three Golfriend-owned receivables are invoiceable, and third-party money is prohibited", async () => {
  const authority = await load();
  const policy = authority.economyPolicyFor(DAY);
  assert.deepEqual(authority.golfriendOwnedReceivables(DAY), [...GOLFRIEND_OWNED_RECEIVABLES]);
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
  assert.equal(Object.isFrozen(ECONOMY_POLICY_VERSIONS), true);
  assert.equal(authority.policyAppliesToReceipt("2026-08-18.v1", "2026-08-17").reason, "policy_cannot_be_backdated");
  assert.equal(authority.policyAppliesToReceipt("2026-08-18.v1", "2026-09-01").applies, true);
});
