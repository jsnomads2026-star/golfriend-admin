import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKING_STATES, transition, validateAlternative } from './partnerBookingDomain.js';
import { buildBookingReport } from './bookingReportingDomain.js';

assert(BOOKING_STATES.includes('declined'));
assert(BOOKING_STATES.includes('expired'));
assert(BOOKING_STATES.includes('player_withdrawn'));
assert(BOOKING_STATES.includes('awaiting_partner'));
assert.equal(transition('pending', 'decline'), 'declined');
assert.equal(transition('alternative_proposed', 'expire'), 'expired');
assert.equal(transition('confirmed', 'withdraw'), 'player_withdrawn');
assert.equal(transition('awaiting_partner', 'confirm'), 'confirmed');
assert.deepEqual(validateAlternative({ alternativeSlotId: 'slot_123' }), { slotId: 'slot_123', partnerMessage: null });

const runtime = readFileSync(join(process.cwd(), 'lib', 'partnerBookingRuntime.js'), 'utf8');
assert.match(runtime, /schema: "golfriend\.booking-transition\.v2"/);
assert.match(runtime, /transitionId: input\.receiptId/);
assert.match(runtime, /submissionSnapshotRef: bookingSnapshotRef\(input\.booking\)/);
assert.match(runtime, /projectionVersion: input\.projectionVersion/);
assert.match(runtime, /respondToPlayBookingAlternativeV2/);
assert.match(runtime, /withdrawPlayBookingV2/);
assert.match(runtime, /expirePlayBookingsV2/);
const alternativeResponse = runtime.slice(runtime.indexOf('exports.respondToPlayBookingAlternativeV2 = (0'), runtime.indexOf('exports.withdrawPlayBookingV2 = (0'));
assert.doesNotMatch(alternativeResponse, /tx\.create\(ref/);
assert.doesNotMatch(alternativeResponse, /status: "confirmed"/);
assert.match(alternativeResponse, /status: "awaiting_partner"/);
assert.doesNotMatch(alternativeResponse, /status: "pending"/);
const alternativeAcceptanceProjection = buildBookingReport(
  [{ bookingId: 'booking_1', organizationId: 'org_1', courseId: 'course_1', slotId: 'slot_1', date: '2099-01-01', time: '09:00', timeZone: 'UTC', status: 'awaiting_partner', version: 2 }],
  [{ slotId: 'slot_1', organizationId: 'org_1', courseId: 'course_1', date: '2099-01-01', time: '09:00', timeZone: 'UTC', capacity: 4, bookedCount: 1 }],
  [{ courseId: 'course_1', organizationId: 'org_1', status: 'active' }], [], {}, '2026-01-01T00:00:00.000Z',
);
assert.equal(alternativeAcceptanceProjection.rows[0]?.status, 'awaiting_partner');
assert.equal(alternativeAcceptanceProjection.statuses.awaiting_partner, 1);
assert.equal(alternativeAcceptanceProjection.anomalies.some((anomaly) => anomaly.code === 'STATUS_DIVERGENCE'), false);
console.log('partner booking contract v2: authoritative receipts, projection version, and non-creating alternative responses verified.');
