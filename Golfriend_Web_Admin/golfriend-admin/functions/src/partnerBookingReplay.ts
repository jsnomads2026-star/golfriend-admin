import { createHash } from "node:crypto";

export const BOOKING_OPERATION_SCHEMA = "golfriend.play-booking-operation.v1";
export const BOOKING_OPERATION_STATES = [
  "pending",
  "completed",
  "failed",
  "ambiguous",
] as const;

export type BookingOperationAction = "confirm" | "alternative" | "cancel";
export type BookingOperationRequest = Readonly<{
  actorUid: string;
  organizationId: string;
  bookingId: string;
  action: BookingOperationAction;
  commandId: string;
  expectedVersion: number;
  confirmationToken: string | null;
  alternative: Readonly<{ slotId: string; message: string }> | null;
}>;
export type CompletedBookingOperation = Readonly<{
  schema: typeof BOOKING_OPERATION_SCHEMA;
  state: "completed";
  operationId: string;
  requestDigest: string;
  actorUid: string;
  organizationId: string;
  bookingId: string;
  action: BookingOperationAction;
  commandId: string;
  expectedVersion: number;
  confirmationTokenDigest: string | null;
  previousStatus: string;
  status: string;
  previousVersion: number;
  version: number;
  receiptId: string;
  notificationStatus: string;
  slotId: string;
  slotMutationApplied: boolean;
  alternative: Readonly<{ slotId: string; messageDigest: string }> | null;
  immutable: true;
}>;
export type UnsuccessfulBookingOperation = Readonly<{
  schema: typeof BOOKING_OPERATION_SCHEMA;
  state: "pending" | "failed" | "ambiguous";
  operationId: string;
  requestDigest: string;
  actorUid: string;
  organizationId: string;
  bookingId: string;
  action: BookingOperationAction;
  commandId: string;
  expectedVersion: number;
  reason: string;
  immutable: boolean;
  attemptDigest?: string;
  claimedAtMs?: number;
  leaseExpiresAtMs?: number;
}>;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const ID = /^[A-Za-z0-9_-]{1,200}$/;
const CONFIRMATION = /^[A-Za-z0-9_-]{16,200}$/;
const NOTIFICATION = new Set(["queued", "PROVIDER_UNCONFIGURED"]);
const TRANSITIONS: Record<BookingOperationAction, Record<string, string>> = {
  confirm: { pending: "confirmed", alternative_proposed: "confirmed" },
  alternative: { pending: "alternative_proposed" },
  cancel: { pending: "cancelled", alternative_proposed: "cancelled", confirmed: "cancelled" },
};

export function bookingOperationId(input: Pick<BookingOperationRequest,
  "actorUid" | "bookingId" | "action" | "commandId">) {
  return `pbo_${hash(`${input.actorUid}|${input.bookingId}|${input.action}|${input.commandId}`).slice(0, 40)}`;
}

export function bookingOperationRequestDigest(input: BookingOperationRequest) {
  return hash(JSON.stringify({
    actorUid: input.actorUid,
    organizationId: input.organizationId,
    bookingId: input.bookingId,
    action: input.action,
    commandId: input.commandId,
    expectedVersion: input.expectedVersion,
    confirmationToken: input.confirmationToken,
    alternative: input.alternative,
  }));
}

export function validateBookingOperationRequest(
  raw: Record<string, unknown>,
  authority: { actorUid: string; organizationId: string },
): BookingOperationRequest {
  const action = String(raw.action || "") as BookingOperationAction;
  if (!["confirm", "alternative", "cancel"].includes(action))
    throw new Error("COMMAND_ACTION_INVALID");
  const allowed = new Set([
    "action", "bookingId", "commandId", "expectedVersion",
    ...(action === "alternative"
      ? ["alternativeSlotId", "message", "confirmationToken"]
      : action === "cancel" ? ["confirmationToken"] : []),
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key)))
    throw new Error("COMMAND_FIELDS_INVALID");
  const bookingId = String(raw.bookingId || ""),
    commandId = String(raw.commandId || ""),
    expectedVersion = Number(raw.expectedVersion);
  if (!ID.test(authority.actorUid) || !ID.test(authority.organizationId) ||
      !ID.test(bookingId) || !ID.test(commandId) ||
      !Number.isInteger(expectedVersion) || expectedVersion < 1)
    throw new Error("COMMAND_IDENTITY_INVALID");
  const confirmationToken = action === "confirm"
    ? null
    : String(raw.confirmationToken || "");
  if (confirmationToken !== null && !CONFIRMATION.test(confirmationToken))
    throw new Error("CONFIRMATION_REQUIRED");
  let alternative: BookingOperationRequest["alternative"] = null;
  if (action === "alternative") {
    const slotId = String(raw.alternativeSlotId || ""),
      message = String(raw.message || "");
    if (!ID.test(slotId) || !message.trim() || message !== message.trim() ||
        message.length > 500 || /[\u0000-\u001f\u007f]/.test(message))
      throw new Error("ALTERNATIVE_INVALID");
    alternative = Object.freeze({ slotId, message });
  }
  return Object.freeze({
    ...authority, bookingId, action, commandId, expectedVersion,
    confirmationToken, alternative,
  });
}

