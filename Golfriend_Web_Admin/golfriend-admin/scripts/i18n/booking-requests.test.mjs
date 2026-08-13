// L1 slice 2 gate: partner Booking Requests localized to all eight locales,
// Thai actually translated, no hard-coded English, callables preserved.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { BOOKING_REQUESTS } from '../../src/i18n/partner/bookingRequests.ts';

const file = fileURLToPath(new URL('../../src/components/B2B/BookingRequests.tsx', import.meta.url));
const raw = fs.readFileSync(file, 'utf8');

test('BOOKING_REQUESTS covers all eight locales with all keys, non-empty', () => {
  const enKeys = Object.keys(BOOKING_REQUESTS.en);
  for (const code of LOCALE_CODES) {
    assert.ok(BOOKING_REQUESTS[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(BOOKING_REQUESTS[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(BOOKING_REQUESTS[code][k]).length > 0, `${code}.${k} empty`);
  }
});

test('Thai is actually translated (differs from English)', () => {
  for (const k of Object.keys(BOOKING_REQUESTS.en)) {
    assert.notEqual(BOOKING_REQUESTS.th[k], BOOKING_REQUESTS.en[k], `th.${k} not translated`);
  }
});

test('BookingRequests routes copy through the provider (no hard-coded English)', () => {
  assert.match(raw, /useT\(\s*BOOKING_REQUESTS\s*\)/, 'must use useT(BOOKING_REQUESTS)');
  for (const literal of [
    '>Booking Requests<', '>Confirm<', '>Reject<', '>Recently Resolved<',
    'No pending booking requests', 'Type a message', 'Nothing resolved yet', 'No messages yet',
  ]) {
    assert.ok(!raw.includes(literal), `hard-coded English "${literal}" still present`);
  }
});

test('booking callables are preserved (non-financial flow intact)', () => {
  for (const callable of ['respondBooking', 'cancelBooking', 'sendBookingMessage']) {
    assert.match(raw, new RegExp(callable), `callable ${callable} missing`);
  }
});
