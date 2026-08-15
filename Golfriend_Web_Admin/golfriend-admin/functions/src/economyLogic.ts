export type EconomyPricingMode = "free" | "fixed" | "metered";

export interface AuthoritativeEconomyRate {
  id: string;
  section: string;
  label: string;
  mode: EconomyPricingMode;
  tees: number;
  directCostUsd: number;
  rewardTees: number;
  active: boolean;
}

export interface EconomyQuote {
  actionId: string;
  rateVersion: string;
  debitTees: number;
  rewardTees: number;
  netTees: number;
  revenueUsd: number;
  directCostUsd: number;
  marginUsd: number;
}

const RATE_ID = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value;
}

export function validateRate(rate: AuthoritativeEconomyRate): AuthoritativeEconomyRate {
  if (!rate || !RATE_ID.test(rate.id)) throw new Error("INVALID_RATE_ID");
  if (!rate.label?.trim() || !rate.section?.trim()) throw new Error("INVALID_RATE_LABEL");
  if (!["free", "fixed", "metered"].includes(rate.mode)) throw new Error("INVALID_PRICING_MODE");

  const tees = finiteNonNegative(rate.tees, "tees");
  const rewardTees = finiteNonNegative(rate.rewardTees, "rewardTees");
  const directCostUsd = finiteNonNegative(rate.directCostUsd, "directCostUsd");
  if (!Number.isInteger(tees) || !Number.isInteger(rewardTees)) throw new Error("TEES_MUST_BE_INTEGER");
  if (rate.mode === "free" && tees !== 0) throw new Error("FREE_RATE_MUST_COST_ZERO");
  if (rewardTees > tees && tees > 0) throw new Error("REWARD_EXCEEDS_CHARGE");

  return { ...rate, label: rate.label.trim(), section: rate.section.trim(), tees, rewardTees, directCostUsd };
}

export function validateRateCard(rates: AuthoritativeEconomyRate[]): AuthoritativeEconomyRate[] {
  if (!Array.isArray(rates) || rates.length === 0 || rates.length > 500) throw new Error("INVALID_RATE_CARD_SIZE");
  const validated = rates.map(validateRate);
  const ids = new Set(validated.map((rate) => rate.id));
  if (ids.size !== validated.length) throw new Error("DUPLICATE_RATE_ID");
  return validated;
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return value;
}

export function quoteRate(rate: AuthoritativeEconomyRate, rateVersion: string, usdPerTee: number): EconomyQuote {
  validateRate(rate);
  finiteNonNegative(usdPerTee, "usdPerTee");
  if (!rate.active) throw new Error("RATE_INACTIVE");

  const debitTees = rate.mode === "free" ? 0 : rate.tees;
  const rewardTees = rate.rewardTees;
  const revenueUsd = debitTees * usdPerTee;
  return {
    actionId: rate.id,
    rateVersion,
    debitTees,
    rewardTees,
    netTees: rewardTees - debitTees,
    revenueUsd,
    directCostUsd: rate.directCostUsd,
    marginUsd: revenueUsd - rate.directCostUsd,
  };
}