export function buildCompletedBookingOperation(input: {
  request: BookingOperationRequest;
  previousStatus: string;
  status: string;
  previousVersion: number;
  version: number;
  receiptId: string;
  notificationStatus: string;
  slotId: string;
  slotMutationApplied: boolean;
}): CompletedBookingOperation {
  const { request } = input;
  if (input.previousVersion !== request.expectedVersion ||
      input.version !== input.previousVersion + 1)
    throw new Error("OPERATION_RESULT_INVALID");
  return Object.freeze({
    schema: BOOKING_OPERATION_SCHEMA,
    state: "completed",
    operationId: bookingOperationId(request),
    requestDigest: bookingOperationRequestDigest(request),
    actorUid: request.actorUid,
    organizationId: request.organizationId,
    bookingId: request.bookingId,
    action: request.action,
    commandId: request.commandId,
    expectedVersion: request.expectedVersion,
    confirmationTokenDigest: request.confirmationToken
      ? hash(request.confirmationToken) : null,
    previousStatus: input.previousStatus,
    status: input.status,
    previousVersion: input.previousVersion,
    version: input.version,
    receiptId: input.receiptId,
    notificationStatus: input.notificationStatus,
    slotId: input.slotId,
    slotMutationApplied: input.slotMutationApplied,
    alternative: request.alternative ? Object.freeze({
      slotId: request.alternative.slotId,
      messageDigest: hash(request.alternative.message),
    }) : null,
    immutable: true,
  });
}

export function buildUnsuccessfulBookingOperation(
  request: BookingOperationRequest,
  state: UnsuccessfulBookingOperation["state"],
  reason: string,
): UnsuccessfulBookingOperation {
  if (!["pending", "failed", "ambiguous"].includes(state) ||
      !/^[A-Z][A-Z0-9_]{2,80}$/.test(reason))
    throw new Error("OPERATION_FAILURE_INVALID");
  return Object.freeze({
    schema: BOOKING_OPERATION_SCHEMA,
    state,
    operationId: bookingOperationId(request),
    requestDigest: bookingOperationRequestDigest(request),
    actorUid: request.actorUid,
    organizationId: request.organizationId,
    bookingId: request.bookingId,
    action: request.action,
    commandId: request.commandId,
    expectedVersion: request.expectedVersion,
    reason,
    immutable: true,
  });
}

export function buildPendingBookingOperation(
  request: BookingOperationRequest,
  attemptToken: string,
  claimedAtMs: number,
  leaseMs = 60_000,
): UnsuccessfulBookingOperation {
  if (!/^[a-f0-9]{64}$/.test(attemptToken) ||
      !Number.isSafeInteger(claimedAtMs) || claimedAtMs < 1 ||
      !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000)
    throw new Error("OPERATION_CLAIM_INVALID");
  return Object.freeze({
    ...buildUnsuccessfulBookingOperation(request, "pending", "EXECUTION_CLAIMED"),
    immutable: false,
    attemptDigest: hash(attemptToken),
    claimedAtMs,
    leaseExpiresAtMs: claimedAtMs + leaseMs,
  });
}

export function assertPendingBookingOperationClaim(
  stored: unknown,
  request: BookingOperationRequest,
  attemptToken: string,
) {
  const value = stored as Partial<UnsuccessfulBookingOperation> | null;
  if (!value || value.state !== "pending" ||
      value.schema !== BOOKING_OPERATION_SCHEMA ||
      value.operationId !== bookingOperationId(request) ||
      value.requestDigest !== bookingOperationRequestDigest(request) ||
      value.actorUid !== request.actorUid ||
      value.organizationId !== request.organizationId ||
      value.bookingId !== request.bookingId || value.action !== request.action ||
      value.commandId !== request.commandId ||
      value.expectedVersion !== request.expectedVersion ||
      value.attemptDigest !== hash(attemptToken))
    throw new Error("OPERATION_CLAIM_MISMATCH");
}

