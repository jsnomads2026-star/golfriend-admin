import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertNonFinancial } from "./partnerBookingDomain.js";
import { isActiveStaff } from "./authority.js";
import { adminBookingPermission, auditEvidence, communicationId, resolveStatus, validateMessageRequest, validateResolutionRequest } from "./adminBookingCommunicationsDomain.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const requireUid = (request: any) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return request.auth.uid as string;
};
const allowed = (input: any, keys: string[]) => Object.keys(input || {}).every((key) => keys.includes(key));
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const iso = (value: any) => {
  const date = value?.toDate?.() || value;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

async function staff(request: any, action: "read" | "message" | "resolve") {
  const uid = requireUid(request);
  const snap = await db.collection("admin_users").doc(uid).get();
  if (!snap.exists || !isActiveStaff(snap.data()) || !adminBookingPermission(snap.data()?.role, action))
    throw new HttpsError("permission-denied", action === "resolve" ? "Director authorization required." : "Active staff authorization required.");
  return { uid, role: String(snap.data()?.role) };
}

function bookingProjection(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const source = document.data() || {}, status = clean(source.status, 32);
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(document.id) || !["pending", "confirmed", "rejected", "cancelled"].includes(status)) return null;
  return {
    id: document.id, slotId: clean(source.slotId, 200), courseId: clean(source.courseId, 160),
    courseName: clean(source.courseName, 160) || clean(source.courseId, 160) || "Unknown course",
    date: clean(source.date, 10), time: clean(source.time, 8),
    playerUid: clean(source.playerUid || source.memberUid, 160),
    playerName: clean(source.playerName || source.memberDisplayName, 120) || "Golfriend member",
    status, version: Number.isInteger(source.version) ? source.version : null,
    createdAt: iso(source.createdAt), updatedAt: iso(source.updatedAt), lastMessageAt: iso(source.lastMessageAt),
  };
}

async function detail(bookingId: string) {
  const booking = await db.collection("bookings").doc(bookingId).get();
  if (!booking.exists) throw new HttpsError("not-found", "Booking not found.");
  const projection = bookingProjection(booking);
  if (!projection) throw new HttpsError("failed-precondition", "Booking record is unavailable.");
  const [audits, messages] = await Promise.all([
    db.collection("admin_booking_communication_audits").where("bookingId", "==", bookingId).limit(100).get(),
    booking.ref.collection("messages").orderBy("createdAt", "asc").limit(100).get(),
  ]);
  return {
    booking: projection,
    audits: audits.docs.map((document) => ({ id: document.id, action: clean(document.data().kind, 80), byRole: clean(document.data().actorRole, 80), at: iso(document.data().createdAt), immutable: document.data().immutable === true })),
    messages: messages.docs.map((document) => ({ id: document.id, senderRole: clean(document.data().senderRole, 80), text: clean(document.data().message, 2000), locale: clean(document.data().locale, 8), createdAt: iso(document.data().createdAt), deliveryStatus: "unavailable" })),
  };
}

export const getAdminBookingStreamV2 = onCall({ enforceAppCheck: true }, async (request) => {
  await staff(request, "read");
  if (!allowed(request.data, ["bookingId"])) throw new HttpsError("invalid-argument", "Booking stream fields invalid.");
  const bookingId = clean(request.data?.bookingId, 200);
  if (bookingId) {
    const value = await detail(bookingId);
    return { schema: "golfriend.admin.booking-communications-stream.v2", source: "server", availability: "confirmed", bookings: [value.booking], audits: value.audits, messages: value.messages, providerDelivery: "unavailable", financialSettlement: "unavailable" };
  }
  const snap = await db.collection("bookings").limit(500).get();
  return { schema: "golfriend.admin.booking-communications-stream.v2", source: "server", availability: "confirmed", bookings: snap.docs.map(bookingProjection).filter((booking): booking is NonNullable<typeof booking> => booking !== null), audits: [], messages: [], providerDelivery: "unavailable", financialSettlement: "unavailable" };
});

