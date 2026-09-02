import assert from 'node:assert/strict';
import { BOOKING_OPERATIONS_ADMIN_SCHEMA, bookingTransitionSnapshot, correctionRequestId, linkedRoundSnapshot, normalizeCorrectionRequest } from './bookingOperationsAdminDomain.js';

assert.equal(BOOKING_OPERATIONS_ADMIN_SCHEMA, 'golfriend.booking-operations-admin.v2');
assert.equal(correctionRequestId('booking_1', 'command_12345678'), correctionRequestId('booking_1', 'command_12345678'));
assert.throws(() => normalizeCorrectionRequest({ bookingId: 'booking_1', reason: 'short', commandId: 'command_12345678' }));
assert.deepEqual(normalizeCorrectionRequest({ bookingId: 'booking_1', reason: 'Investigate an immutable receipt mismatch.', commandId: 'command_12345678' }), {
  bookingId: 'booking_1', reason: 'Investigate an immutable receipt mismatch.', commandId: 'command_12345678',
});
assert.deepEqual(linkedRoundSnapshot({}), { roundId: null, lifecycleState: null, source: 'none' });
assert.deepEqual(linkedRoundSnapshot({ roundId: 'round_1', roundStatus: 'in_progress' }), {
  roundId: 'round_1', lifecycleState: 'in_progress', source: 'booking_snapshot',
});
assert.deepEqual(bookingTransitionSnapshot('booking_1', {
  transitionId: 'transition_1', bookingId: 'booking_1', roundId: 'round_1', actor: 'partner_1', actorRole: 'course_staff', timestamp: 'time_1', submissionSnapshotRef: 'bookings/booking_1/submission_snapshots/transition_0', projectionVersion: 4, kind: 'alternative', status: 'alternative_proposed', partnerMessage: 'Try this slot.', alternativeOffer: { transitionId: 'transition_1', courseId: 'course_1', capacity: 4 }, partnerVisible: true,
}), {
  transitionId: 'transition_1', bookingId: 'booking_1', roundId: 'round_1', actor: 'partner_1', actorRole: 'course_staff', timestamp: 'time_1', submissionSnapshotRef: 'bookings/booking_1/submission_snapshots/transition_0', projectionVersion: 4, kind: 'alternative', status: 'alternative_proposed', partnerMessage: 'Try this slot.', alternativeOffer: { transitionId: 'transition_1', courseId: 'course_1', capacity: 4 }, partnerVisible: true,
});
assert.equal(bookingTransitionSnapshot('booking_legacy', { receiptId: 'receipt_1', bookingId: 'booking_legacy', actorUid: 'member_1', createdAt: 'time_1' }).projectionVersion, null);
console.log('booking operations admin domain: contract-v2 transition projection checks passed.');
