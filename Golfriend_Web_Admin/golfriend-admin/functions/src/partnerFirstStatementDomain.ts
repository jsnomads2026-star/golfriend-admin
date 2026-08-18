// The immutable first trial statement issued at partner activation.
//
// Requirement: Portal and Admin must display the SAME stored receipt, and neither may
// recalculate presentation values. So the statement is computed exactly once, inside the
// activation transaction, sealed with a digest, and thereafter only ever read.

import {createHash} from "node:crypto";
import {buildPartnerStatement, type PartnerTier} from "./partnerBillingDomain.js";
import {activateTrial} from "./partnerLifecycleDomain.js";

export const FIRST_STATEMENT_SCHEMA = "golfriend.partner-first-statement.v1";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Deterministic per organization, so a retried activation cannot mint a second number. */
export const statementId = (organizationId: string) => `pst_${hash(`${organizationId}|first_trial_statement`).slice(0, 32)}`;

/**
 * Human-facing statement number. Derived, not sequential: a counter would need a global
 * lock and could gap or collide under concurrent activation.
 */
export const statementNumber = (organizationId: string) =>
  `GF-TRIAL-${hash(organizationId).slice(0, 10).toUpperCase()}`;

/**
 * Final tier, decided from server-held records only.
 *
 * The applicant's selected intent and any client-supplied `tier` are deliberately ignored:
 * intent routes a form, it does not grant authority. Enterprise requires the contract
 * approval that carries the founding commission; everything else is Small Business.
 */
export function resolveFinalTier(input: {applicationOrganizationType?: unknown; contractApproved?: unknown; contractCommissionBps?: unknown; adminTierDecision?: unknown}): PartnerTier {
  const decision = String(input?.adminTierDecision || "");
  // An Admin may override, but only with an explicit, recorded, valid value.
  if (decision === "enterprise" || decision === "small_business") return decision;
  const contracted = input?.contractApproved === true && Number(input?.contractCommissionBps) > 0;
  const declared = String(input?.applicationOrganizationType || "").toLowerCase();
  const enterpriseShaped = ["enterprise", "golf_course", "course", "master_host"].includes(declared);
  return contracted && enterpriseShaped ? "enterprise" : "small_business";
}

export interface FirstStatementInput {
  organizationId: string;
  applicationId: string;
  tier: PartnerTier;
  activatedAt: string;
  agreementVersion: string;
  agreementDigest: string;
  jurisdiction?: string;
}

/**
 * Build the sealed first statement. Enterprise at activation has no attributable bookings
 * yet, so its basis is truthfully zero rather than an invented figure; the trial discount
 * still renders explicitly so the reader sees the offer, not a blank.
 */
export function buildFirstTrialStatement(input: FirstStatementInput) {
  const organizationId = String(input?.organizationId || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(organizationId)) throw new Error("ORGANIZATION_INVALID");
  const tier = input?.tier;
  if (tier !== "small_business" && tier !== "enterprise") throw new Error("TIER_INVALID");
  const agreementVersion = String(input?.agreementVersion || "");
  const agreementDigest = String(input?.agreementDigest || "");
  if (!agreementVersion || !/^[a-f0-9]{64}$/.test(agreementDigest)) throw new Error("AGREEMENT_EVIDENCE_INVALID");

  const trial = activateTrial(input.activatedAt);
  const statement = buildPartnerStatement({
    tier, organizationId,
    periodStart: trial.startsAt, periodEnd: trial.endsAt,
    trialStartsAt: trial.startsAt, trialEndsAt: trial.endsAt,
    agreementAccepted: true,
    // No verified Golfriend-attributed bookings exist at activation. Enterprise therefore
    // has a genuinely empty basis; it is shown as zero, never estimated.
    attributedBookings: [],
    jurisdiction: input?.jurisdiction || "",
    taxAuthority: null,
  });
  if (statement.totals.dueMinor !== 0) throw new Error("FIRST_STATEMENT_MUST_BE_ZERO_DUE");

  const body = {
    schema: FIRST_STATEMENT_SCHEMA,
    statementId: statementId(organizationId),
    statementNumber: statementNumber(organizationId),
    organizationId,
    applicationId: String(input.applicationId || ""),
    tier,
    pricingPolicyVersion: statement.policyVersion,
    trialStartsAt: trial.startsAt,
    trialEndsAt: trial.endsAt,
    trialDays: trial.days,
    agreementVersion, agreementDigest,
    currency: statement.lines[0]?.currency ?? "USD",
    lines: statement.lines,
    totals: statement.totals,
    // Enterprise at activation: no attributable bookings yet. Stated, not implied.
    basis: tier === "enterprise"
      ? {kind: "attributed_bookings" as const, verifiedBookingCount: 0, grossMinor: 0, note: "no_verified_attributed_bookings_yet"}
      : {kind: "subscription" as const, period: "monthly", note: "flat_monthly_subscription"},
    issueMode: statement.issueMode,
    issueReason: statement.issueReason,
    tax: statement.tax,
    externalMoneyBoundary: statement.externalMoneyBoundary,
    legalReviewComplete: false,
    immutable: true as const,
  };
  return Object.freeze({...body, receiptDigest: hash(body)});
}

/** Re-derive the digest to prove a stored receipt was not altered after issuance. */
export function verifyStoredStatement(stored: any) {
  if (!stored || stored.schema !== FIRST_STATEMENT_SCHEMA) return {valid: false, reason: "unsupported_schema"};
  const {receiptDigest, ...body} = stored;
  return receiptDigest === hash(body)
    ? {valid: true, reason: "digest_matches_stored_body"}
    : {valid: false, reason: "receipt_digest_mismatch"};
}
