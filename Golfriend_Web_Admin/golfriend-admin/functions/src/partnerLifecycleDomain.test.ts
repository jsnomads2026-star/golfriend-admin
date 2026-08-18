import assert from "node:assert/strict";
import test from "node:test";
import {
  POST_CANCELLATION_READ_ONLY_DAYS, TRIAL_NOTICE_DAYS, activateTrial, canWithdrawApplication,
  cancelDuringTrial, conversionEligibility, dueTrialNotices, enterpriseTermination,
  smallBusinessCancellation, trialNoticeSchedule, trialStatus,
} from "./partnerLifecycleDomain.js";
import {TAX_AUTHORITY_SCHEMA, resolveTaxAuthority, statementIssueMode, taxMinor, type TaxAuthorityConfig} from "./partnerTaxAuthority.js";

const ACTIVATED = "2026-09-01T00:00:00.000Z";
const trial = activateTrial(ACTIVATED);
const ok: Parameters<typeof conversionEligibility>[0] = {
  agreementAuthorizesPostTrialBilling: true, documentsValid: true,
  adminApprovalActive: true, cancelled: false, billingDetailsPresent: true,
};

test("exactly one immutable 90-day trial is created at activation", () => {
  assert.equal(trial.days, 90);
  assert.equal(trial.startsAt, ACTIVATED);
  assert.equal(trial.endsAt, "2026-11-30T00:00:00.000Z");
  assert.equal(trial.immutable, true);
  assert.equal(Object.isFrozen(trial), true);
});

test("an application may be withdrawn before approval and never after", () => {
  for (const state of ["draft", "submitted", "under_review", "info_needed"] as const) {
    assert.equal(canWithdrawApplication(state).allowed, true, state);
  }
  for (const state of ["approved", "rejected", "suspended"] as const) {
    assert.equal(canWithdrawApplication(state).allowed, false, state);
  }
  assert.match(canWithdrawApplication("approved").reason, /not_withdrawable_in_state:approved/);
});

test("trial cancellation is zero due, stops activity immediately and keeps a 30-day export window", () => {
  const result = cancelDuringTrial({cancelledAt: "2026-10-01T00:00:00.000Z", trialStartsAt: trial.startsAt, trialEndsAt: trial.endsAt});
  assert.equal(result.amountDueMinor, 0);
  assert.equal(result.operationalActivity, "disabled_immediately");
  assert.equal(result.exportAvailable, true);
  assert.equal(result.convertsToPaid, false);
  assert.equal(result.readOnlyUntil, "2026-10-31T00:00:00.000Z");
  assert.equal(POST_CANCELLATION_READ_ONLY_DAYS, 30);
  assert.throws(() => cancelDuringTrial({cancelledAt: "2026-12-01T00:00:00.000Z", trialStartsAt: trial.startsAt, trialEndsAt: trial.endsAt}), /NOT_WITHIN_TRIAL/);
});

test("conversion to paid requires all five preconditions and names every blocker", () => {
  assert.deepEqual({...conversionEligibility(ok)}, {converts: true, blockers: []});
  const cases: [keyof typeof ok, unknown, string][] = [
    ["agreementAuthorizesPostTrialBilling", false, "agreement_does_not_authorize_post_trial_billing"],
    ["documentsValid", false, "required_documents_invalid_or_expired"],
    ["adminApprovalActive", false, "admin_approval_not_active"],
    ["cancelled", true, "partner_cancelled"],
    ["billingDetailsPresent", false, "billing_details_missing"],
  ];
  for (const [field, value, blocker] of cases) {
    const result = conversionEligibility({...ok, [field]: value} as any);
    assert.equal(result.converts, false, field);
    assert.ok(result.blockers.includes(blocker), `${field} → ${blocker}`);
  }
  assert.equal(conversionEligibility({} as any).blockers.length, 4, "an empty input must not silently convert");
});

test("trial-ending notices are scheduled at 30, 14, 7 and 1 day before conversion", () => {
  const schedule = trialNoticeSchedule(trial.endsAt);
  assert.deepEqual(schedule.map(s => s.daysBefore), [30, 14, 7, 1]);
  assert.deepEqual([...TRIAL_NOTICE_DAYS], [30, 14, 7, 1]);
  assert.equal(schedule[0]!.sendAt, "2026-10-31T00:00:00.000Z");
  assert.equal(schedule[3]!.sendAt, "2026-11-29T00:00:00.000Z");
  // Due notices are those reached but not yet sent, so re-running sends nothing twice.
  assert.deepEqual(dueTrialNotices(trial.endsAt, "2026-11-16T00:00:00.000Z", []).map(n => n.daysBefore), [30, 14]);
  assert.deepEqual(dueTrialNotices(trial.endsAt, "2026-11-16T00:00:00.000Z", [30, 14]).map(n => n.daysBefore), []);
  assert.deepEqual(dueTrialNotices(trial.endsAt, "2026-10-01T00:00:00.000Z", []).map(n => n.daysBefore), []);
});

test("Small Business cancellation before the billing boundary prevents the next period", () => {
  const before = smallBusinessCancellation({cancelledAt: "2026-12-10T00:00:00.000Z", nextBillingAt: "2026-12-30T00:00:00.000Z"});
  assert.equal(before.preventsNextPeriod, true);
  assert.equal(before.amountDueMinor, 0);
  assert.equal(before.serviceEndsAt, "2026-12-30T00:00:00.000Z");
  const after = smallBusinessCancellation({cancelledAt: "2026-12-31T00:00:00.000Z", nextBillingAt: "2026-12-30T00:00:00.000Z"});
  assert.equal(after.preventsNextPeriod, false);
  assert.match(after.reason, /current_period_stands/);
});

