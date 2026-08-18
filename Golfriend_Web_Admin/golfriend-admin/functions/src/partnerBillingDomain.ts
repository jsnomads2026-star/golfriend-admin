// Partner statement generation for GOLFRIEND-OWNED receivables only.
//
// The partner onboarding contract defaults every partner to
// `invoiceState: "external_authority_required"`. That default is overturned here for
// exactly three receivables and no others: the Small Business subscription, verified
// Enterprise Golfriend-attributed commission, and separately accepted custom work.
// Course tee-time payments, Tournament entry fees, prizes, organizer funds, betting,
// stakes and escrow are third-party money and can never appear on a Golfriend statement.
//
// Rates are NOT decided here and NOT re-declared here. They are read from
// generated/pricingProjection.ts, a digest-verified projection of the single authority in
// src/economy/economyConfig.mjs. Every statement resolves the policy effective on its own
// period, so a future Founder rate takes effect by adding a version and regenerating —
// no change to this module, the Portal or the Web.

import {economyPolicyFor, type EconomyPolicyVersion} from "./generated/pricingProjection.js";
import {resolveTaxAuthority, statementIssueMode, taxMinor, type TaxAuthorityConfig} from "./partnerTaxAuthority.js";

export const PARTNER_STATEMENT_SCHEMA = "golfriend.partner-statement.v1";
export const BASIS_POINT_SCALE = 10000;

/** Named so a caller cannot smuggle third-party money in under a vague label. */
export const EXTERNAL_MONEY_KINDS = ["course_tee_time_payment", "tournament_entry_fee", "tournament_prize", "organizer_funds", "betting", "stakes", "escrow"] as const;

/** Resolve the governing policy for a day, or fail closed. Never defaults to a rate. */
export function pricingPolicyOn(day: string): EconomyPolicyVersion {
  const policy = economyPolicyFor(day);
  if (!policy) throw new Error("NO_EFFECTIVE_PRICING_POLICY");
  return policy;
}

const dayOf = (isoInstant: string) => isoInstant.slice(0, 10);

/** Receivables Golfriend may invoice on a day. Absent kind → external money. */
export const golfriendOwnedReceivables = (day: string) => pricingPolicyOn(day).golfriendOwnedReceivables ?? [];

/** Current-day convenience for callers that are not statement-scoped. */
const TODAY = () => new Date().toISOString().slice(0, 10);
export const BOOKING_COMMISSION_BPS = pricingPolicyOn("2026-08-18").bookingCommissionBps;
export const TRIAL_DAYS = pricingPolicyOn("2026-08-18").trialDays!;
export const TRIAL_DISCOUNT_BPS = pricingPolicyOn("2026-08-18").trialDiscountBps!;
export const SMALL_BUSINESS_SUBSCRIPTION = pricingPolicyOn("2026-08-18").smallBusinessSubscription!;
export const GOLFRIEND_OWNED_RECEIVABLES = golfriendOwnedReceivables("2026-08-18");
export const currentPricingPolicy = () => pricingPolicyOn(TODAY());

export type PartnerTier = "small_business" | "enterprise";
export type ReceivableKind = typeof GOLFRIEND_OWNED_RECEIVABLES[number];

export interface AttributedBooking {
  bookingId: string;
  grossMinor: number;
  currency: string;
  /** Only a server-verified Golfriend attribution may be charged commission. */
  attributionVerified: boolean;
}

export interface AcceptedCustomWork {
  quoteId: string;
  amountMinor: number;
  currency: string;
  /** Custom work is billable only under a separately accepted quote. */
  accepted: boolean;
}

export interface StatementLine {
  kind: ReceivableKind;
  description: string;
  reference: string | null;
  currency: string;
  /** What the line would cost at the normal rate, always shown even when fully discounted. */
  normalMinor: number;
  discountMinor: number;
  dueMinor: number;
  discountReason: "trial_100_percent" | null;
}

const isMinor = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const iso = (v: unknown) => {
  const t = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(t) || Number.isNaN(Date.parse(t))) throw new Error("DATE_INVALID");
  return t;
};

/** 3% of gross, rounded half-up in minor units so no fraction of a cent is invented. */
export function commissionMinor(grossMinor: number, bps: number) {
  if (!isMinor(grossMinor) || !Number.isSafeInteger(bps) || bps < 0 || bps > BASIS_POINT_SCALE) throw new Error("COMMISSION_INPUT_INVALID");
  return Math.round((grossMinor * bps) / BASIS_POINT_SCALE);
}

/** A statement period lies in the trial when it starts before the trial ends. */
export function withinTrial(periodStartIso: string, trialStartsAtIso: string | null, trialEndsAtIso: string | null) {
  if (!trialStartsAtIso || !trialEndsAtIso) return false;
  const start = Date.parse(iso(periodStartIso)), tStart = Date.parse(iso(trialStartsAtIso)), tEnd = Date.parse(iso(trialEndsAtIso));
  return start >= tStart && start < tEnd;
}

/** The immutable trial window for an activation. Callers never compute this themselves. */
export function trialWindowFor(activatedAtIso: string) {
  const startsAt = iso(activatedAtIso);
  return Object.freeze({ startsAt, endsAt: new Date(Date.parse(startsAt) + TRIAL_DAYS * 86400000).toISOString(), days: TRIAL_DAYS });
}

