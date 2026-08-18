// Partner cancellation, renewal and trial-conversion rules.
//
// Every transition here fails closed: conversion to paid service happens only when EVERY
// precondition holds, and a missing precondition is reported by name rather than assumed.
// Refund amounts, tax treatment and jurisdiction-specific wording are deliberately absent —
// they are controlled by law and pending legal approval, and are not invented here.

import {TRIAL_DAYS} from "./partnerBillingDomain.js";

export const PARTNER_LIFECYCLE_SCHEMA = "golfriend.partner-lifecycle.v1";

/** Notice lead times before trial conversion, in days. */
export const TRIAL_NOTICE_DAYS = [30, 14, 7, 1] as const;
/** Read-only/export access retained after a trial cancellation. */
export const POST_CANCELLATION_READ_ONLY_DAYS = 30;

export type ApplicationState = "draft" | "submitted" | "under_review" | "info_needed" | "approved" | "rejected" | "suspended";
export type PartnerTier = "small_business" | "enterprise";

const DAY_MS = 86400000;
const iso = (v: unknown) => {
  const t = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(t) || Number.isNaN(Date.parse(t))) throw new Error("DATE_INVALID");
  return t;
};

/** A partner may withdraw an application at any point before approval — never after. */
export function canWithdrawApplication(state: ApplicationState) {
  const withdrawable: ApplicationState[] = ["draft", "submitted", "under_review", "info_needed"];
  return {
    allowed: withdrawable.includes(state),
    reason: withdrawable.includes(state) ? "withdrawable_before_approval" : `not_withdrawable_in_state:${state}`,
  };
}

/**
 * Cancel during the trial. Always zero due, operational activity stops immediately, and a
 * read-only/export window follows so the partner can retrieve their own data.
 */
export function cancelDuringTrial(input: {cancelledAt: string; trialStartsAt: string; trialEndsAt: string}) {
  const cancelledAt = iso(input?.cancelledAt), startsAt = iso(input?.trialStartsAt), endsAt = iso(input?.trialEndsAt);
  const at = Date.parse(cancelledAt);
  if (at < Date.parse(startsAt) || at >= Date.parse(endsAt)) throw new Error("NOT_WITHIN_TRIAL");
  return Object.freeze({
    schema: PARTNER_LIFECYCLE_SCHEMA,
    cancelledAt,
    amountDueMinor: 0,
    operationalActivity: "disabled_immediately" as const,
    readOnlyUntil: new Date(at + POST_CANCELLATION_READ_ONLY_DAYS * DAY_MS).toISOString(),
    exportAvailable: true,
    convertsToPaid: false,
    reason: "cancelled_during_trial_zero_due",
  });
}

export interface ConversionInput {
  agreementAuthorizesPostTrialBilling: boolean;
  documentsValid: boolean;
  adminApprovalActive: boolean;
  cancelled: boolean;
  billingDetailsPresent: boolean;
}

/**
 * The trial converts to paid service only when all five preconditions hold. Missing ones are
 * listed, so an operator sees exactly why a conversion did not happen.
 */
export function conversionEligibility(input: ConversionInput) {
  const blockers: string[] = [];
  if (input?.agreementAuthorizesPostTrialBilling !== true) blockers.push("agreement_does_not_authorize_post_trial_billing");
  if (input?.documentsValid !== true) blockers.push("required_documents_invalid_or_expired");
  if (input?.adminApprovalActive !== true) blockers.push("admin_approval_not_active");
  if (input?.cancelled === true) blockers.push("partner_cancelled");
  if (input?.billingDetailsPresent !== true) blockers.push("billing_details_missing");
  return Object.freeze({converts: blockers.length === 0, blockers: Object.freeze(blockers)});
}

/** Notice instants at 30, 14, 7 and 1 day before conversion, earliest first. */
export function trialNoticeSchedule(trialEndsAt: string) {
  const endsAt = iso(trialEndsAt), end = Date.parse(endsAt);
  return Object.freeze(
    [...TRIAL_NOTICE_DAYS]
      .sort((a, b) => b - a)
      .map(days => Object.freeze({daysBefore: days, sendAt: new Date(end - days * DAY_MS).toISOString()}))
  );
}

