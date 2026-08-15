import * as admin from "firebase-admin";
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
  validateAlternative,
  version,
} from "./partnerBookingDomain.js";
import { validateCommand, validateVersion } from "./partnerActivationDomain.js";
import {
  BookingScopeError,
  derivePartnerBookingScope,
  PartnerBookingScope,
} from "./partnerBookingScope.js";
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
      ref = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const [slot, current, user] = await Promise.all([
        tx.get(slotRef),
        tx.get(ref),
        tx.get(db.collection("users").doc(memberUid)),
      ]);
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
        if (current.data()?.commandId === cmd)
          return {
            success: true,
            bookingId: id,
            status: current.data()?.status,
            restarted: true,
          };
        throw new HttpsError("already-exists", "Booking exists.");
      }
      const booked = Number(slot.data()?.bookedCount || 0),
        capacity = Number(slot.data()?.capacity || 0);
      if (booked >= capacity)
        throw new HttpsError("resource-exhausted", "Availability full.");
      const receiptId = bookingReceiptId(id, cmd);
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
        receiptId,
        bookingId: id,
        kind: "requested",
        actorRole: "member",
        createdAt: now(),
      });
      return {
        success: true,
        bookingId: id,
        status: "pending",
        version: 1,
        receiptId,
        restarted: false,
        notificationStatus: notifier.value()
          ? "queued"
          : "PROVIDER_UNCONFIGURED",
      };
    });
  },
);
export const managePlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r),
      scope = await bookingScope(caller),
      cmd = command(r),
      action = String(r.data?.action || ""),
      id = String(r.data?.bookingId || ""),
      expected = validateVersion(r.data?.expectedVersion);
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError("invalid-argument", "Financial fields prohibited.");
    }
    const allowed = scope.canMutate && (permissions(scope.role) as any)[action];
    if (!allowed)
      throw new HttpsError(
        "permission-denied",
        "Role cannot perform this action.",
      );
    const ref = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const [booking, binding, membership, organization] = await Promise.all([
        tx.get(ref),
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
    let status: string;
    let alternative: ReturnType<typeof validateAlternative> | null = null;
      try {
        status = transition(String(booking.data()?.status), action);
        if (action === "alternative") alternative = validateAlternative(r.data);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "Booking transition invalid.",
        );
      }
      const next = version(Number(booking.data()?.version || 0), expected),
        receiptId = bookingReceiptId(id, cmd),
        slotRef = db
          .collection("tee_time_slots")
          .doc(String(booking.data()?.slotId));
      if (action === "cancel") {
        const slot = await tx.get(slotRef);
        if (slot.exists)
          tx.update(slotRef, {
            bookedCount: Math.max(0, Number(slot.data()?.bookedCount || 0) - 1),
            updatedAt: now(),
          });
      }
      tx.update(ref, { status, version: next, alternative, updatedAt: now() });
      tx.create(db.collection("play_booking_audits").doc(receiptId), {
        receiptId,
        bookingId: id,
        kind: action,
        actorRole: scope.role,
        createdAt: now(),
      });
      return {
        success: true,
        bookingId: id,
        status,
        version: next,
        receiptId,
        notificationStatus: notifier.value()
          ? "queued"
          : "PROVIDER_UNCONFIGURED",
      };
    });
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
    if (!booking.exists || !text)
      throw new HttpsError("invalid-argument", "Booking message invalid.");
    let role = "member";
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
    }
    const messageId = bookingMessageId(id, cmd);
    await db
      .collection("bookings")
      .doc(id)
      .collection("messages")
      .doc(messageId)
      .create({ messageId, senderRole: role, message: text, createdAt: now() })
      .catch((e: any) => {
        if (e?.code !== 6) throw e;
      });
    await db.collection("bookings").doc(id).update({ lastMessageAt: now() });
    return {
      success: true,
      messageId,
      notificationStatus: notifier.value() ? "queued" : "PROVIDER_UNCONFIGURED",
    };
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
