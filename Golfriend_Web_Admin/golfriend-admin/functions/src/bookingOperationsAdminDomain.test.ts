import assert from 'node:assert/strict';
import { BOOKING_OPERATIONS_ADMIN_SCHEMA, correctionRequestId, linkedRoundSnapshot, normalizeCorrectionRequest } from './bookingOperationsAdminDomain.js';

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
console.log('booking operations admin domain: 6 checks passed.');
