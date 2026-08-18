// Versioned tax authority interface.
//
// Golfriend does not calculate or collect tax unless jurisdiction, registration and treatment
// are all configured AND approved. The single rule this module exists to enforce is that
// "no tax configuration" is NEVER silently treated as "tax exempt": an absent configuration
// is `authority_missing`, which is a different, louder state than a configured zero rate.
//
// Rates and treatments are supplied by configuration, not decided here. Refund and
// jurisdiction-specific wording is deliberately absent pending legal approval.

export const TAX_AUTHORITY_SCHEMA = "golfriend.partner-tax-authority.v1";

/** A configured zero-rate is legitimate; the ABSENCE of configuration is not. */
export type TaxTreatment = "standard_rated" | "zero_rated" | "exempt" | "reverse_charge" | "out_of_scope";
export const TAX_TREATMENTS: readonly TaxTreatment[] = ["standard_rated", "zero_rated", "exempt", "reverse_charge", "out_of_scope"];

export type TaxAuthorityState = "configured" | "authority_missing" | "authority_unapproved" | "authority_not_effective";

export interface TaxAuthorityConfig {
  schema: string;
  version: string;
  /** ISO 3166 country, optionally with a subdivision, e.g. "TH" or "US-CA". */
  jurisdiction: string;
  /** The registration Golfriend collects under. Absent registration is not "no tax". */
  registrationId: string;
  treatment: TaxTreatment;
  /** Integer basis points. A configured 0 is meaningful; undefined is not. */
  rateBps: number;
  approvedBy: string;
  effectiveFrom: string;
}

export interface TaxResolution {
  state: TaxAuthorityState;
  version: string | null;
  jurisdiction: string | null;
  treatment: TaxTreatment | null;
  rateBps: number | null;
  /** True only when a statement may be issued as a FINAL, collectible invoice. */
  mayCollect: boolean;
  reason: string;
}

const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Resolve the tax position for a jurisdiction on a day. Fail-closed at every branch:
 * a malformed, unapproved, not-yet-effective or absent configuration all resolve to a
 * non-collecting state, never to an assumed exemption.
 */
export function resolveTaxAuthority(config: TaxAuthorityConfig | null | undefined, jurisdiction: string, day: string): TaxResolution {
  const base = {version: null, jurisdiction: jurisdiction || null, treatment: null, rateBps: null, mayCollect: false};
  if (!config) return {...base, state: "authority_missing", reason: "no_tax_authority_configured_for_jurisdiction"};
  if (config.schema !== TAX_AUTHORITY_SCHEMA) return {...base, state: "authority_missing", reason: "unsupported_tax_authority_schema"};
  if (!config.jurisdiction || config.jurisdiction !== jurisdiction) return {...base, state: "authority_missing", reason: "tax_authority_jurisdiction_mismatch"};
  if (!config.registrationId) return {...base, state: "authority_missing", reason: "no_tax_registration"};
  if (!TAX_TREATMENTS.includes(config.treatment)) return {...base, state: "authority_missing", reason: "unknown_tax_treatment"};
  if (!Number.isSafeInteger(config.rateBps) || config.rateBps < 0 || config.rateBps > 10000) return {...base, state: "authority_missing", reason: "invalid_tax_rate"};
  if (!config.approvedBy) return {...base, state: "authority_unapproved", version: config.version ?? null, reason: "tax_authority_not_approved"};
  if (!isDay(config.effectiveFrom) || !isDay(day) || config.effectiveFrom > day) {
    return {...base, state: "authority_not_effective", version: config.version ?? null, reason: "tax_authority_not_yet_effective"};
  }
  return {
    state: "configured", version: config.version, jurisdiction: config.jurisdiction,
    treatment: config.treatment, rateBps: config.rateBps, mayCollect: true,
    reason: "tax_authority_configured_and_approved",
  };
}

export type StatementIssueMode = "final" | "pro_forma" | "blocked";

/**
 * Decide how a statement may be issued.
 *
 * A zero-due trial statement collects nothing, so it may be issued as final without any tax
 * authority. A post-trial statement with an amount due may NOT: without approved authority it
 * is downgraded to pro forma (informational, not collectible), never quietly issued as if
 * tax-exempt.
 */
export function statementIssueMode(input: {trial: boolean; dueMinor: number; tax: TaxResolution}): {mode: StatementIssueMode; reason: string; taxCollected: boolean} {
  const {trial, dueMinor, tax} = input;
  if (!Number.isSafeInteger(dueMinor) || dueMinor < 0) return {mode: "blocked", reason: "invalid_due_amount", taxCollected: false};
  if (dueMinor === 0) {
    return {mode: "final", reason: trial ? "zero_due_trial_statement_needs_no_tax_authority" : "zero_due_statement_needs_no_tax_authority", taxCollected: false};
  }
  if (tax.state !== "configured" || !tax.mayCollect) {
    return {mode: "pro_forma", reason: `pro_forma_pending_tax_authority:${tax.reason}`, taxCollected: false};
  }
  return {mode: "final", reason: "tax_authority_configured", taxCollected: tax.rateBps! > 0};
}

/** Tax on a net amount under a resolved authority. Never called without `configured`. */
export function taxMinor(netMinor: number, tax: TaxResolution) {
  if (tax.state !== "configured" || tax.rateBps === null) throw new Error("TAX_AUTHORITY_REQUIRED");
  if (!Number.isSafeInteger(netMinor) || netMinor < 0) throw new Error("NET_AMOUNT_INVALID");
  return Math.round((netMinor * tax.rateBps) / 10000);
}