export const adminResolveBookingV2 = onCall({ enforceAppCheck: true }, async (request) => {
  const actor = await staff(request, "resolve");
  if (!allowed(request.data, ["bookingId", "resolution", "idempotencyKey"])) throw new HttpsError("invalid-argument", "Booking resolution fields invalid.");
  try { assertNonFinancial(request.data); } catch { throw new HttpsError("invalid-argument", "Financial fields prohibited."); }
  let input: ReturnType<typeof validateResolutionRequest>;
  try { input = validateResolutionRequest(request.data); } catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Resolution invalid."); }
  const operationId = communicationId("resolve", input.bookingId, input.idempotencyKey);
  return db.runTransaction(async (tx) => {
    const operationRef = db.collection("admin_booking_communication_operations").doc(operationId), bookingRef = db.collection("bookings").doc(input.bookingId);
    const [operation, booking] = await Promise.all([tx.get(operationRef), tx.get(bookingRef)]);
    if (operation.exists) {
      const prior = operation.data();
      if (prior?.bookingId !== input.bookingId || prior?.resolution !== input.resolution || prior?.actorUid !== actor.uid) throw new HttpsError("already-exists", "Idempotency key reuse conflict.");
      return { accepted: true, bookingId: input.bookingId, status: prior?.status, auditEventId: prior?.auditEventId, idempotent: true, providerDelivery: "unavailable" };
    }
    if (!booking.exists) throw new HttpsError("not-found", "Booking not found.");
    let transition: ReturnType<typeof resolveStatus>;
    try { transition = resolveStatus(booking.data()?.status, input.resolution); } catch { throw new HttpsError("failed-precondition", "Booking transition denied."); }
    if (transition.releaseSeat) {
      const slotRef = db.collection("tee_time_slots").doc(String(booking.data()?.slotId || ""));
      const slot = await tx.get(slotRef);
      if (slot.exists) tx.update(slotRef, { bookedCount: Math.max(0, Number(slot.data()?.bookedCount || 0) - 1), updatedAt: now() });
    }
    const auditEventId = communicationId(`audit_${input.resolution}`, input.bookingId, input.idempotencyKey), auditRef = db.collection("admin_booking_communication_audits").doc(auditEventId);
    tx.update(bookingRef, { status: transition.status, userStatusKey: `booking_${transition.status}`, resolvedByUid: actor.uid, resolvedByRole: actor.role, resolvedAt: now(), updatedAt: now() });
    tx.create(auditRef, { ...auditEvidence({ auditEventId, bookingId: input.bookingId, kind: `admin_${transition.status}`, actorUid: actor.uid, actorRole: actor.role }), resolution: input.resolution, createdAt: now() });
    tx.create(operationRef, { schema: "golfriend.admin.booking-communication-operation.v2", kind: "resolve", bookingId: input.bookingId, resolution: input.resolution, actorUid: actor.uid, actorRole: actor.role, status: transition.status, auditEventId, immutable: true, createdAt: now() });
    return { accepted: true, bookingId: input.bookingId, status: transition.status, auditEventId, idempotent: false, providerDelivery: "unavailable" };
  });
});

export const sendBookingMessageV2 = onCall({ enforceAppCheck: true }, async (request) => {
  const actor = await staff(request, "message");
  if (!allowed(request.data, ["bookingId", "locale", "message", "idempotencyKey"])) throw new HttpsError("invalid-argument", "Booking message fields invalid.");
  try { assertNonFinancial(request.data); } catch { throw new HttpsError("invalid-argument", "Financial fields prohibited."); }
  let input: ReturnType<typeof validateMessageRequest>;
  try { input = validateMessageRequest(request.data); } catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Message invalid."); }
  const operationId = communicationId("message", input.bookingId, input.idempotencyKey), messageId = communicationId("message_record", input.bookingId, input.idempotencyKey), auditEventId = communicationId("message_audit", input.bookingId, input.idempotencyKey);
  return db.runTransaction(async (tx) => {
    const bookingRef = db.collection("bookings").doc(input.bookingId), operationRef = db.collection("admin_booking_communication_operations").doc(operationId);
    const [booking, operation] = await Promise.all([tx.get(bookingRef), tx.get(operationRef)]);
    if (operation.exists) {
      const prior = operation.data();
      if (prior?.bookingId !== input.bookingId || prior?.actorUid !== actor.uid || prior?.messageId !== messageId) throw new HttpsError("already-exists", "Idempotency key reuse conflict.");
      return { accepted: true, bookingId: input.bookingId, messageId, auditEventId: prior?.auditEventId, idempotent: true, deliveryStatus: "unavailable" };
    }
    if (!booking.exists) throw new HttpsError("not-found", "Booking not found.");
    if (!["pending", "confirmed"].includes(String(booking.data()?.status))) throw new HttpsError("failed-precondition", "Messaging unavailable for this booking status.");
    tx.create(bookingRef.collection("messages").doc(messageId), { messageId, senderRole: "staff", actorUid: actor.uid, actorRole: actor.role, locale: input.locale, message: input.message, createdAt: now(), providerDelivery: "unavailable", financialFields: false });
    tx.update(bookingRef, { lastMessageAt: now(), updatedAt: now() });
    tx.create(db.collection("admin_booking_communication_audits").doc(auditEventId), { ...auditEvidence({ auditEventId, bookingId: input.bookingId, kind: "admin_message_created", actorUid: actor.uid, actorRole: actor.role }), messageId, locale: input.locale, createdAt: now() });
    tx.create(operationRef, { schema: "golfriend.admin.booking-communication-operation.v2", kind: "message", bookingId: input.bookingId, actorUid: actor.uid, actorRole: actor.role, messageId, auditEventId, immutable: true, createdAt: now() });
    return { accepted: true, bookingId: input.bookingId, messageId, auditEventId, idempotent: false, deliveryStatus: "unavailable" };
  });
});
