// ==========================================
// FILE: functions/src/bookingLogic.test.ts
// Focused source tests for the NON-FINANCIAL booking lifecycle. Runs on plain
// node:assert (no framework) via `npm run test:booking` after tsc.
// ==========================================
import assert from 'node:assert';
import {
  isSlotBookable,
  seatDeltaFor,
  statusAfter,
  userStatusKeyFor,
  isTransitionAllowed,
  applySeatDelta,
  financialFieldsIn,
  isNonFinancialBooking,
  FINANCIAL_BOOKING_FIELDS,
} from './bookingLogic.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

check('slot bookable only when open with spare capacity', () => {
  assert.equal(isSlotBookable('open', 0, 4), true);
  assert.equal(isSlotBookable('open', 3, 4), true);
  assert.equal(isSlotBookable('open', 4, 4), false); // full
  assert.equal(isSlotBookable('closed', 0, 4), false); // closed
});

check('seat deltas: request +1, reject/cancel -1, confirm 0', () => {
  assert.equal(seatDeltaFor('request'), +1);
  assert.equal(seatDeltaFor('reject'), -1);
  assert.equal(seatDeltaFor('cancel'), -1);
  assert.equal(seatDeltaFor('confirm'), 0);
});

check('status transitions produce the four non-financial statuses', () => {
  assert.equal(statusAfter('request'), 'pending');
  assert.equal(statusAfter('confirm'), 'confirmed');
  assert.equal(statusAfter('reject'), 'rejected');
  assert.equal(statusAfter('cancel'), 'cancelled');
});

check('no financial statuses exist (no refunded/disputed)', () => {
  const all = ['request', 'confirm', 'reject', 'cancel'].map((a) => statusAfter(a as any));
  assert.deepEqual([...new Set(all)].sort(), ['cancelled', 'confirmed', 'pending', 'rejected']);
  assert.ok(!all.includes('refunded' as any));
  assert.ok(!all.includes('disputed' as any));
});

check('userStatusKey mapping', () => {
  assert.equal(userStatusKeyFor('pending'), 'booking_pending');
  assert.equal(userStatusKeyFor('cancelled'), 'booking_cancelled');
});

check('transition guards', () => {
  assert.equal(isTransitionAllowed('none', 'request'), true);
  assert.equal(isTransitionAllowed('pending', 'confirm'), true);
  assert.equal(isTransitionAllowed('pending', 'reject'), true);
  assert.equal(isTransitionAllowed('pending', 'cancel'), true);
  assert.equal(isTransitionAllowed('confirmed', 'cancel'), true);
  assert.equal(isTransitionAllowed('confirmed', 'reject'), false); // only pending can be rejected
  assert.equal(isTransitionAllowed('rejected', 'cancel'), false);
  assert.equal(isTransitionAllowed('pending', 'request'), false); // already exists
});

check('seat count floors at zero', () => {
  assert.equal(applySeatDelta(0, -1), 0);
  assert.equal(applySeatDelta(3, +1), 4);
  assert.equal(applySeatDelta(1, -1), 0);
});

check('financial-field guard rejects money fields', () => {
  assert.deepEqual(financialFieldsIn({ status: 'pending', date: '2026-08-12' }), []);
  assert.ok(isNonFinancialBooking({ slotId: 's', status: 'pending', playerUid: 'u' }));
  assert.ok(!isNonFinancialBooking({ status: 'pending', priceChips: 500 }));
  assert.ok(!isNonFinancialBooking({ status: 'pending', amount: -500 }));
  assert.ok(financialFieldsIn({ chips: 10, hold: true }).length === 2);
});

check('financial field list covers the banned money concepts', () => {
  for (const f of ['priceChips', 'refund', 'escrow', 'payout', 'settlement', 'chips', 'hold']) {
    assert.ok((FINANCIAL_BOOKING_FIELDS as readonly string[]).includes(f), `${f} must be guarded`);
  }
});

console.log(`\nbookingLogic: ${passed} checks passed.`);