/** Notices that are due at `now` and not yet sent. Idempotent: `sent` is the caller's record. */
export function dueTrialNotices(trialEndsAt: string, nowIso: string, sent: readonly number[] = []) {
  const now = Date.parse(iso(nowIso));
  return trialNoticeSchedule(trialEndsAt).filter(n => Date.parse(n.sendAt) <= now && now < Date.parse(iso(trialEndsAt)) && !sent.includes(n.daysBefore));
}

/**
 * Small Business renews monthly. Cancelling before the next billing boundary prevents the
 * next period; cancelling after it has passed does not retroactively undo the current one.
 */
export function smallBusinessCancellation(input: {cancelledAt: string; nextBillingAt: string}) {
  const cancelledAt = iso(input?.cancelledAt), nextBillingAt = iso(input?.nextBillingAt);
  const beforeBoundary = Date.parse(cancelledAt) < Date.parse(nextBillingAt);
  return Object.freeze({
    schema: PARTNER_LIFECYCLE_SCHEMA, tier: "small_business" as PartnerTier, cancelledAt, nextBillingAt,
    preventsNextPeriod: beforeBoundary,
    serviceEndsAt: nextBillingAt,
    amountDueMinor: 0,
    reason: beforeBoundary ? "cancelled_before_billing_boundary_next_period_prevented" : "cancelled_after_billing_boundary_current_period_stands",
  });
}

/**
 * Enterprise terminates under the signed agreement. Commission already accrued on verified
 * Golfriend-attributed bookings remains due — termination is not a waiver.
 */
export function enterpriseTermination(input: {terminatedAt: string; accruedVerifiedCommissionMinor: number; agreementTerminationClauseRef: string}) {
  const terminatedAt = iso(input?.terminatedAt);
  const accrued = Number(input?.accruedVerifiedCommissionMinor);
  if (!Number.isSafeInteger(accrued) || accrued < 0) throw new Error("ACCRUED_COMMISSION_INVALID");
  const clause = String(input?.agreementTerminationClauseRef || "");
  if (!clause) throw new Error("AGREEMENT_TERMINATION_CLAUSE_REQUIRED");
  return Object.freeze({
    schema: PARTNER_LIFECYCLE_SCHEMA, tier: "enterprise" as PartnerTier, terminatedAt,
    agreementTerminationClauseRef: clause,
    accruedVerifiedCommissionMinor: accrued,
    amountDueMinor: accrued,
    futureCommission: "none_after_termination" as const,
    reason: "accrued_verified_commission_remains_due",
    // Refund, tax and jurisdiction-specific consequences are controlled by law and the
    // signed agreement. They are not computed here.
    refundTreatment: "subject_to_controlling_law_and_legal_approval" as const,
  });
}

/** The immutable trial window created at approval. Exactly one per approved partner. */
export function activateTrial(activatedAt: string) {
  const startsAt = iso(activatedAt);
  return Object.freeze({
    schema: PARTNER_LIFECYCLE_SCHEMA, startsAt,
    endsAt: new Date(Date.parse(startsAt) + TRIAL_DAYS * DAY_MS).toISOString(),
    days: TRIAL_DAYS, immutable: true as const,
  });
}

/** Truthful remaining-days display. Never negative, never rounded up past the end. */
export function trialStatus(trialStartsAt: string, trialEndsAt: string, nowIso: string, cancelledAt: string | null = null) {
  const startsAt = iso(trialStartsAt), endsAt = iso(trialEndsAt), now = Date.parse(iso(nowIso));
  if (cancelledAt) return {state: "cancelled" as const, daysRemaining: 0, startsAt, endsAt};
  if (now < Date.parse(startsAt)) return {state: "pending" as const, daysRemaining: TRIAL_DAYS, startsAt, endsAt};
  if (now >= Date.parse(endsAt)) return {state: "ended" as const, daysRemaining: 0, startsAt, endsAt};
  return {state: "active" as const, daysRemaining: Math.ceil((Date.parse(endsAt) - now) / DAY_MS), startsAt, endsAt};
}
