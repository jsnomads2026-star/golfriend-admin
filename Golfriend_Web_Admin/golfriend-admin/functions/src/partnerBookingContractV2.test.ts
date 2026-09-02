import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKING_STATES, transition, validateAlternative } from './partnerBookingDomain.js';

assert(BOOKING_STATES.includes('declined'));
assert(BOOKING_STATES.includes('expired'));
assert(BOOKING_STATES.includes('player_withdrawn'));
assert.equal(transition('pending', 'decline'), 'declined');
assert.equal(transition('alternative_proposed', 'expire'), 'expired');
assert.equal(transition('confirmed', 'withdraw'), 'player_withdrawn');
assert.deepEqual(validateAlternative({ alternativeSlotId: 'slot_123' }), { slotId: 'slot_123', partnerMessage: null });

const runtime = readFileSync(join(process.cwd(), 'lib', 'partnerBookingRuntime.js'), 'utf8');
assert.match(runtime, /schema: "golfriend\.booking-transition\.v2"/);
assert.match(runtime, /transitionId: input\.receiptId/);
assert.match(runtime, /submissionSnapshotRef: bookingSnapshotRef\(input\.booking\)/);
assert.match(runtime, /projectionVersion: input\.projectionVersion/);
assert.match(runtime, /respondToPlayBookingAlternativeV2/);
assert.match(runtime, /withdrawPlayBookingV2/);
assert.match(runtime, /expirePlayBookingsV2/);
const alternativeResponse = runtime.slice(runtime.indexOf('respondToPlayBookingAlternativeV2'), runtime.indexOf('withdrawPlayBookingV2'));
assert.doesNotMatch(alternativeResponse, /tx\.create\(ref/);
assert.doesNotMatch(alternativeResponse, /status: "confirmed"/);
console.log('partner booking contract v2: authoritative receipts, projection version, and non-creating alternative responses verified.');
