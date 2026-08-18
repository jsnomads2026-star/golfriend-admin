// Partner statement generation for GOLFRIEND-OWNED receivables only.
//
// The partner onboarding contract defaults every partner to
// `invoiceState: "external_authority_required"`. That default is overturned here for
// exactly three receivables and no others: the Small Business subscription, verified
// Enterprise Golfriend-attributed commission, and separately accepted custom work.
// Course tee-time payments, Tournament entry fees, prizes, organizer funds, betting,
// stakes and escrow are third-party money and can never appear on a Golfriend statement.
//
// Rates are NOT decided here. This module mirrors the central effective-dated authority in
// src/economy/economyConfig.mjs, which functions/ cannot import (tsconfig rootDir is `src`).
// partnerBillingParity.test.ts asserts the two agree; neither may be changed alone.

export const PARTNER_STATEMENT_SCHEMA = "golfriend.partner-statement.v1";
export const PARTNER_BILLING_POLICY_VERSION = "2026-08-18.v1";
export const BASIS_POINT_SCALE = 10000;

/** The only receivables Golfriend may invoice. Anything absent is external money. */
export const GOLFRIEND_OWNED_RECEIVABLES = ["small_business_subscription", "enterprise_attributed_commission", "accepted_custom_work"] as const;
/** Named so a caller cannot smuggle third-party money in under a vague label. */
export const EXTERNAL_MONEY_KINDS = ["course_tee_time_payment", "tournament_entry_fee", "tournament_prize", "organizer_funds", "betting", "stakes", "escrow"] as const;

export const SMALL_BUSINESS_SUBSCRIPTION = Object.freeze({ currency: "USD", amountMinor: 2900, period: "monthly" as const });
export const BOOKING_COMMISSION_BPS = 300;
export const TRIAL_DAYS = 90;
export const TRIAL_DISCOUNT_BPS = BASIS_POINT_SCALE;

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

function line(kind: ReceivableKind, description: string, reference: string | null, currency: string, normalMinor: number, trial: boolean): StatementLine {
  if (!GOLFRIEND_OWNED_RECEIVABLES.includes(kind)) throw new Error("RECEIVABLE_NOT_GOLFRIEND_OWNED");
  const discountMinor = trial ? normalMinor : 0;
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

  const bookings = input?.attributedBookings ?? [];
  const customWork = input?.acceptedCustomWork ?? [];
  const lines: StatementLine[] = [];
  let excludedUnverifiedBookings = 0;

  if (tier === "small_business") {
    // Small Business never carries a Golfriend booking commission, under any input.
    if (bookings.length) throw new Error("SMALL_BUSINESS_COMMISSION_FORBIDDEN");
    lines.push(line("small_business_subscription", `Small Business subscription (${SMALL_BUSINESS_SUBSCRIPTION.period})`, null, SMALL_BUSINESS_SUBSCRIPTION.currency, SMALL_BUSINESS_SUBSCRIPTION.amountMinor, trial));
  } else {
    // Enterprise carries commission only, never a subscription line: charging both would
    // be the double charge the founding offer rules out.
    for (const booking of bookings) {
      if (!isMinor(booking?.grossMinor) || !booking?.bookingId) throw new Error("BOOKING_INVALID");
      if (booking.attributionVerified !== true) { excludedUnverifiedBookings += 1; continue; }
      lines.push(line("enterprise_attributed_commission", `Golfriend-attributed booking commission (${BOOKING_COMMISSION_BPS / 100}%)`, String(booking.bookingId), String(booking.currency || "USD"), commissionMinor(booking.grossMinor, BOOKING_COMMISSION_BPS), trial));
    }
  }

  for (const work of customWork) {
    if (work?.accepted !== true) throw new Error("CUSTOM_WORK_NOT_ACCEPTED");
    if (!isMinor(work?.amountMinor) || !work?.quoteId) throw new Error("CUSTOM_WORK_INVALID");
    lines.push(line("accepted_custom_work", "Separately accepted custom work", String(work.quoteId), String(work.currency || "USD"), work.amountMinor, trial));
  }

  const sum = (pick: (l: StatementLine) => number) => lines.reduce((total, l) => total + pick(l), 0);
  const totals = { normalMinor: sum(l => l.normalMinor), discountMinor: sum(l => l.discountMinor), dueMinor: sum(l => l.dueMinor) };
  if (trial && totals.dueMinor !== 0) throw new Error("TRIAL_MUST_BE_ZERO_DUE");

  return Object.freeze({
    schema: PARTNER_STATEMENT_SCHEMA,
    policyVersion: PARTNER_BILLING_POLICY_VERSION,
    organizationId, tier, periodStart, periodEnd,
    trial, trialStartsAt: input?.trialStartsAt ?? null, trialEndsAt: input?.trialEndsAt ?? null,
    lines: Object.freeze(lines), totals: Object.freeze(totals),
    excludedUnverifiedBookings,
    // Restated on every statement so a reader never has to infer the boundary.
    externalMoneyBoundary: "course tee-time payments, Tournament entry fees, prizes, organizer funds, betting, stakes and escrow remain outside Golfriend",
    legalReviewComplete: false,
  });
}
