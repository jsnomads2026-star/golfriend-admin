import { createHash } from "node:crypto";

export type AdminBookingResolution = "confirm" | "reject" | "cancel";

const id = (value: unknown, label: string) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(result)) throw new Error(`${label}_INVALID`);
  return result;
};

export function adminBookingPermission(role: unknown, action: "read" | "message" | "resolve") {
  if (typeof role !== "string" || !role.trim()) return false;
  return action === "resolve" ? role === "Director" : true;
}

export function validateResolutionRequest(input: any) {
  const bookingId = id(input?.bookingId, "BOOKING_ID");
  const idempotencyKey = id(input?.idempotencyKey, "IDEMPOTENCY_KEY");
  const resolution = String(input?.resolution || "") as AdminBookingResolution;
  if (!(["confirm", "reject", "cancel"] as string[]).includes(resolution))
    throw new Error("RESOLUTION_INVALID");
  return { bookingId, idempotencyKey, resolution };
}

export function validateMessageRequest(input: any) {
  const bookingId = id(input?.bookingId, "BOOKING_ID");
  const idempotencyKey = id(input?.idempotencyKey, "IDEMPOTENCY_KEY");
  const locale = String(input?.locale || "");
  const message = typeof input?.message === "string" ? input.message.trim().slice(0, 2000) : "";
  if (!(["en", "th", "ko", "ja", "zh", "es", "fr", "de"] as string[]).includes(locale))
    throw new Error("LOCALE_INVALID");
  if (!message) throw new Error("MESSAGE_INVALID");
  return { bookingId, idempotencyKey, locale, message };
}

export function resolveStatus(status: unknown, resolution: AdminBookingResolution) {
  if (resolution === "confirm" && status === "pending") return { status: "confirmed", releaseSeat: false };
  if (resolution === "reject" && status === "pending") return { status: "rejected", releaseSeat: true };
  if (resolution === "cancel" && (status === "pending" || status === "confirmed"))
    return { status: "cancelled", releaseSeat: true };
  throw new Error("TRANSITION_DENIED");
}

export function communicationId(kind: string, bookingId: string, idempotencyKey: string) {
  return `abc_${createHash("sha256").update(`${kind}|${bookingId}|${idempotencyKey}`).digest("hex").slice(0, 32)}`;
}

export function auditEvidence(input: { auditEventId: string; bookingId: string; kind: string; actorUid: string; actorRole: string }) {
  return { schema: "golfriend.admin.booking-communication-audit.v2", ...input, immutable: true, financialFields: false, providerDelivery: "unavailable" };
}
