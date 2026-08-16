import assert from "node:assert/strict";
import {buildEnterpriseBookingSystemTransition, createEnterpriseBookingSystemTransitionHandler, localWindowEndEpoch, signEnterpriseBookingCancellationEvidence} from "./enterpriseBookingSystemTransition.js";

let count = 0;
const check = (name: string, assertion: () => void | Promise<void>) => Promise.resolve(assertion()).then(() => console.log(`ok ${++count} - ${name}`));
const outboxSecret = "o".repeat(32), evidenceSecret = "e".repeat(32), booking = {schema: "golfriend.enterprise-correlated-booking.v2", bookingId: "booking_12345678", correlationId: `ebc_${"a".repeat(32)}`, organizationId: "org_12345678", propertyId: "property_12345678", courseId: "course_12345678", courseVersion: 2, status: "course_reviewing", version: 1, operationLocks: {}}, correlation = {schema: "golfriend.enterprise-booking-correlation.v1", correlationId: booking.correlationId, bookingId: booking.bookingId, status: booking.status, version: 1, course: {courseId: booking.courseId, version: 2}, f7Request: {requestId: "request_12345678", version: 1}, request: {date: "2027-01-01", timeWindow: {start: "08:00", end: "10:00", timeZone: "Asia/Bangkok"}, partySize: 4, preferences: {locale: "th", allowedChannels: [], shareContact: false}}};
const endAt = localWindowEndEpoch("2027-01-01", "10:00", "Asia/Bangkok");

async function main() {
await check("server time expires once after the authoritative local window", () => {
  assert.throws(() => buildEnterpriseBookingSystemTransition({booking, correlation, nowMs: endAt - 1, outboxSecret}), /NOT_EXPIRED/);
  const plan = buildEnterpriseBookingSystemTransition({booking, correlation, nowMs: endAt, outboxSecret});
  assert.equal(plan.state, "expired"); assert.equal(plan.version, 2); assert.equal(plan.event.state, "expired"); assert.equal(plan.receipt.immutable, true);
});
await check("ambiguous bookings never expire or cancel", () => {
  const locked = {...booking, operationLocks: {confirm: {state: "ambiguous_locked"}}};
  assert.throws(() => buildEnterpriseBookingSystemTransition({booking: locked, correlation, nowMs: endAt, outboxSecret}), /SOURCE_INVALID/);
});
await check("cancelled requires exact provider-owned signed evidence", () => {
  const accepted = {...booking, status: "cancellation_accepted"}, acceptedCorrelation = {...correlation, status: "cancellation_accepted"}, unsigned = {schema: "golfriend.enterprise-booking-cancellation-evidence.v2", hmacKeyVersion: 1, evidenceId: "evidence_12345678", authority: "commissioned_provider", bookingId: booking.bookingId, correlationId: booking.correlationId, organizationId: booking.organizationId, courseId: booking.courseId, bookingVersion: 1, outcome: "cancelled", issuedAt: "2027-01-01T03:01:00.000Z", expiresAt: "2027-01-01T03:06:00.000Z"}, evidence = {...unsigned, integrityDigest: signEnterpriseBookingCancellationEvidence(unsigned, evidenceSecret)};
  const plan = buildEnterpriseBookingSystemTransition({booking: accepted, correlation: acceptedCorrelation, nowMs: Date.parse(unsigned.issuedAt), outboxSecret, cancellationEvidence: evidence, cancellationEvidenceSecret: evidenceSecret});
  assert.equal(plan.state, "cancelled"); assert.equal(plan.sourceRef, unsigned.evidenceId);
  assert.throws(() => buildEnterpriseBookingSystemTransition({booking: accepted, correlation: acceptedCorrelation, nowMs: Date.parse(unsigned.issuedAt), outboxSecret, cancellationEvidence: {...evidence, courseId: "course_foreign"}, cancellationEvidenceSecret: evidenceSecret}), /EVIDENCE_INVALID/);
  assert.throws(() => buildEnterpriseBookingSystemTransition({booking: accepted, correlation: acceptedCorrelation, nowMs: Date.parse(unsigned.expiresAt), outboxSecret, cancellationEvidence: evidence, cancellationEvidenceSecret: evidenceSecret}), /EVIDENCE_INVALID/);
});
await check("handler is non-client composition and exact commit controls replay", async () => {
  const committed = new Map<string, any>(), handler = createEnterpriseBookingSystemTransitionHandler({load: async () => ({booking, correlation}), commit: async plan => {const prior = committed.get(plan.commandId); if (prior) return prior; const result = Object.freeze({success: true, receiptId: plan.receipt.receiptId, eventId: plan.event.eventId}); committed.set(plan.commandId, result); return result;}, outboxSecret: () => outboxSecret, cancellationEvidenceSecret: () => evidenceSecret, clock: () => endAt});
  const first = await handler.expire(booking.bookingId), replay = await handler.expire(booking.bookingId); assert.deepEqual(replay, first); assert.equal(committed.size, 1);
});
await check("privacy boundary contains no client identity contact or finance", () => {
  const plan = buildEnterpriseBookingSystemTransition({booking, correlation, nowMs: endAt, outboxSecret});
  assert.doesNotMatch(JSON.stringify(plan), /memberUid|email|phone|price|currency|payment|refund|commission|invoice|check.?in|played|First Tee|Open Round/i);
});
console.log(`enterprise booking system transition: ${count} checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
