import * as admin from "firebase-admin";
import { randomBytes } from "node:crypto";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isActiveStaff } from "./authority.js";
import {
  assertNonFinancial,
  bookingMessageId,
  bookingReceiptId,
  BOOKING_SCHEMA,
  permissions,
  transition,
  version,
} from "./partnerBookingDomain.js";
import { validateCommand } from "./partnerActivationDomain.js";
import {
  BookingScopeError,
  derivePartnerBookingScope,
  PartnerBookingScope,
} from "./partnerBookingScope.js";
import {
  buildCompletedBookingOperation,
  buildPendingBookingOperation,
  buildUnsuccessfulBookingOperation,
  assertPendingBookingOperationClaim,
  bookingMessageDigest,
  bookingMessageOperationId,
  bookingOperationId,
  bookingRequestDigest,
  bookingRequestOperationId,
  cancelledBookedCount,
  operationResponse,
  replayCompletedBookingOperation,
  expirePendingBookingOperation,
  validateBookingOperationRequest,
} from "./partnerBookingReplay.js";
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(),
  notifier = defineString("PARTNER_NOTIFICATION_PROVIDER", { default: "" }),
  now = () => admin.firestore.FieldValue.serverTimestamp();
function uid(r: any) {
  if (!r.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in required.");
  return r.auth.uid as string;
}
function command(r: any) {
  try {
    return validateCommand(r.data?.commandId);
  } catch {
    throw new HttpsError("invalid-argument", "Command invalid.");
  }
}
async function bookingScope(id: string): Promise<PartnerBookingScope> {
  const binding = await db.collection("partner_identity_bindings").doc(id).get(),
    organizationId = String(binding.data()?.organizationId || "");
  if (!binding.exists || !/^[A-Za-z0-9_-]{1,160}$/.test(organizationId))
    throw new HttpsError(
      "permission-denied",
      "Active membership required; booking scope unavailable.",
    );
  const organization = await db
      .collection("partner_organizations")
      .doc(organizationId)
      .get(),
    authorizedValue = organization.data()?.authorizedCourseIds;
  if (
    !Array.isArray(authorizedValue) ||
    authorizedValue.length > 200 ||
    authorizedValue.some(
      (courseId: unknown) =>
        typeof courseId !== "string" ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(courseId),
    )
  )
    throw new HttpsError(
      "permission-denied",
      "Active membership required; booking scope unavailable.",
    );
  const authorized = authorizedValue as string[],
    membership = await db
      .collection("partner_memberships")
      .doc(`${organizationId}_${id}`)
      .get(),
    [operators, courses] = await Promise.all([
      Promise.all(
        authorized.map((courseId: unknown) =>
          db.collection("course_operators").doc(String(courseId)).get(),
        ),
      ),
      Promise.all(
        authorized.map((courseId: unknown) =>
          db.collection("courses").doc(String(courseId)).get(),
        ),
      ),
    ]);
  try {
    return derivePartnerBookingScope({
      callerUid: id,
      binding: binding.exists ? binding.data() || null : null,
      membership: membership.exists ? membership.data() || null : null,
      organization: organization.exists ? organization.data() || null : null,
      operators: operators
        .filter((document) => document.exists)
        .map((document) => ({ ...document.data(), courseId: document.id })),
      courses: courses
        .filter((document) => document.exists)
        .map((document) => ({ ...document.data(), courseId: document.id })),
    });
  } catch (error) {
    const code = error instanceof BookingScopeError ? error.code : "SCOPE_INVALID";
    throw new HttpsError("permission-denied", `Booking scope unavailable: ${code}.`);
  }
}
async function staff(id: string) {
  const s = await db.collection("admin_users").doc(id).get();
  if (!s.exists || !isActiveStaff(s.data()))
    throw new HttpsError("permission-denied", "Admin required.");
  return String(s.data()?.role);
}
const bounded = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
    : "";
const timestamp = (value: any) => {
  const candidate = value?.toDate?.() || value;
  if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime()))
    return null;
  return candidate.toISOString();
};
const safeBooking = (x: any) => {
  const bookingId = bounded(x?.bookingId, 200),
    courseId = bounded(x?.courseId, 160),
    slotId = bounded(x?.slotId, 200),
    status = bounded(x?.status, 32),
    versionValue = Number(x?.version);
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(bookingId) ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(courseId) ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(slotId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bounded(x?.date, 10)) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(bounded(x?.time, 8)) ||
    !/^[A-Za-z0-9_+./:-]{1,80}$/.test(bounded(x?.timeZone, 80)) ||
    !["pending", "alternative_proposed", "confirmed", "cancelled", "completed"].includes(status) ||
    !Number.isInteger(versionValue) ||
    versionValue < 1
  )
    return null;
  const alternativeValue = bounded(x?.alternative?.slotId, 160),
    alternativeSlotId = /^[A-Za-z0-9_-]{1,160}$/.test(alternativeValue)
      ? alternativeValue
      : "";
  return {
    bookingId,
    courseId,
    slotId,
    date: bounded(x?.date, 10),
    time: bounded(x?.time, 8),
    timeZone: bounded(x?.timeZone, 80),
    status,
    version: versionValue,
    memberDisplayName: bounded(x?.memberDisplayName, 120) || "Golfriend member",
    alternative: alternativeSlotId ? { slotId: alternativeSlotId } : null,
    lastMessageAt: timestamp(x?.lastMessageAt),
  };
};
export const requestPlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const memberUid = uid(r),
      cmd = command(r),
      slotId = String(r.data?.slotId || "");
    if (Object.keys(r.data || {}).some((key) => !["commandId", "slotId"].includes(key)))
      throw new HttpsError("invalid-argument", "Booking request fields invalid.");
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Financial fields are prohibited.",
      );
    }
    const slotRef = db.collection("tee_time_slots").doc(slotId),
      id = `booking_${slotId}_${memberUid}`,
      ref = db.collection("bookings").doc(id),
      requestDigest = bookingRequestDigest({ memberUid, slotId, commandId: cmd }),
      operationRef = db.collection("play_booking_request_operations")
        .doc(bookingRequestOperationId(memberUid, cmd));
    return db.runTransaction(async (tx) => {
      const [slot, current, user, priorOperation] = await Promise.all([
        tx.get(slotRef),
        tx.get(ref),
        tx.get(db.collection("users").doc(memberUid)),
        tx.get(operationRef),
      ]);
      if (priorOperation.exists) {
        const prior = priorOperation.data();
        if (prior?.requestDigest !== requestDigest || prior?.memberUid !== memberUid ||
            prior?.slotId !== slotId || prior?.commandId !== cmd)
          throw new HttpsError("already-exists", "BOOKING_REQUEST_COMMAND_REUSE_CONFLICT");
        if (prior?.state !== "completed" || prior?.immutable !== true ||
            prior?.bookingId !== id || prior?.status !== "pending" ||
            prior?.version !== 1 || prior?.receiptId !== bookingReceiptId(id, cmd) ||
            !["queued", "PROVIDER_UNCONFIGURED"].includes(prior?.notificationStatus))
          throw new HttpsError("failed-precondition", "BOOKING_REQUEST_AMBIGUOUS");
        return {
          success: true, bookingId: prior.bookingId, status: prior.status,
          version: prior.version, receiptId: prior.receiptId,
          notificationStatus: prior.notificationStatus,
        };
      }
      if (
        !slot.exists ||
        slot.data()?.status !== "open" ||
        slot.data()?.publishToApp !== false
      )
        throw new HttpsError(
          "failed-precondition",
          "Approved provider availability required.",
        );
      if (current.exists) {
        throw new HttpsError("already-exists", "Booking exists.");
      }
      const booked = Number(slot.data()?.bookedCount || 0),
        capacity = Number(slot.data()?.capacity || 0);
      if (booked >= capacity)
        throw new HttpsError("resource-exhausted", "Availability full.");
      const receiptId = bookingReceiptId(id, cmd),
        notificationStatus = notifier.value() ? "queued" : "PROVIDER_UNCONFIGURED",
        result = { bookingId: id, status: "pending", version: 1, receiptId, notificationStatus };
      tx.update(slotRef, { bookedCount: booked + 1, updatedAt: now() });
      tx.create(ref, {
        schema: BOOKING_SCHEMA,
        bookingId: id,
        slotId,
        courseId: slot.data()?.courseId,
        organizationId: slot.data()?.organizationId,
        date: slot.data()?.date,
        time: slot.data()?.time,
        timeZone: slot.data()?.timeZone,
        memberUid,
        memberDisplayName: user.data()?.nickname || "Golfriend member",
        status: "pending",
        version: 1,
        commandId: cmd,
        providerNeutral: true,
        financialFields: false,
        createdAt: now(),
      });
      tx.create(db.collection("play_booking_audits").doc(receiptId), {
        ...result,
        schema: "golfriend.play-booking-request-receipt.v1",
        state: "completed",
        requestDigest,
        memberUid,
        slotId,
        commandId: cmd,
        kind: "requested",
        actorRole: "member",
        immutable: true,
        createdAt: now(),
      });
      tx.create(operationRef, {
        ...result,
        schema: "golfriend.play-booking-request-operation.v1",
        state: "completed", requestDigest, memberUid, slotId, commandId: cmd,
        immutable: true, createdAt: now(),
      });
      return {
        success: true,
        ...result,
      };
    });
  },
);
export const managePlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r),
      scope = await bookingScope(caller);
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError("invalid-argument", "Financial fields prohibited.");
    }
    let request: ReturnType<typeof validateBookingOperationRequest>;
    try {
      request = validateBookingOperationRequest(r.data || {}, {
        actorUid: caller,
        organizationId: scope.organizationId,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "COMMAND_INVALID";
      throw new HttpsError("invalid-argument", `Booking command invalid: ${reason}.`);
    }
    const { action, bookingId: id, commandId: cmd, expectedVersion: expected } = request;
    const allowed = scope.canMutate && (permissions(scope.role) as any)[action];
    if (!allowed)
      throw new HttpsError(
        "permission-denied",
        "Role cannot perform this action.",
      );
    const ref = db.collection("bookings").doc(id),
      receiptId = bookingReceiptId(id, cmd),
      receiptRef = db.collection("play_booking_audits").doc(receiptId),
      attemptToken = randomBytes(32).toString("hex");
    const claimResult = await db.runTransaction(async (tx) => {
      const [booking, receipt, binding, membership, organization] = await Promise.all([
        tx.get(ref), tx.get(receiptRef),
        tx.get(db.collection("partner_identity_bindings").doc(caller)),
        tx.get(db.collection("partner_memberships").doc(`${scope.organizationId}_${caller}`)),
        tx.get(db.collection("partner_organizations").doc(scope.organizationId)),
      ]);
      if (!binding.exists || binding.data()?.organizationId !== scope.organizationId ||
          binding.data()?.verifiedAuthUid !== caller || !membership.exists ||
          membership.data()?.organizationId !== scope.organizationId ||
          membership.data()?.uid !== caller || membership.data()?.status !== "active" ||
          membership.data()?.role !== scope.role || !organization.exists ||
          organization.data()?.status !== "active")
        throw new HttpsError("permission-denied", "Booking authority changed.");
      if (!booking.exists || booking.data()?.organizationId !== scope.organizationId ||
          !scope.courseIds.includes(String(booking.data()?.courseId)) ||
          !organization.data()?.authorizedCourseIds?.includes(String(booking.data()?.courseId)) ||
          (scope.role === "course_staff" &&
            !membership.data()?.courseIds?.includes(String(booking.data()?.courseId))))
        throw new HttpsError("permission-denied", "Booking outside organization.");
      const courseClaim = await tx.get(
        db.collection("course_operators").doc(String(booking.data()?.courseId)),
      );
      if (!courseClaim.exists || courseClaim.data()?.organizationId !== scope.organizationId ||
          courseClaim.data()?.status !== "active")
        throw new HttpsError("permission-denied", "Active claimed course required.");
      if (receipt.exists) {
        if (receipt.data()?.state === "pending") {
          try {
            const ambiguous = expirePendingBookingOperation(receipt.data(), request, Date.now());
            tx.set(receiptRef, { ...ambiguous, actorRole: scope.role, updatedAt: now() });
            tx.update(ref, { [`operationLocks.${action}`]: {
              operationId: ambiguous.operationId,
              state: "ambiguous",
              reason: ambiguous.reason,
            } });
            return { operationFailed: "OPERATION_AMBIGUOUS" };
          } catch (error) {
            const reason = error instanceof Error ? error.message : "OPERATION_PENDING";
            throw new HttpsError(
              reason === "COMMAND_REUSE_CONFLICT" ? "already-exists" : "failed-precondition",
              reason,
            );
          }
        }
        try {
          return { response: operationResponse(
            replayCompletedBookingOperation(receipt.data(), request),
          ) };
        } catch (error) {
          const reason = error instanceof Error ? error.message : "OPERATION_AMBIGUOUS";
          if (reason === "COMMAND_REUSE_CONFLICT")
            throw new HttpsError("already-exists", reason);
          if (reason.startsWith("OPERATION_FAILED:"))
            return { operationFailed: reason.slice("OPERATION_FAILED:".length) };
          throw new HttpsError("failed-precondition", reason);
        }
      }
      const operationId = bookingOperationId(request),
        actionLock = booking.data()?.operationLocks?.[action];
      if (actionLock?.state === "pending" || actionLock?.state === "ambiguous")
        throw new HttpsError(
          "failed-precondition",
          actionLock.state === "ambiguous" ? "OPERATION_AMBIGUOUS" : "OPERATION_PENDING",
        );
      tx.create(receiptRef, {
        ...buildPendingBookingOperation(request, attemptToken, Date.now()),
        actorRole: scope.role,
        createdAt: now(),
      });
      tx.update(ref, { [`operationLocks.${action}`]: {
        operationId,
        state: "pending",
        receiptId,
      } });
      return { claimed: true };
    });
    if ("response" in claimResult) return claimResult.response;
    if ("operationFailed" in claimResult) {
      const reason = String(claimResult.operationFailed);
      throw new HttpsError(
        reason === "VERSION_CONFLICT" ? "aborted" : "failed-precondition",
        reason,
      );
    }
    const outcome = await db.runTransaction(async (tx) => {
      const [booking, receipt, binding, membership, organization] = await Promise.all([
        tx.get(ref),
        tx.get(receiptRef),
        tx.get(db.collection("partner_identity_bindings").doc(caller)),
        tx.get(
          db
            .collection("partner_memberships")
            .doc(`${scope.organizationId}_${caller}`),
        ),
        tx.get(db.collection("partner_organizations").doc(scope.organizationId)),
      ]);
      if (
        !binding.exists ||
        binding.data()?.organizationId !== scope.organizationId ||
        binding.data()?.verifiedAuthUid !== caller ||
        !membership.exists ||
        membership.data()?.organizationId !== scope.organizationId ||
        membership.data()?.uid !== caller ||
        membership.data()?.status !== "active" ||
        membership.data()?.role !== scope.role ||
        !organization.exists ||
        organization.data()?.status !== "active"
      )
        throw new HttpsError("permission-denied", "Booking authority changed.");
      if (
        !booking.exists ||
        booking.data()?.organizationId !== scope.organizationId ||
        !scope.courseIds.includes(String(booking.data()?.courseId)) ||
        !organization
          .data()
          ?.authorizedCourseIds?.includes(String(booking.data()?.courseId)) ||
        (scope.role === "course_staff" &&
          !membership
            .data()
            ?.courseIds?.includes(String(booking.data()?.courseId)))
      )
        throw new HttpsError(
          "permission-denied",
          "Booking outside organization.",
        );
      const claim = await tx.get(
        db.collection("course_operators").doc(String(booking.data()?.courseId)),
      );
      if (
        !claim.exists ||
        claim.data()?.organizationId !== scope.organizationId ||
        claim.data()?.status !== "active"
      )
        throw new HttpsError(
          "permission-denied",
          "Active claimed course required.",
        );
      if (receipt.exists) {
        try {
          assertPendingBookingOperationClaim(receipt.data(), request, attemptToken);
        } catch (error) {
          throw new HttpsError("failed-precondition", "OPERATION_CLAIM_MISMATCH");
        }
      } else throw new HttpsError("failed-precondition", "OPERATION_CLAIM_MISSING");
      let status: string;
      try {
        status = transition(String(booking.data()?.status), action);
      } catch {
        tx.set(receiptRef, {
          ...buildUnsuccessfulBookingOperation(request, "failed", "TRANSITION_DENIED"),
          actorRole: scope.role,
          createdAt: now(),
        });
        tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
        return { operationFailed: "TRANSITION_DENIED" };
      }
      let next: number;
      try {
        next = version(Number(booking.data()?.version || 0), expected);
      } catch {
        tx.set(receiptRef, {
          ...buildUnsuccessfulBookingOperation(request, "failed", "VERSION_CONFLICT"),
          actorRole: scope.role,
          createdAt: now(),
        });
        tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
        return { operationFailed: "VERSION_CONFLICT" };
      }
      const previousStatus = String(booking.data()?.status),
        previousVersion = Number(booking.data()?.version || 0),
        notificationStatus = notifier.value()
          ? "queued"
          : "PROVIDER_UNCONFIGURED",
        slotRef = db
          .collection("tee_time_slots")
          .doc(String(booking.data()?.slotId));
      let slotMutationApplied = false;
      if (action === "alternative") {
        const alternativeSlot = await tx.get(
          db.collection("tee_time_slots").doc(String(request.alternative?.slotId)),
        );
        if (!alternativeSlot.exists ||
            alternativeSlot.data()?.organizationId !== scope.organizationId ||
            String(alternativeSlot.data()?.courseId) !== String(booking.data()?.courseId) ||
            alternativeSlot.data()?.status !== "open" ||
            alternativeSlot.data()?.publishToApp !== false ||
            Number(alternativeSlot.data()?.bookedCount || 0) >=
              Number(alternativeSlot.data()?.capacity || 0)) {
          tx.set(receiptRef, {
            ...buildUnsuccessfulBookingOperation(request, "failed", "ALTERNATIVE_SLOT_UNAVAILABLE"),
            actorRole: scope.role,
            createdAt: now(),
          });
          tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
          return { operationFailed: "ALTERNATIVE_SLOT_UNAVAILABLE" };
        }
      }
      if (action === "cancel") {
        const slot = await tx.get(slotRef);
        if (!slot.exists ||
            slot.data()?.organizationId !== scope.organizationId ||
            String(slot.data()?.courseId) !== String(booking.data()?.courseId) ||
            String(slot.id) !== String(booking.data()?.slotId))
        {
          tx.set(receiptRef, {
            ...buildUnsuccessfulBookingOperation(request, "ambiguous", "BOOKING_SLOT_BINDING_INVALID"),
            actorRole: scope.role,
            createdAt: now(),
          });
          tx.update(ref, { [`operationLocks.${action}`]: {
            operationId: bookingOperationId(request),
            state: "ambiguous",
            reason: "BOOKING_SLOT_BINDING_INVALID",
          } });
          return { operationFailed: "OPERATION_AMBIGUOUS" };
        }
        tx.update(slotRef, {
          bookedCount: cancelledBookedCount(slot.data()?.bookedCount || 0),
          updatedAt: now(),
        });
        slotMutationApplied = true;
      }
      tx.update(ref, {
        status,
        version: next,
        alternative: request.alternative,
        updatedAt: now(),
        [`operationLocks.${action}`]: admin.firestore.FieldValue.delete(),
      });
      const operation = buildCompletedBookingOperation({
        request,
        previousStatus,
        status,
        previousVersion,
        version: next,
        receiptId,
        notificationStatus,
        slotId: String(booking.data()?.slotId),
        slotMutationApplied,
      });
      tx.set(receiptRef, {
        ...operation,
        kind: action,
        actorRole: scope.role,
        createdAt: now(),
      });
      return operationResponse(operation);
    });
    if ("operationFailed" in outcome) {
      const reason = String(outcome.operationFailed);
      throw new HttpsError(
        reason === "VERSION_CONFLICT" ? "aborted" : "failed-precondition",
        reason,
      );
    }
    return outcome;
  },
);
export const sendPlayBookingMessageV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r),
      cmd = command(r),
      id = String(r.data?.bookingId || ""),
      text = String(r.data?.message || "")
        .trim()
        .slice(0, 2000),
      booking = await db.collection("bookings").doc(id).get();
    if (Object.keys(r.data || {}).some((key) => !["bookingId", "commandId", "message"].includes(key)))
      throw new HttpsError("invalid-argument", "Booking message fields invalid.");
    if (!booking.exists || !text)
      throw new HttpsError("invalid-argument", "Booking message invalid.");
    let role = "member", staffScope: PartnerBookingScope | null = null;
    if (booking.data()?.memberUid !== caller) {
      const scope = await bookingScope(caller);
      if (
        scope.organizationId !== booking.data()?.organizationId ||
        !scope.courseIds.includes(String(booking.data()?.courseId)) ||
        !scope.canMutate ||
        !permissions(scope.role).message
      )
        throw new HttpsError("permission-denied", "Message denied.");
      role = scope.role;
      staffScope = scope;
    }
    const messageId = bookingMessageId(id, cmd),
      digest = bookingMessageDigest({ actorUid: caller, bookingId: id, commandId: cmd, message: text }),
      operationRef = db.collection("play_booking_message_operations")
        .doc(bookingMessageOperationId(caller, cmd)),
      messageRef = db.collection("bookings").doc(id).collection("messages").doc(messageId),
      bookingRef = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const [currentBooking, priorOperation, priorMessage] = await Promise.all([
        tx.get(bookingRef), tx.get(operationRef), tx.get(messageRef),
      ]);
      if (!currentBooking.exists ||
          (staffScope
            ? currentBooking.data()?.organizationId !== staffScope.organizationId ||
              !staffScope.courseIds.includes(String(currentBooking.data()?.courseId))
            : currentBooking.data()?.memberUid !== caller))
        throw new HttpsError("permission-denied", "Message denied.");
      if (priorOperation.exists) {
        const prior = priorOperation.data();
        if (prior?.requestDigest !== digest || prior?.actorUid !== caller ||
            prior?.bookingId !== id || prior?.commandId !== cmd)
          throw new HttpsError("already-exists", "BOOKING_MESSAGE_COMMAND_REUSE_CONFLICT");
        if (prior?.state !== "completed" || prior?.immutable !== true ||
            prior?.schema !== "golfriend.play-booking-message-operation.v1" ||
            prior?.messageId !== messageId || !priorMessage.exists ||
            priorMessage.data()?.requestDigest !== digest ||
            priorMessage.data()?.actorUid !== caller ||
            priorMessage.data()?.message !== text ||
            !["queued", "PROVIDER_UNCONFIGURED"].includes(prior?.notificationStatus))
          throw new HttpsError("failed-precondition", "BOOKING_MESSAGE_AMBIGUOUS");
        return { success: true, messageId, notificationStatus: prior.notificationStatus };
      }
      if (priorMessage.exists)
        throw new HttpsError("already-exists", "BOOKING_MESSAGE_COMMAND_REUSE_CONFLICT");
      const notificationStatus = notifier.value() ? "queued" : "PROVIDER_UNCONFIGURED";
      tx.create(messageRef, {
        messageId, senderRole: role, actorUid: caller, requestDigest: digest,
        message: text, createdAt: now(),
      });
      tx.create(operationRef, {
        schema: "golfriend.play-booking-message-operation.v1",
        state: "completed", actorUid: caller, bookingId: id, commandId: cmd,
        requestDigest: digest, messageId, notificationStatus,
        immutable: true, createdAt: now(),
      });
      tx.update(bookingRef, { lastMessageAt: now() });
      return { success: true, messageId, notificationStatus };
    });
  },
);
export const getPlayBookingsPortalV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const scope = await bookingScope(uid(r)),
      snap = await db
        .collection("bookings")
        .where("organizationId", "==", scope.organizationId)
        .limit(200)
        .get(),
      bookings = snap.docs
        .map((document) => document.data())
        .filter((booking) => scope.courseIds.includes(String(booking.courseId)))
        .map((booking) => safeBooking(booking))
        .filter((booking) => booking !== null);
    return {
      schema: BOOKING_SCHEMA,
      role: scope.role,
      permissions: permissions(scope.role),
      courseIds: scope.courseIds,
      ...(scope.delegatedCourseIds
        ? { delegatedCourseIds: scope.delegatedCourseIds }
        : {}),
      bookings,
      notificationProviderConfigured: Boolean(notifier.value()),
      boundary: "PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP",
    };
  },
);
export const getPlayBookingsAdminV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await staff(uid(r));
    const snap = await db.collection("bookings").limit(500).get();
    return {
      schema: BOOKING_SCHEMA,
      bookings: snap.docs
        .map((document) => safeBooking(document.data()))
        .filter((booking) => booking !== null),
      notificationProviderConfigured: Boolean(notifier.value()),
      boundary: "PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP",
    };
  },
);
