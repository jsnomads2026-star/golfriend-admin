import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
const bookingRoundId = (booking: any) => typeof booking?.roundId === "string" && booking.roundId.trim() ? booking.roundId : null;
const bookingSnapshotRef = (booking: any) => typeof booking?.submissionSnapshotRef === "string" && booking.submissionSnapshotRef.trim() ? booking.submissionSnapshotRef : null;
const projectionVersion = (booking: any, nextVersion: number) => Number.isInteger(booking?.projectionVersion) && booking.projectionVersion >= 0 ? booking.projectionVersion + 1 : nextVersion;
const transitionRecord = (input: { receiptId: string; bookingId: string; booking: any; kind: string; status: string; actor: string; actorRole: string; projectionVersion: number; alternativeOffer?: any; partnerMessage?: string | null; partnerVisible?: boolean }) => ({
  schema: "golfriend.booking-transition.v2", transitionId: input.receiptId, receiptId: input.receiptId,
  bookingId: input.bookingId, roundId: bookingRoundId(input.booking), actor: input.actor, actorUid: input.actor,
  actorRole: input.actorRole, kind: input.kind, status: input.status, submissionSnapshotRef: bookingSnapshotRef(input.booking),
  projectionVersion: input.projectionVersion, alternativeOffer: input.alternativeOffer || null,
  partnerMessage: input.partnerMessage || null, partnerVisible: input.partnerVisible === true,
  timestamp: now(), createdAt: now(), immutable: true,
});
const localDateTime = (timeZone: string, at: Date) => {
  try {
    const fields = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at).filter((part) => ["year", "month", "day", "hour", "minute"].includes(part.type)).map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
  } catch { return null; }
};
const bookingIsPast = (booking: any, at: Date) => {
  const date = typeof booking?.date === "string" ? booking.date : "", time = typeof booking?.time === "string" ? booking.time : "", zone = typeof booking?.timeZone === "string" ? booking.timeZone : "";
  const current = localDateTime(zone, at);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && current !== null && `${date}T${time}` < current;
};
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
  alternativeOffer: x.alternativeOffer || null,
  projectionVersion: Number.isInteger(x.projectionVersion) ? x.projectionVersion : null,
  submissionSnapshotRef: typeof x.submissionSnapshotRef === "string" ? x.submissionSnapshotRef : null,
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
      const submissionSnapshotRef = `bookings/${id}/submission_snapshots/${receiptId}`;
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
        projectionVersion: 1,
        commandId: cmd,
        submissionSnapshotRef,
        providerNeutral: true,
        financialFields: false,
        createdAt: now(),
      });
      tx.create(ref.collection("submission_snapshots").doc(receiptId), {
        schema: "golfriend.booking-submission-snapshot.v2", submissionSnapshotRef, snapshotId: receiptId,
        bookingId: id, commandId: cmd, memberUid, slotId, courseId: slot.data()?.courseId,
        date: slot.data()?.date, time: slot.data()?.time, timeZone: slot.data()?.timeZone,
        projectionVersion: 1, immutable: true, createdAt: now(),
      });
      tx.create(db.collection("play_booking_audits").doc(receiptId), transitionRecord({
        receiptId, bookingId: id, booking: { roundId: null, submissionSnapshotRef }, kind: "requested", status: "pending",
        actor: memberUid, actorRole: "member", projectionVersion: 1,
      }));
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
        nextProjectionVersion = projectionVersion(booking.data(), next),
        receiptId = bookingReceiptId(id, cmd),
        slotRef = db
          .collection("tee_time_slots")
          .doc(String(booking.data()?.slotId));
      let alternativeOffer: any = null;
      if (action === "alternative" && alternative) {
        const alternativeSlot = await tx.get(db.collection("tee_time_slots").doc(alternative.slotId));
        const alternativeClaim = alternativeSlot.exists ? await tx.get(db.collection("course_operators").doc(String(alternativeSlot.data()?.courseId))) : null;
        if (!alternativeSlot.exists || alternativeSlot.data()?.organizationId !== m.organizationId || alternativeSlot.data()?.status !== "open" || Number(alternativeSlot.data()?.bookedCount || 0) >= Number(alternativeSlot.data()?.capacity || 0) || !alternativeClaim?.exists || alternativeClaim.data()?.organizationId !== m.organizationId || alternativeClaim.data()?.status !== "active") {
          throw new HttpsError("failed-precondition", "Alternative availability is not an active claimed open slot.");
        }
        alternativeOffer = {
          transitionId: receiptId, slotId: alternative.slotId, courseId: String(alternativeSlot.data()?.courseId || ""),
          proposedTime: { date: alternativeSlot.data()?.date || null, time: alternativeSlot.data()?.time || null, timeZone: alternativeSlot.data()?.timeZone || null },
          capacity: Number(alternativeSlot.data()?.capacity || 0), partnerMessage: alternative.partnerMessage,
        };
      }
      if (action === "cancel" || action === "decline") {
        const slot = await tx.get(slotRef);
        if (slot.exists)
          tx.update(slotRef, {
            bookedCount: Math.max(0, Number(slot.data()?.bookedCount || 0) - 1),
            updatedAt: now(),
          });
      }
      tx.update(ref, {
        status, version: next, projectionVersion: nextProjectionVersion,
        alternative: alternativeOffer ? { slotId: alternativeOffer.slotId, message: alternativeOffer.partnerMessage || "" } : null,
        alternativeOffer, updatedAt: now(),
      });
      const kind = action === "alternative" ? "alternative_offered" : action === "decline" ? "declined" : action === "cancel" ? "cancelled" : action;
      tx.create(db.collection("play_booking_audits").doc(receiptId), transitionRecord({
        receiptId, bookingId: id, booking: booking.data(), kind, status, actor: caller, actorRole: m.role,
        projectionVersion: nextProjectionVersion, alternativeOffer, partnerMessage: alternativeOffer?.partnerMessage || null,
      }));
      return {
        success: true,
        bookingId: id,
        status,
        version: next,
        projectionVersion: nextProjectionVersion,
        receiptId,
        notificationStatus: notifier.value()
          ? "queued"
          : "PROVIDER_UNCONFIGURED",
      };
    });
  },
);
export const respondToPlayBookingAlternativeV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r), cmd = command(r), id = String(r.data?.bookingId || ""), expected = validateVersion(r.data?.expectedVersion), answer = String(r.data?.answer || "");
    if (!["accept", "decline"].includes(answer)) throw new HttpsError("invalid-argument", "Alternative response invalid.");
    const ref = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const booking = await tx.get(ref), current = booking.data();
      if (!booking.exists || current?.memberUid !== caller || current?.status !== "alternative_proposed") throw new HttpsError("permission-denied", "Alternative response unavailable.");
      const offer = current?.alternativeOffer;
      if (!offer || typeof offer.slotId !== "string" || typeof offer.transitionId !== "string") throw new HttpsError("failed-precondition", "Authoritative alternative offer unavailable.");
      const next = version(Number(current.version || 0), expected), nextProjectionVersion = projectionVersion(current, next), receiptId = bookingReceiptId(id, cmd), originalSlot = db.collection("tee_time_slots").doc(String(current.slotId));
      const [original, alternativeSlot] = await Promise.all([tx.get(originalSlot), tx.get(db.collection("tee_time_slots").doc(offer.slotId))]);
      if (answer === "accept") {
        if (offer.slotId === current.slotId || !alternativeSlot.exists || alternativeSlot.data()?.organizationId !== current.organizationId || alternativeSlot.data()?.status !== "open" || Number(alternativeSlot.data()?.bookedCount || 0) >= Number(alternativeSlot.data()?.capacity || 0)) throw new HttpsError("failed-precondition", "Alternative availability is no longer available.");
        if (original.exists) tx.update(originalSlot, { bookedCount: Math.max(0, Number(original.data()?.bookedCount || 0) - 1), updatedAt: now() });
        tx.update(alternativeSlot.ref, { bookedCount: Number(alternativeSlot.data()?.bookedCount || 0) + 1, updatedAt: now() });
        tx.update(ref, { status: "pending", slotId: offer.slotId, courseId: offer.courseId || null, date: offer.proposedTime?.date || null, time: offer.proposedTime?.time || null, timeZone: offer.proposedTime?.timeZone || null, version: next, projectionVersion: nextProjectionVersion, alternative: null, alternativeOffer: null, acceptedAlternativeOffer: offer, updatedAt: now() });
      } else {
        if (original.exists) tx.update(originalSlot, { bookedCount: Math.max(0, Number(original.data()?.bookedCount || 0) - 1), updatedAt: now() });
        tx.update(ref, { status: "declined", version: next, projectionVersion: nextProjectionVersion, alternative: null, alternativeOffer: null, updatedAt: now() });
      }
      const kind = answer === "accept" ? "alternative_accepted" : "alternative_declined";
      const status = answer === "accept" ? "pending" : "declined";
      tx.create(db.collection("play_booking_audits").doc(receiptId), transitionRecord({ receiptId, bookingId: id, booking: current, kind, status, actor: caller, actorRole: "member", projectionVersion: nextProjectionVersion, alternativeOffer: offer, partnerVisible: true }));
      return { success: true, bookingId: id, status, version: next, projectionVersion: nextProjectionVersion, receiptId, restarted: false };
    });
  },
);
export const withdrawPlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r), cmd = command(r), id = String(r.data?.bookingId || ""), expected = validateVersion(r.data?.expectedVersion), ref = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const booking = await tx.get(ref), current = booking.data();
      if (!booking.exists || current?.memberUid !== caller) throw new HttpsError("permission-denied", "Booking withdrawal unavailable.");
      let status: string;
      try { status = transition(String(current?.status), "withdraw"); } catch { throw new HttpsError("failed-precondition", "Booking withdrawal invalid."); }
      const next = version(Number(current?.version || 0), expected), nextProjectionVersion = projectionVersion(current, next), receiptId = bookingReceiptId(id, cmd), slotRef = db.collection("tee_time_slots").doc(String(current?.slotId)), slot = await tx.get(slotRef);
      if (slot.exists) tx.update(slotRef, { bookedCount: Math.max(0, Number(slot.data()?.bookedCount || 0) - 1), updatedAt: now() });
      tx.update(ref, { status, version: next, projectionVersion: nextProjectionVersion, updatedAt: now() });
      tx.create(db.collection("play_booking_audits").doc(receiptId), transitionRecord({ receiptId, bookingId: id, booking: current, kind: "player_withdrawn", status, actor: caller, actorRole: "member", projectionVersion: nextProjectionVersion, partnerVisible: true }));
      return { success: true, bookingId: id, status, version: next, projectionVersion: nextProjectionVersion, receiptId, restarted: false };
    });
  },
);
export const expirePlayBookingsV2 = onSchedule({ schedule: "every 15 minutes", timeZone: "UTC" }, async () => {
  const candidates = await db.collection("bookings").where("status", "in", ["pending", "alternative_proposed"]).limit(500).get();
  await Promise.all(candidates.docs.filter((doc) => bookingIsPast(doc.data(), new Date())).map(async (doc) => {
    await db.runTransaction(async (tx) => {
      const booking = await tx.get(doc.ref), current = booking.data();
      if (!booking.exists || !["pending", "alternative_proposed"].includes(String(current?.status)) || !bookingIsPast(current, new Date())) return;
      const next = Number(current?.version || 0) + 1, nextProjectionVersion = projectionVersion(current, next), receiptId = bookingReceiptId(doc.id, `expire_${next}`), slotRef = db.collection("tee_time_slots").doc(String(current?.slotId)), slot = await tx.get(slotRef);
      if (slot.exists) tx.update(slotRef, { bookedCount: Math.max(0, Number(slot.data()?.bookedCount || 0) - 1), updatedAt: now() });
      tx.update(doc.ref, { status: "expired", version: next, projectionVersion: nextProjectionVersion, updatedAt: now() });
      tx.create(db.collection("play_booking_audits").doc(receiptId), transitionRecord({ receiptId, bookingId: doc.id, booking: current, kind: "expired", status: "expired", actor: "system", actorRole: "system", projectionVersion: nextProjectionVersion }));
    });
  }));
});
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
