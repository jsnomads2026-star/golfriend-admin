export interface CourseCommission {
  grossMinor: number;
  commissionBps: number;
  commissionMinor: number;
  courseNetMinor: number;
}

export function validateCommissionBps(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    throw new Error("INVALID_COMMISSION_BPS");
  }
  return value;
}

export function calculateCourseCommission(grossMinor: unknown, commissionBps: unknown): CourseCommission {
  if (typeof grossMinor !== "number" || !Number.isSafeInteger(grossMinor) || grossMinor <= 0) {
    throw new Error("INVALID_BOOKING_GROSS");
  }
  const bps = validateCommissionBps(commissionBps);
  const commissionMinor = Math.round((grossMinor * bps) / 10000);
  return { grossMinor, commissionBps: bps, commissionMinor, courseNetMinor: grossMinor - commissionMinor };
}

export function validateTeePurchase(grossMinor: unknown, tees: unknown, usdPerTee = 0.10) {
  if (typeof grossMinor !== "number" || !Number.isSafeInteger(grossMinor) || grossMinor <= 0) {
    throw new Error("INVALID_PURCHASE_GROSS");
  }
  if (typeof tees !== "number" || !Number.isSafeInteger(tees) || tees <= 0) {
    throw new Error("INVALID_PURCHASE_TEES");
  }
  const minimumMinor = Math.round(tees * usdPerTee * 100);
  if (grossMinor < minimumMinor) throw new Error("PURCHASE_UNDERFUNDED");
  return { grossMinor, tees, minimumMinor };
}
