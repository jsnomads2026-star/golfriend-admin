import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_COMMISSION_BPS, EXTERNAL_MONEY_KINDS, GOLFRIEND_OWNED_RECEIVABLES, SMALL_BUSINESS_SUBSCRIPTION,
  TRIAL_DAYS, buildPartnerStatement, commissionMinor, trialWindowFor, withinTrial,
} from "./partnerBillingDomain.js";

const ACTIVATED = "2026-09-01T00:00:00.000Z";
const window = trialWindowFor(ACTIVATED);
const base = {
  organizationId: "org_acme", agreementAccepted: true,
  trialStartsAt: window.startsAt, trialEndsAt: window.endsAt,
};
const inTrial = { ...base, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z" };
const afterTrial = { ...base, periodStart: "2026-12-01T00:00:00.000Z", periodEnd: "2027-01-01T00:00:00.000Z" };
const booking = (id: string, grossMinor: number, attributionVerified = true) => ({ bookingId: id, grossMinor, currency: "USD", attributionVerified });

test("the trial window is 90 days and immutable from the activation instant", () => {
  assert.equal(window.days, TRIAL_DAYS);
  assert.equal(window.startsAt, ACTIVATED);
  assert.equal(window.endsAt, "2026-11-30T00:00:00.000Z");
  assert.equal(Object.isFrozen(window), true);
  assert.equal(withinTrial("2026-11-29T23:59:59.000Z", window.startsAt, window.endsAt), true);
  assert.equal(withinTrial("2026-11-30T00:00:00.000Z", window.startsAt, window.endsAt), false);
});

test("Small Business trial statements show $29.00 normal, $29.00 discount and $0.00 due", () => {
  const statement = buildPartnerStatement({ ...inTrial, tier: "small_business" });
  assert.equal(statement.lines.length, 1);
  const [line] = statement.lines;
  assert.equal(line.kind, "small_business_subscription");
  assert.equal(line.currency, "USD");
  assert.equal(line.normalMinor, 2900);
  assert.equal(line.discountMinor, 2900);
  assert.equal(line.dueMinor, 0);
  assert.equal(line.discountReason, "trial_100_percent");
  assert.deepEqual({ ...statement.totals }, { normalMinor: 2900, discountMinor: 2900, dueMinor: 0, taxMinor: 0, payableMinor: 0 });
});

test("Small Business bills the normal subscription after the trial and never a commission", () => {
  const statement = buildPartnerStatement({ ...afterTrial, tier: "small_business" });
  assert.deepEqual({ ...statement.totals }, { normalMinor: 2900, discountMinor: 0, dueMinor: 2900, taxMinor: 0, payableMinor: 2900 });
  assert.equal(statement.lines.every(l => l.kind !== "enterprise_attributed_commission"), true);
  // Even if bookings are supplied, Small Business must fail closed rather than deduct commission.
  assert.throws(() => buildPartnerStatement({ ...afterTrial, tier: "small_business", attributedBookings: [booking("b1", 10000)] }), /SMALL_BUSINESS_COMMISSION_FORBIDDEN/);
});

test("Enterprise trial statements show the calculated commission fully discounted to zero due", () => {
  const statement = buildPartnerStatement({ ...inTrial, tier: "enterprise", attributedBookings: [booking("b1", 20000), booking("b2", 15000)] });
  assert.equal(statement.lines.length, 2);
  // 3% of 20000 = 600, of 15000 = 450.
  assert.deepEqual(statement.lines.map(l => l.normalMinor), [600, 450]);
  assert.deepEqual({ ...statement.totals }, { normalMinor: 1050, discountMinor: 1050, dueMinor: 0, taxMinor: 0, payableMinor: 0 });
  assert.equal(statement.lines.every(l => l.discountReason === "trial_100_percent"), true);
});

test("Enterprise charges 3% only after the trial, and never a subscription alongside it", () => {
  const statement = buildPartnerStatement({ ...afterTrial, tier: "enterprise", attributedBookings: [booking("b1", 20000)] });
  assert.deepEqual({ ...statement.totals }, { normalMinor: 600, discountMinor: 0, dueMinor: 600, taxMinor: 0, payableMinor: 600 });
  assert.equal(statement.lines.some(l => l.kind === "small_business_subscription"), false, "Enterprise must not be double charged a subscription");
  assert.equal(commissionMinor(20000, BOOKING_COMMISSION_BPS), 600);
});

test("bookings without verified Golfriend attribution are excluded, not charged", () => {
  const statement = buildPartnerStatement({ ...afterTrial, tier: "enterprise", attributedBookings: [booking("b1", 20000), booking("b2", 99999, false)] });
  assert.equal(statement.lines.length, 1);
  assert.equal(statement.lines[0].reference, "b1");
  assert.equal(statement.excludedUnverifiedBookings, 1);
  assert.equal(statement.totals.dueMinor, 600);
});

test("custom work is billable only under a separately accepted quote", () => {
  const accepted = buildPartnerStatement({ ...afterTrial, tier: "small_business", acceptedCustomWork: [{ quoteId: "q1", amountMinor: 50000, currency: "USD", accepted: true }] });
  assert.equal(accepted.totals.dueMinor, 2900 + 50000);
  assert.throws(() => buildPartnerStatement({ ...afterTrial, tier: "small_business", acceptedCustomWork: [{ quoteId: "q1", amountMinor: 50000, currency: "USD", accepted: false }] }), /CUSTOM_WORK_NOT_ACCEPTED/);
});

test("billing outside the trial requires an accepted agreement", () => {
  assert.throws(() => buildPartnerStatement({ ...afterTrial, tier: "small_business", agreementAccepted: false }), /AGREEMENT_NOT_ACCEPTED/);
  // Inside the trial an unaccepted agreement still yields no charge rather than an invoice.
  const statement = buildPartnerStatement({ ...inTrial, tier: "small_business", agreementAccepted: false });
  assert.equal(statement.totals.dueMinor, 0);
});

test("only Golfriend-owned receivables exist and third-party money can never be a line kind", () => {
  assert.deepEqual([...GOLFRIEND_OWNED_RECEIVABLES], ["small_business_subscription", "enterprise_attributed_commission", "accepted_custom_work"]);
  for (const external of EXTERNAL_MONEY_KINDS) {
    assert.equal(GOLFRIEND_OWNED_RECEIVABLES.includes(external as never), false, `${external} must never be billable`);
  }
  const statement = buildPartnerStatement({ ...inTrial, tier: "enterprise", attributedBookings: [booking("b1", 20000)] });
  assert.equal(statement.lines.every(l => GOLFRIEND_OWNED_RECEIVABLES.includes(l.kind)), true);
  assert.match(statement.externalMoneyBoundary, /Tournament entry fees, prizes, organizer funds, betting, stakes and escrow remain outside Golfriend/);
  assert.equal(statement.legalReviewComplete, false);
});

test("the subscription rate is carried in minor units so no float reaches a statement", () => {
  assert.deepEqual({ ...SMALL_BUSINESS_SUBSCRIPTION }, { currency: "USD", amountMinor: 2900, period: "monthly" });
  assert.equal(Number.isSafeInteger(SMALL_BUSINESS_SUBSCRIPTION.amountMinor), true);
});
