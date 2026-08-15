import assert from "node:assert/strict";
import {
  bookingOperationId, bookingOperationRequestDigest,
  assertPendingBookingOperationClaim, buildCompletedBookingOperation, buildPendingBookingOperation, buildUnsuccessfulBookingOperation, cancelledBookedCount, operationResponse,
  replayCompletedBookingOperation, validateBookingOperationRequest,
} from "./partnerBookingReplay.js";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); console.log(`ok ${++n} - ${name}`); };
const authority = { actorUid: "staff_123", organizationId: "org_123" };
const raw = { bookingId: "booking_123", action: "cancel", commandId: "command_123456789", expectedVersion: 3, confirmationToken: "ack_1234567890123456" };
const request = validateBookingOperationRequest(raw, authority);
const completed = buildCompletedBookingOperation({ request, previousStatus: "confirmed", status: "cancelled", previousVersion: 3, version: 4, receiptId: "pbr_receipt", notificationStatus: "PROVIDER_UNCONFIGURED", slotId: "slot_123", slotMutationApplied: true });
const attempt = "a".repeat(64), pending = buildPendingBookingOperation(request, attempt, 1_700_000_000_000);
t("operation identity binds actor booking action command", () => assert.notEqual(bookingOperationId(request), bookingOperationId({ ...request, actorUid: "staff_456" })));
t("request digest binds revision", () => assert.notEqual(bookingOperationRequestDigest(request), bookingOperationRequestDigest({ ...request, expectedVersion: 2 })));
t("exact completed operation replays", () => assert.equal(replayCompletedBookingOperation(completed, request), completed));
t("replay returns exact callable-compatible outcome", () => assert.deepEqual(operationResponse(completed), { success: true, bookingId: "booking_123", status: "cancelled", version: 4, receiptId: "pbr_receipt", notificationStatus: "PROVIDER_UNCONFIGURED" }));
t("same command changed revision conflicts", () => assert.throws(() => replayCompletedBookingOperation(completed, { ...request, expectedVersion: 2 }), /COMMAND_REUSE_CONFLICT/));
t("same command changed confirmation conflicts", () => assert.throws(() => replayCompletedBookingOperation(completed, { ...request, confirmationToken: "ack_9999999999999999" }), /COMMAND_REUSE_CONFLICT/));
t("pending operation never auto executes", () => assert.throws(() => replayCompletedBookingOperation(buildUnsuccessfulBookingOperation(request, "pending", "AWAITING_RECOVERY"), request), /OPERATION_PENDING/));
t("only opaque server claim can execute pending", () => assert.doesNotThrow(() => assertPendingBookingOperationClaim(pending, request, attempt)));
t("concurrent attempt cannot execute pending", () => assert.throws(() => assertPendingBookingOperationClaim(pending, request, "b".repeat(64)), /OPERATION_CLAIM_MISMATCH/));
t("pending claim has bounded recovery lease", () => assert.equal(pending.leaseExpiresAtMs, 1_700_000_060_000));
t("failed operation durably replays its failure", () => assert.throws(() => replayCompletedBookingOperation(buildUnsuccessfulBookingOperation(request, "failed", "VERSION_CONFLICT"), request), /OPERATION_FAILED:VERSION_CONFLICT/));
t("failed operation key cannot be reused with another action", () => assert.throws(() => replayCompletedBookingOperation(buildUnsuccessfulBookingOperation(request, "failed", "VERSION_CONFLICT"), { ...request, action: "confirm", confirmationToken: null }), /COMMAND_REUSE_CONFLICT/));
t("ambiguous operation requires recovery", () => assert.throws(() => replayCompletedBookingOperation(buildUnsuccessfulBookingOperation(request, "ambiguous", "OUTCOME_UNKNOWN"), request), /OPERATION_AMBIGUOUS/));
t("cancel count decrements exactly once when invoked", () => { assert.equal(cancelledBookedCount(2), 1); assert.equal(cancelledBookedCount(0), 0); });
t("legacy receipt fails closed", () => assert.throws(() => replayCompletedBookingOperation({ receiptId: "pbr_receipt" }, request), /OPERATION_LEGACY_UNREPLAYABLE/));
t("cancel requires explicit confirmation", () => assert.throws(() => validateBookingOperationRequest({ ...raw, confirmationToken: "" }, authority), /CONFIRMATION_REQUIRED/));
t("alternative requires exact message and confirmation", () => assert.equal(validateBookingOperationRequest({ bookingId: "booking_123", action: "alternative", commandId: "command_123456789", expectedVersion: 3, confirmationToken: "ack_1234567890123456", alternativeSlotId: "slot_456", message: "Try 09:30" }, authority).alternative?.slotId, "slot_456"));
t("unknown request fields rejected", () => assert.throws(() => validateBookingOperationRequest({ ...raw, actorRole: "owner" }, authority), /COMMAND_FIELDS_INVALID/));
t("completed action is unsupported", () => assert.throws(() => validateBookingOperationRequest({ ...raw, action: "complete" }, authority), /COMMAND_ACTION_INVALID/));
console.log(`partner booking replay: ${n} checks passed.`);