test("Enterprise termination leaves accrued verified commission due and invents no refund", () => {
  const result = enterpriseTermination({terminatedAt: "2027-02-01T00:00:00.000Z", accruedVerifiedCommissionMinor: 4500, agreementTerminationClauseRef: "clause_9_2"});
  assert.equal(result.amountDueMinor, 4500);
  assert.equal(result.futureCommission, "none_after_termination");
  assert.equal(result.refundTreatment, "subject_to_controlling_law_and_legal_approval");
  assert.throws(() => enterpriseTermination({terminatedAt: "2027-02-01T00:00:00.000Z", accruedVerifiedCommissionMinor: 1, agreementTerminationClauseRef: ""}), /AGREEMENT_TERMINATION_CLAUSE_REQUIRED/);
});

test("trial status displays truthfully and never reports negative days", () => {
  assert.deepEqual(trialStatus(trial.startsAt, trial.endsAt, "2026-08-01T00:00:00.000Z").state, "pending");
  const active = trialStatus(trial.startsAt, trial.endsAt, "2026-11-25T00:00:00.000Z");
  assert.equal(active.state, "active");
  assert.equal(active.daysRemaining, 5);
  assert.deepEqual(trialStatus(trial.startsAt, trial.endsAt, "2027-01-01T00:00:00.000Z").daysRemaining, 0);
  assert.equal(trialStatus(trial.startsAt, trial.endsAt, "2027-01-01T00:00:00.000Z").state, "ended");
  assert.equal(trialStatus(trial.startsAt, trial.endsAt, "2026-11-25T00:00:00.000Z", "2026-10-01T00:00:00.000Z").state, "cancelled");
});

// ---- tax authority ----

const approved: TaxAuthorityConfig = {
  schema: TAX_AUTHORITY_SCHEMA, version: "tax.2026-08-18.v1", jurisdiction: "TH",
  registrationId: "TH-VAT-0001", treatment: "standard_rated", rateBps: 700,
  approvedBy: "Founder", effectiveFrom: "2026-08-18",
};

test("missing tax configuration is authority_missing, never treated as exempt", () => {
  const resolution = resolveTaxAuthority(null, "TH", "2026-12-01");
  assert.equal(resolution.state, "authority_missing");
  assert.equal(resolution.mayCollect, false);
  assert.equal(resolution.treatment, null, "an absent configuration must not resolve to a treatment");
  assert.notEqual(resolution.treatment, "exempt");
  assert.throws(() => taxMinor(2900, resolution), /TAX_AUTHORITY_REQUIRED/);
});

test("unapproved, mismatched, unregistered and not-yet-effective configurations all fail closed", () => {
  assert.equal(resolveTaxAuthority({...approved, approvedBy: ""}, "TH", "2026-12-01").state, "authority_unapproved");
  assert.equal(resolveTaxAuthority({...approved, jurisdiction: "SG"}, "TH", "2026-12-01").state, "authority_missing");
  assert.equal(resolveTaxAuthority({...approved, registrationId: ""}, "TH", "2026-12-01").reason, "no_tax_registration");
  assert.equal(resolveTaxAuthority({...approved, effectiveFrom: "2027-01-01"}, "TH", "2026-12-01").state, "authority_not_effective");
  for (const r of [
    resolveTaxAuthority({...approved, approvedBy: ""}, "TH", "2026-12-01"),
    resolveTaxAuthority({...approved, effectiveFrom: "2027-01-01"}, "TH", "2026-12-01"),
  ]) assert.equal(r.mayCollect, false);
});

test("a configured zero rate is legitimate and distinct from absent authority", () => {
  const zero = resolveTaxAuthority({...approved, treatment: "zero_rated", rateBps: 0}, "TH", "2026-12-01");
  assert.equal(zero.state, "configured");
  assert.equal(zero.mayCollect, true);
  assert.equal(taxMinor(2900, zero), 0);
  assert.equal(taxMinor(2900, resolveTaxAuthority(approved, "TH", "2026-12-01")), 203);
});

test("zero-due trial statements issue as final without tax authority", () => {
  const mode = statementIssueMode({trial: true, dueMinor: 0, tax: resolveTaxAuthority(null, "TH", "2026-10-01")});
  assert.equal(mode.mode, "final");
  assert.equal(mode.taxCollected, false);
  assert.match(mode.reason, /needs_no_tax_authority/);
});

test("post-trial statements with an amount due stay pro forma until tax authority exists", () => {
  const missing = statementIssueMode({trial: false, dueMinor: 2900, tax: resolveTaxAuthority(null, "TH", "2026-12-01")});
  assert.equal(missing.mode, "pro_forma");
  assert.equal(missing.taxCollected, false);
  assert.match(missing.reason, /pro_forma_pending_tax_authority:no_tax_authority_configured_for_jurisdiction/);
  const configured = statementIssueMode({trial: false, dueMinor: 2900, tax: resolveTaxAuthority(approved, "TH", "2026-12-01")});
  assert.equal(configured.mode, "final");
  assert.equal(configured.taxCollected, true);
});
