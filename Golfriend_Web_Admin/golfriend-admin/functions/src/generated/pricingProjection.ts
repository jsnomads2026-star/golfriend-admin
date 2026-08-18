// GENERATED FILE — DO NOT EDIT.
//
// Produced by scripts/generate-pricing-projection.mjs from src/economy/economyConfig.mjs, which is the single
// pricing authority. This is a projection of that authority, not a second copy of it: the
// digest below is computed over the canonical policy data, and verify-pricing-projection.mjs
// recomputes it. A hand edit here, or a change to the authority without regenerating, fails
// the gate. To change a rate, add a new effective-dated version to src/economy/economyConfig.mjs and rerun
// the generator.

export const PRICING_PROJECTION_SOURCE = "src/economy/economyConfig.mjs" as const;
export const PRICING_PROJECTION_DIGEST = "d9c34ea54bbaaa01417a146819f367434012506655f7ac2fbf730836bfbff36e" as const;

export interface EconomyPolicyVersion {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly approvedBy: string;
  readonly bookingCommissionBps: number;
  readonly maxCommissionBps: number;
  readonly minCommissionBps: number;
  readonly smallBusinessSubscription?: {readonly currency: string; readonly amountMinor: number; readonly period: string};
  readonly trialDays?: number;
  readonly trialDiscountBps?: number;
  readonly golfriendOwnedReceivables?: readonly string[];
  readonly notice: string;
  readonly prohibited: readonly string[];
}

export const ECONOMY_POLICY_VERSIONS: readonly EconomyPolicyVersion[] = Object.freeze(
  [
    {
      "approvedBy": "Founder",
      "bookingCommissionBps": 300,
      "effectiveFrom": "2026-08-15",
      "effectiveUntil": null,
      "maxCommissionBps": 300,
      "minCommissionBps": 0,
      "notice": "Initial Founder pricing authority. Commission is charged only under a signed, effective-dated agreement with verified activation.",
      "prohibited": [
        "OEM revenue",
        "advertising revenue",
        "commission on an unsigned course",
        "commission backdated to a prior policy version"
      ],
      "version": "2026-08-15.v1"
    },
    {
      "approvedBy": "Founder",
      "bookingCommissionBps": 300,
      "effectiveFrom": "2026-08-18",
      "effectiveUntil": null,
      "golfriendOwnedReceivables": [
        "small_business_subscription",
        "enterprise_attributed_commission",
        "accepted_custom_work"
      ],
      "maxCommissionBps": 300,
      "minCommissionBps": 0,
      "notice": "Founding Small Business and Enterprise offers. Billing begins only after the 90-day trial, under an accepted agreement and verified activation. Contract wording has not completed legal review.",
      "prohibited": [
        "OEM revenue",
        "advertising revenue",
        "commission on an unsigned course",
        "commission backdated to a prior policy version",
        "course tee-time payment",
        "tournament entry fee",
        "tournament prize",
        "organizer funds",
        "betting",
        "stakes",
        "escrow",
        "Enterprise monthly subscription charged alongside attributed commission",
        "commission on a booking without verified Golfriend attribution",
        "Small Business booking commission",
        "custom work billed without a separately accepted quote"
      ],
      "smallBusinessSubscription": {
        "amountMinor": 2900,
        "currency": "USD",
        "period": "monthly"
      },
      "trialDays": 90,
      "trialDiscountBps": 10000,
      "version": "2026-08-18.v1"
    }
  ] as const
) as readonly EconomyPolicyVersion[];

const isoDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};

/** The policy effective on a day, or null. Mirrors economyPolicyFor in the authority. */
export function economyPolicyFor(at: unknown): EconomyPolicyVersion | null {
  const day = isoDay(at);
  if (!day) return null;
  const applicable = ECONOMY_POLICY_VERSIONS.filter(p => p.effectiveFrom <= day && (!p.effectiveUntil || day <= p.effectiveUntil));
  return applicable.length ? applicable[applicable.length - 1]! : null;
}

export function economyPolicyByVersion(version: string): EconomyPolicyVersion | null {
  return ECONOMY_POLICY_VERSIONS.find(p => p.version === version) ?? null;
}
