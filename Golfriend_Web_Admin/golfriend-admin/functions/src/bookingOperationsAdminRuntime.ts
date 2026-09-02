import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isActiveStaff } from './authority.js';
import { bookingTransitionSnapshot, correctionRequestId, linkedRoundSnapshot, normalizeCorrectionRequest, BOOKING_OPERATIONS_ADMIN_SCHEMA } from './bookingOperationsAdminDomain.js';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const stamp = () => admin.firestore.FieldValue.serverTimestamp();

async function staff(request: any) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const profile = await db.collection('admin_users').doc(uid).get();
  if (!profile.exists || !isActiveStaff(profile.data())) throw new HttpsError('permission-denied', 'Active Admin staff required.');
  return { uid: String(uid), role: String(profile.data()?.role || 'staff') };
}

const stringOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const timestampOrNull = (value: unknown) => value ?? null;

export const getAdminBookingOperationsV2 = onCall({ enforceAppCheck: true }, async (request) => {
  await staff(request);
  const filters = request.data?.filters || {};
  const courseId = typeof filters.courseId === 'string' ? filters.courseId.trim() : '';
  const status = typeof filters.status === 'string' ? filters.status.trim() : '';
  const [bookings, audits, corrections] = await Promise.all([
    db.collection('bookings').limit(200).get(),
    db.collection('play_booking_audits').limit(1000).get(),
    db.collection('booking_correction_requests').limit(1000).get(),
  ]);
  const auditsByBooking = new Map<string, any[]>();
  audits.docs.forEach((doc) => {
    const value = doc.data();
    const bookingId = stringOrNull(value.bookingId);
    const event = bookingId ? bookingTransitionSnapshot(bookingId, { ...value, receiptId: stringOrNull(value.receiptId) || doc.id }) : null;
    if (bookingId && event) auditsByBooking.set(bookingId, [...(auditsByBooking.get(bookingId) || []), event]);
  });
  const correctionsByBooking = new Map<string, any[]>();
  corrections.docs.forEach((doc) => {
    const value = doc.data();
    const bookingId = stringOrNull(value.bookingId);
    if (bookingId) correctionsByBooking.set(bookingId, [...(correctionsByBooking.get(bookingId) || []), {
      correctionRequestId: doc.id, reason: stringOrNull(value.reason), actorUid: stringOrNull(value.actorUid), actorRole: stringOrNull(value.actorRole), createdAt: timestampOrNull(value.createdAt), immutable: value.immutable === true,
    }]);
  });
  const rows = bookings.docs.map((doc) => {
    const booking = doc.data() as Record<string, any>;
    const transitions = (auditsByBooking.get(doc.id) || []).sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    return {
      bookingId: doc.id,
      lifecycleState: stringOrNull(booking.status) || 'unknown',
      linkedRound: linkedRoundSnapshot(booking),
      submission: {
        commandId: stringOrNull(booking.commandId),
        submittedAt: timestampOrNull(booking.createdAt),
        submissionSnapshotRef: stringOrNull(booking.submissionSnapshotRef),
        memberDisplayName: stringOrNull(booking.memberDisplayName) || 'Golfriend member',
      },
      projectionVersion: Number.isInteger(booking.projectionVersion) ? Number(booking.projectionVersion) : null,
      schedule: { courseId: stringOrNull(booking.courseId), slotId: stringOrNull(booking.slotId), date: stringOrNull(booking.date), time: stringOrNull(booking.time), timeZone: stringOrNull(booking.timeZone) },
      partnerResponse: { state: stringOrNull(booking.status), alternativeOffer: booking.alternativeOffer || null, partnerMessage: stringOrNull(booking.alternativeOffer?.partnerMessage), respondedAt: timestampOrNull(booking.respondedAt), respondedByUid: stringOrNull(booking.respondedByUid), cancelledAt: timestampOrNull(booking.cancelledAt), cancelledByUid: stringOrNull(booking.cancelledByUid) },
      playerChangeEvents: transitions.filter((event) => event.partnerVisible === true),
      transitions,
      correctionHistory: correctionsByBooking.get(doc.id) || [],
    };
  }).filter((row) => (!courseId || row.schedule.courseId === courseId) && (!status || row.lifecycleState === status));
  return { schema: BOOKING_OPERATIONS_ADMIN_SCHEMA, rows, total: rows.length, filters: { courseId: courseId || null, status: status || null }, boundary: 'ADMIN_READS_AND_AUDITED_CORRECTION_REQUESTS_ONLY' };
});

export const requestBookingCorrectionV2 = onCall({ enforceAppCheck: true }, async (request) => {
  const actor = await staff(request);
  let input: { bookingId: string; reason: string; commandId: string };
  try { input = normalizeCorrectionRequest(request.data); } catch (error: any) { throw new HttpsError('invalid-argument', error.message); }
  const booking = await db.collection('bookings').doc(input.bookingId).get();
  if (!booking.exists) throw new HttpsError('not-found', 'Booking not found.');
  const receiptId = correctionRequestId(input.bookingId, input.commandId);
  const ref = db.collection('booking_correction_requests').doc(receiptId);
  await ref.create({
    schema: 'golfriend.booking-correction-request.v2', correctionRequestId: receiptId, bookingId: input.bookingId, reason: input.reason,
    actorUid: actor.uid, actorRole: actor.role, commandId: input.commandId, createdAt: stamp(), immutable: true, state: 'requested',
    effect: 'NO_BOOKING_LIFECYCLE_MUTATION',
  }).catch((error: any) => { if (error?.code !== 6 && error?.code !== 'already-exists') throw error; });
  return { success: true, correctionRequestId: receiptId, state: 'requested', effect: 'NO_BOOKING_LIFECYCLE_MUTATION' };
});
