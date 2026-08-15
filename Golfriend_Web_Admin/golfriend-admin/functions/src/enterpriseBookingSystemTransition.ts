import {createHash, createHmac, timingSafeEqual} from "node:crypto";
import {buildEnterpriseCorrelationEvent} from "./enterpriseBookingCorrelation.js";

type Json = Record<string, any>;
const ID = /^[A-Za-z0-9_-]{8,200}$/;
const SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONE = /^([A-Za-z_]+\/[A-Za-z_+-]+|UTC)$/;
const exact = (value: Json, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value as Json).sort().map(key => `${JSON.stringify(key)}:${stable((value as Json)[key])}`).join(",")}}` : JSON.stringify(value);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ambiguous = (booking: Json) => Object.values(booking.operationLocks || {}).some((lock: any) => ["ambiguous", "ambiguous_locked"].includes(String(lock?.state)));

function localParts(epochMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date(epochMs));
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
}

export function localWindowEndEpoch(date: string, end: string, timeZone: string) {
  if (!DATE.test(date) || !TIME.test(end) || !ZONE.test(timeZone)) throw new Error("BOOKING_EXPIRY_SOURCE_INVALID");
  const [year, month, day] = date.split("-").map(Number), [hour, minute] = end.split(":").map(Number);
  let epoch = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 4; i += 1) {
    const p = localParts(epoch, timeZone);
    epoch += Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  const p = localParts(epoch, timeZone);
  if (p.year !== year || p.month !== month || p.day !== day || p.hour !== hour || p.minute !== minute) throw new Error("BOOKING_EXPIRY_SOURCE_INVALID");
  return epoch;
}

export const ENTERPRISE_BOOKING_CANCELLATION_EVIDENCE_SCHEMA = "golfriend.enterprise-booking-cancellation-evidence.v2" as const;
export function signEnterpriseBookingCancellationEvidence(unsigned: Json, secret: string) {
  if (secret.length < 32) throw new Error("BOOKING_CANCELLATION_EVIDENCE_UNAVAILABLE");
  return createHmac("sha256", secret).update(stable(unsigned)).digest("hex");
}
export function verifyEnterpriseBookingCancellationEvidence(raw: Json, secret: string) {
  const keys = ["schema", "evidenceId", "authority", "bookingId", "correlationId", "organizationId", "courseId", "bookingVersion", "outcome", "issuedAt", "integrityDigest"];
  if (!raw || !exact(raw, keys) || raw.schema !== ENTERPRISE_BOOKING_CANCELLATION_EVIDENCE_SCHEMA || raw.authority !== "commissioned_provider" || raw.outcome !== "cancelled" || ![raw.evidenceId, raw.bookingId, raw.correlationId, raw.organizationId, raw.courseId].every(value => ID.test(String(value))) || !Number.isSafeInteger(raw.bookingVersion) || raw.bookingVersion < 1 || !Number.isFinite(Date.parse(raw.issuedAt)) || !SHA.test(String(raw.integrityDigest)) || secret.length < 32) throw new Error("BOOKING_CANCELLATION_EVIDENCE_INVALID");
  const {integrityDigest, ...unsigned} = raw, expected = signEnterpriseBookingCancellationEvidence(unsigned, secret), a = Buffer.from(String(integrityDigest), "hex"), b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("BOOKING_CANCELLATION_EVIDENCE_INVALID");
  return Object.freeze({...unsigned, integrityDigest: String(integrityDigest)});
}

export function buildEnterpriseBookingSystemTransition(input: Readonly<{booking: Json; correlation: Json; nowMs: number; outboxSecret: string; cancellationEvidence?: Json; cancellationEvidenceSecret?: string}>) {
  const {booking, correlation} = input;
  if (booking.schema !== "golfriend.enterprise-correlated-booking.v2" || correlation.schema !== "golfriend.enterprise-booking-correlation.v1" || booking.bookingId !== correlation.bookingId || booking.correlationId !== correlation.correlationId || booking.version !== correlation.version || booking.status !== correlation.status || booking.courseId !== correlation.course?.courseId || ambiguous(booking) || !Number.isSafeInteger(input.nowMs) || input.outboxSecret.length < 32) throw new Error("BOOKING_SYSTEM_SOURCE_INVALID");
  let state: "expired" | "cancelled", sourceRef: string;
  if (input.cancellationEvidence) {
    const evidence = verifyEnterpriseBookingCancellationEvidence(input.cancellationEvidence, input.cancellationEvidenceSecret || "") as Json;
    if (booking.status !== "cancellation_accepted" || evidence.bookingId !== booking.bookingId || evidence.correlationId !== booking.correlationId || evidence.organizationId !== booking.organizationId || evidence.courseId !== booking.courseId || evidence.bookingVersion !== booking.version || Date.parse(String(evidence.issuedAt)) > input.nowMs + 30_000) throw new Error("BOOKING_CANCELLATION_EVIDENCE_INVALID");
    state = "cancelled";
    sourceRef = String(evidence.evidenceId);
  } else {
    if (!["course_reviewing", "alternative_proposed", "cancellation_declined"].includes(String(booking.status))) throw new Error("BOOKING_EXPIRY_STATE_INVALID");
    const request = correlation.request || {}, window = request.timeWindow || {}, endAt = localWindowEndEpoch(String(request.date), String(window.end), String(window.timeZone));
    if (input.nowMs < endAt) throw new Error("BOOKING_NOT_EXPIRED");
    state = "expired";
    sourceRef = `deadline_${hash(`${correlation.request.date}|${window.end}|${window.timeZone}`).slice(0, 32)}`;
  }
  const version = Number(booking.version) + 1, commandId = `ebsys_${hash(`${booking.bookingId}|${state}|${booking.version}|${sourceRef}`).slice(0, 40)}`, at = new Date(input.nowMs).toISOString(), event = buildEnterpriseCorrelationEvent({correlationId: String(correlation.correlationId), bookingId: String(booking.bookingId), bookingVersion: version, f7RequestId: String(correlation.f7Request?.requestId), f7Version: Number(correlation.f7Request?.version), courseId: String(booking.courseId), courseVersion: Number(booking.courseVersion), state, commandId, sourceEventVersion: version, occurredAt: at, issuedAt: at, expiresAt: new Date(input.nowMs + 300_000).toISOString(), alternativeSlot: null, integritySecret: input.outboxSecret, hmacKeyVersion: 1}), receiptId = `ebstr_${hash(`${event.eventId}|${sourceRef}`).slice(0, 40)}`;
  return Object.freeze({state, version, commandId, sourceRef, event, receipt: Object.freeze({schema: "golfriend.enterprise-booking-system-transition-receipt.v2", receiptId, bookingId: booking.bookingId, correlationId: booking.correlationId, priorVersion: booking.version, version, state, sourceRef, eventId: event.eventId, immutable: true, boundary: "SERVER_OR_PROVIDER_EVIDENCE_ONLY_NO_GOLFER_AGGREGATE_WRITE"})});
}

export function createEnterpriseBookingSystemTransitionHandler(deps: Readonly<{load: (bookingId: string) => Promise<{booking: Json; correlation: Json}>; commit: (plan: ReturnType<typeof buildEnterpriseBookingSystemTransition>) => Promise<Json>; outboxSecret: () => string; cancellationEvidenceSecret: () => string; clock?: () => number}>) {
  if (!deps || typeof deps.load !== "function" || typeof deps.commit !== "function" || typeof deps.outboxSecret !== "function" || typeof deps.cancellationEvidenceSecret !== "function") throw new Error("BOOKING_SYSTEM_AUTHORITY_UNAVAILABLE");
  return Object.freeze({
    expire: async (bookingId: string) => { if (!ID.test(bookingId)) throw new Error("BOOKING_SYSTEM_REQUEST_INVALID"); const source = await deps.load(bookingId), plan = buildEnterpriseBookingSystemTransition({...source, nowMs: (deps.clock || Date.now)(), outboxSecret: deps.outboxSecret()}); return deps.commit(plan); },
    cancelFromEvidence: async (bookingId: string, evidence: Json) => { if (!ID.test(bookingId)) throw new Error("BOOKING_SYSTEM_REQUEST_INVALID"); const source = await deps.load(bookingId), plan = buildEnterpriseBookingSystemTransition({...source, nowMs: (deps.clock || Date.now)(), outboxSecret: deps.outboxSecret(), cancellationEvidence: evidence, cancellationEvidenceSecret: deps.cancellationEvidenceSecret()}); return deps.commit(plan); },
  });
}