function line(policy: EconomyPolicyVersion, kind: ReceivableKind, description: string, reference: string | null, currency: string, normalMinor: number, trial: boolean): StatementLine {
  // Authorization is re-checked against the policy governing THIS statement, so a receivable
  // that a later version stops authorizing cannot be billed under it.
  if (!(policy.golfriendOwnedReceivables ?? []).includes(kind)) throw new Error("RECEIVABLE_NOT_GOLFRIEND_OWNED");
  const discountBps = trial ? (policy.trialDiscountBps ?? 0) : 0;
  const discountMinor = Math.round((normalMinor * discountBps) / BASIS_POINT_SCALE);
  return { kind, description, reference, currency, normalMinor, discountMinor, dueMinor: normalMinor - discountMinor, discountReason: trial ? "trial_100_percent" : null };
}

export interface StatementInput {
  tier: PartnerTier;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  agreementAccepted: boolean;
  attributedBookings?: readonly AttributedBooking[];
  acceptedCustomWork?: readonly AcceptedCustomWork[];
  /** Jurisdiction and configured tax authority. Absent authority never means exempt. */
  jurisdiction?: string;
  taxAuthority?: TaxAuthorityConfig | null;
}

export function buildPartnerStatement(input: StatementInput) {
  const tier = input?.tier;
  if (tier !== "small_business" && tier !== "enterprise") throw new Error("TIER_INVALID");
  const organizationId = String(input?.organizationId || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(organizationId)) throw new Error("ORGANIZATION_INVALID");
  const periodStart = iso(input?.periodStart), periodEnd = iso(input?.periodEnd);
  if (Date.parse(periodEnd) <= Date.parse(periodStart)) throw new Error("PERIOD_INVALID");
  // Billing begins only after the trial AND under an accepted agreement. Outside the trial
  // an unaccepted agreement is not "zero due" -- it is not billable at all.
  const trial = withinTrial(periodStart, input?.trialStartsAt ?? null, input?.trialEndsAt ?? null);
  if (!trial && input?.agreementAccepted !== true) throw new Error("AGREEMENT_NOT_ACCEPTED");
  // The policy governing this statement is the one effective on its period start, so a
  // later Founder version never silently re-prices an earlier period.
  const policy = pricingPolicyOn(dayOf(periodStart));

  const bookings = input?.attributedBookings ?? [];
  const customWork = input?.acceptedCustomWork ?? [];
  const lines: StatementLine[] = [];
  let excludedUnverifiedBookings = 0;

  if (tier === "small_business") {
    // Small Business never carries a Golfriend booking commission, under any input.
    if (bookings.length) throw new Error("SMALL_BUSINESS_COMMISSION_FORBIDDEN");
    const subscription = policy.smallBusinessSubscription;
    if (!subscription) throw new Error("NO_SUBSCRIPTION_AUTHORITY");
    lines.push(line(policy, "small_business_subscription", `Small Business subscription (${subscription.period})`, null, subscription.currency, subscription.amountMinor, trial));
  } else {
    // Enterprise carries commission only, never a subscription line: charging both would
    // be the double charge the founding offer rules out.
    for (const booking of bookings) {
      if (!isMinor(booking?.grossMinor) || !booking?.bookingId) throw new Error("BOOKING_INVALID");
      if (booking.attributionVerified !== true) { excludedUnverifiedBookings += 1; continue; }
      lines.push(line(policy, "enterprise_attributed_commission", `Golfriend-attributed booking commission (${policy.bookingCommissionBps / 100}%)`, String(booking.bookingId), String(booking.currency || "USD"), commissionMinor(booking.grossMinor, policy.bookingCommissionBps), trial));
    }
  }

  for (const work of customWork) {
    if (work?.accepted !== true) throw new Error("CUSTOM_WORK_NOT_ACCEPTED");
    if (!isMinor(work?.amountMinor) || !work?.quoteId) throw new Error("CUSTOM_WORK_INVALID");
    lines.push(line(policy, "accepted_custom_work", "Separately accepted custom work", String(work.quoteId), String(work.currency || "USD"), work.amountMinor, trial));
  }

  const sum = (pick: (l: StatementLine) => number) => lines.reduce((total, l) => total + pick(l), 0);
  const totals = { normalMinor: sum(l => l.normalMinor), discountMinor: sum(l => l.discountMinor), dueMinor: sum(l => l.dueMinor) };
  if (trial && totals.dueMinor !== 0) throw new Error("TRIAL_MUST_BE_ZERO_DUE");

  // Tax is resolved, never assumed. A zero-due trial statement issues as final because it
  // collects nothing; anything with an amount due stays pro forma until approved authority
  // exists for the jurisdiction.
  const jurisdiction = String(input?.jurisdiction || "");
  const tax = resolveTaxAuthority(input?.taxAuthority ?? null, jurisdiction, dayOf(periodStart));
  const issue = statementIssueMode({ trial, dueMinor: totals.dueMinor, tax });
  const taxMinorAmount = issue.taxCollected ? taxMinor(totals.dueMinor, tax) : 0;

  return Object.freeze({
    schema: PARTNER_STATEMENT_SCHEMA,
    policyVersion: policy.version,
    organizationId, tier, periodStart, periodEnd,
    trial, trialStartsAt: input?.trialStartsAt ?? null, trialEndsAt: input?.trialEndsAt ?? null,
    lines: Object.freeze(lines),
    totals: Object.freeze({ ...totals, taxMinor: taxMinorAmount, payableMinor: totals.dueMinor + taxMinorAmount }),
    excludedUnverifiedBookings,
    issueMode: issue.mode, issueReason: issue.reason,
    tax: Object.freeze({ state: tax.state, jurisdiction: tax.jurisdiction, treatment: tax.treatment, rateBps: tax.rateBps, collected: issue.taxCollected }),
    // Restated on every statement so a reader never has to infer the boundary.
    externalMoneyBoundary: "course tee-time payments, Tournament entry fees, prizes, organizer funds, betting, stakes and escrow remain outside Golfriend",
    legalReviewComplete: false,
  });
}
