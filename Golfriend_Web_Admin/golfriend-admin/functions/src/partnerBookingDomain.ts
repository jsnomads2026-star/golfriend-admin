import { createHash } from "node:crypto";
export const BOOKING_SCHEMA = "golfriend.play-booking.v2",
  BOOKING_STATES = [
    "pending",
    "alternative_proposed",
    "confirmed",
    "cancelled",
    "completed",
  ] as const,
  FINANCIAL_FIELDS = [
    "price",
    "amount",
    "fee",
    "payment",
    "wallet",
    "ledger",
    "settlement",
    "refund",
    "payout",
    "escrow",
  ] as const;
const h = (v: string) => createHash("sha256").update(v).digest("hex");
export const bookingReceiptId = (id: string, cmd: string) =>
  `pbr_${h(`${id}|${cmd}`).slice(0, 32)}`;
export const bookingMessageId = (id: string, cmd: string) =>
  `pbm_${h(`${id}|${cmd}`).slice(0, 32)}`;
export function permissions(role: string) {
  return {
    read: true,
    message: ["primary_owner", "manager", "course_staff", "support"].includes(
      role,
    ),
    confirm: ["primary_owner", "manager", "course_staff"].includes(role),
    alternative: ["primary_owner", "manager", "course_staff"].includes(role),
    cancel: ["primary_owner", "manager"].includes(role),
    complete: ["primary_owner", "manager", "course_staff"].includes(role),
  };
}
export function transition(from: string, action: string): string {
  const map: any = {
    confirm: ["pending", "alternative_proposed"],
    alternative: ["pending"],
    cancel: ["pending", "alternative_proposed", "confirmed"],
    complete: ["confirmed"],
  };
  if (!map[action]?.includes(from)) throw new Error("TRANSITION_DENIED");
  return ({
    confirm: "confirmed",
    alternative: "alternative_proposed",
    cancel: "cancelled",
    complete: "completed",
  } as Record<string, string>)[action];
}
export function version(current: number, expected: number) {
  if (current !== expected) throw new Error("VERSION_CONFLICT");
  return current + 1;
}
export function validateAlternative(x: any) {
  const slotId = String(x?.alternativeSlotId || ""),
    message = String(x?.message || "")
      .trim()
      .slice(0, 500);
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(slotId) || !message)
    throw new Error("ALTERNATIVE_INVALID");
  return { slotId, message };
}
export function assertNonFinancial(x: any) {
  const keys = Object.keys(x || {}).map((k) => k.toLowerCase());
  if (FINANCIAL_FIELDS.some((f) => keys.some((k) => k.includes(f))))
    throw new Error("FINANCIAL_FIELD_DENIED");
}