export function expirePendingBookingOperation(
  stored: unknown,
  request: BookingOperationRequest,
  nowMs: number,
) {
  const value = stored as Partial<UnsuccessfulBookingOperation> | null;
  if (!value || value.state !== "pending" ||
      !Number.isSafeInteger(nowMs) ||
      !Number.isSafeInteger(value.leaseExpiresAtMs) ||
      Number(value.leaseExpiresAtMs) > nowMs)
    throw new Error("OPERATION_PENDING");
  if (value.operationId !== bookingOperationId(request) ||
      value.requestDigest !== bookingOperationRequestDigest(request))
    throw new Error("COMMAND_REUSE_CONFLICT");
  return buildUnsuccessfulBookingOperation(request, "ambiguous", "PENDING_LEASE_EXPIRED");
}

export function replayCompletedBookingOperation(
  stored: unknown,
  request: BookingOperationRequest,
): CompletedBookingOperation {
  const value = stored as Partial<CompletedBookingOperation> | null;
  if (!value || value.schema !== BOOKING_OPERATION_SCHEMA)
    throw new Error("OPERATION_LEGACY_UNREPLAYABLE");
  if (value.operationId !== bookingOperationId(request) ||
      value.requestDigest !== bookingOperationRequestDigest(request) ||
      value.actorUid !== request.actorUid ||
      value.organizationId !== request.organizationId ||
      value.bookingId !== request.bookingId || value.action !== request.action ||
      value.commandId !== request.commandId ||
      value.expectedVersion !== request.expectedVersion)
    throw new Error("COMMAND_REUSE_CONFLICT");
  if (value.state !== "completed") {
    const unsuccessful = value as unknown as Partial<UnsuccessfulBookingOperation>;
    if (unsuccessful.state === "failed" && /^[A-Z][A-Z0-9_]{2,80}$/.test(String(unsuccessful.reason || "")))
      throw new Error(`OPERATION_FAILED:${unsuccessful.reason}`);
    throw new Error(unsuccessful.state === "pending" ? "OPERATION_PENDING" : "OPERATION_AMBIGUOUS");
  }
  if (!Number.isInteger(value.previousVersion) ||
      value.version !== Number(value.previousVersion) + 1 ||
      value.previousVersion !== request.expectedVersion ||
      TRANSITIONS[request.action]?.[String(value.previousStatus)] !== value.status ||
      value.receiptId !== `pbr_${hash(`${request.bookingId}|${request.commandId}`).slice(0, 32)}` ||
      !NOTIFICATION.has(String(value.notificationStatus)) ||
      !ID.test(String(value.slotId || "")) ||
      value.slotMutationApplied !== (request.action === "cancel") ||
      value.confirmationTokenDigest !== (request.confirmationToken ? hash(request.confirmationToken) : null) ||
      (request.alternative
        ? value.alternative?.slotId !== request.alternative.slotId ||
          value.alternative?.messageDigest !== hash(request.alternative.message)
        : value.alternative !== null) ||
      value.immutable !== true)
    throw new Error("OPERATION_AMBIGUOUS");
  return value as CompletedBookingOperation;
}

export function operationResponse(value: CompletedBookingOperation) {
  return Object.freeze({
    success: true,
    bookingId: value.bookingId,
    status: value.status,
    version: value.version,
    receiptId: value.receiptId,
    notificationStatus: value.notificationStatus,
  });
}

export function cancelledBookedCount(current: unknown) {
  const count = Number(current);
  if (!Number.isInteger(count) || count < 0)
    throw new Error("SLOT_COUNT_INVALID");
  return Math.max(0, count - 1);
}

export function validateSlotCapacity(bookedValue: unknown, capacityValue: unknown) {
  const bookedCount = Number(bookedValue), capacity = Number(capacityValue);
  if (!Number.isFinite(bookedCount) || !Number.isInteger(bookedCount) || bookedCount < 0 ||
      !Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity < 0 ||
      bookedCount > capacity)
    throw new Error("SLOT_CAPACITY_INVALID");
  return Object.freeze({ bookedCount, capacity, available: bookedCount < capacity });
}

export const bookingRequestDigest = (input: { memberUid: string; slotId: string; commandId: string }) =>
  hash(JSON.stringify(input));
export const bookingMessageDigest = (input: { actorUid: string; bookingId: string; commandId: string; message: string }) =>
  hash(JSON.stringify(input));
export const bookingRequestOperationId = (memberUid: string, commandId: string) =>
  `pbq_${hash(`${memberUid}|${commandId}`).slice(0, 40)}`;
export const bookingMessageOperationId = (actorUid: string, commandId: string) =>
  `pbx_${hash(`${actorUid}|${commandId}`).slice(0, 40)}`;
