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
async function member(id: string) {
  const b = await db.collection("partner_identity_bindings").doc(id).get(),
    org = String(b.data()?.organizationId || ""),
    m = await db.collection("partner_memberships").doc(`${org}_${id}`).get();
  if (!b.exists || !m.exists || m.data()?.status !== "active")
    throw new HttpsError("permission-denied", "Active membership required.");
  return m.data() as any;
}
async function staff(id: string) {
  const s = await db.collection("admin_users").doc(id).get();
  if (!s.exists || !isActiveStaff(s.data()))
    throw new HttpsError("permission-denied", "Admin required.");
  return String(s.data()?.role);
}
const safeBooking = (x: any) => ({
  bookingId: x.bookingId,
  courseId: x.courseId,
  slotId: x.slotId,
  date: x.date,
  time: x.time,
  timeZone: x.timeZone,
  status: x.status,
  version: x.version,
  memberDisplayName: x.memberDisplayName || "Golfriend member",
  alternative: x.alternative || null,
  lastMessageAt: x.lastMessageAt || null,
});
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
      m = await member(caller),
      cmd = command(r),
      action = String(r.data?.action || ""),
      id = String(r.data?.bookingId || ""),
      expected = validateVersion(r.data?.expectedVersion);
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError("invalid-argument", "Financial fields prohibited.");
    }
    const allowed = (permissions(m.role) as any)[action];
    if (!allowed)
      throw new HttpsError(
        "permission-denied",
        "Role cannot perform this action.",
      );
    const ref = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const booking = await tx.get(ref);
      if (
        !booking.exists ||
        booking.data()?.organizationId !== m.organizationId
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
        claim.data()?.organizationId !== m.organizationId ||
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
        actorRole: m.role,
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
      const m = await member(caller);
      if (
        m.organizationId !== booking.data()?.organizationId ||
        !permissions(m.role).message
      )
        throw new HttpsError("permission-denied", "Message denied.");
      role = m.role;
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
    const m = await member(uid(r)),
      snap = await db
        .collection("bookings")
        .where("organizationId", "==", m.organizationId)
        .limit(200)
        .get();
    return {
      schema: BOOKING_SCHEMA,
      role: m.role,
      permissions: permissions(m.role),
      bookings: snap.docs.map((d) => safeBooking(d.data())),
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
      bookings: snap.docs.map((d) => safeBooking(d.data())),
      notificationProviderConfigured: Boolean(notifier.value()),
      boundary: "PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP",
    };
  },
);
