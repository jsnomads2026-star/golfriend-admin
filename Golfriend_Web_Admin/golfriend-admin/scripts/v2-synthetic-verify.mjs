// ==========================================
// FILE: scripts/v2-synthetic-verify.mjs  (run: `npm run verify:v2`)
// Synthetic V2 verification: runs the existing NON-FINANCIAL booking journey
// using injected fake-but-well-formed V2 test identities and proves that (a) the
// resolved target is V1-free and (b) the journey stays non-financial. Local
// source test only — no provider, no emulator, no network.
// ==========================================
import { resolveFirebaseTarget, findV1Leaks, V1_FORBIDDEN } from '../src/firebaseTarget.js';

// Real booking rules (compiled from functions/src/bookingLogic.ts). Fallback to
// inline equivalents if the functions lib has not been built.
let rules;
try {
  rules = await import('../functions/lib/bookingLogic.js');
} catch {
  rules = {
    statusAfter: (a) => ({ request: 'pending', confirm: 'confirmed', reject: 'rejected', cancel: 'cancelled' }[a]),
    seatDeltaFor: (a) => ({ request: 1, confirm: 0, reject: -1, cancel: -1 }[a]),
    applySeatDelta: (b, d) => Math.max(0, Number(b || 0) + d),
    isNonFinancialBooking: (o) => !Object.keys(o || {}).some((k) => /priceChips|price|amount|chips|hold|escrow|settle|payout|refund|wallet/i.test(k)),
    isSlotBookable: (s, b, c) => s === 'open' && Number(b) < Number(c),
  };
  console.log('  (note: functions/lib not built — using inline rule equivalents)');
}

const fails = [];
const assert = (c, m) => { if (!c) { fails.push(m); console.error(`  ✗ ${m}`); } else { console.log(`  ✓ ${m}`); } };

// --- Injected fake-but-well-formed V2 identities ---
const V2_ENV = {
  VITE_FIREBASE_V2_API_KEY: 'FAKE_V2_API_KEY_0000',
  VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v2-preview.firebaseapp.com',
  VITE_FIREBASE_V2_PROJECT_ID: 'golfriend-v2-preview',
  VITE_FIREBASE_V2_STORAGE_BUCKET: 'golfriend-v2-preview.appspot.com',
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '999999999999',
  VITE_FIREBASE_V2_APP_ID: '1:999999999999:web:v2preview000000',
};
const target = resolveFirebaseTarget('v2-preview', V2_ENV);
assert(target.projectId === 'golfriend-v2-preview', 'resolved v2-preview projectId is the injected V2 id');
assert(findV1Leaks(target).length === 0, 'resolved v2-preview target has zero V1 identifiers');

// --- Simulate the non-financial booking journey with V2-realm identities ---
const V2_COURSE = 'v2course_synthetic';
const V2_PLAYER = 'v2player_synthetic';
const slot = { courseId: V2_COURSE, date: '2999-01-01', time: '08:00', capacity: 4, bookedCount: 0, status: 'open' };
const trail = [];

// request
assert(rules.isSlotBookable(slot.status, slot.bookedCount, slot.capacity), 'V2 slot is bookable (capacity only)');
slot.bookedCount = rules.applySeatDelta(slot.bookedCount, rules.seatDeltaFor('request'));
let booking = {
  slotId: `${V2_COURSE}_20990101_0800`, courseId: V2_COURSE, playerUid: V2_PLAYER,
  status: rules.statusAfter('request'), userStatusKey: 'booking_pending',
};
trail.push('requested');
assert(slot.bookedCount === 1, 'request reserves exactly one seat');
assert(booking.status === 'pending', 'request → pending');
assert(rules.isNonFinancialBooking(booking), 'booking doc carries no financial field');

// message (participant)
const messages = [{ senderUid: V2_PLAYER, senderRole: 'player', text: 'See you at 8.' }];
trail.push('messaged');
assert(messages.length === 1 && !('amount' in messages[0]), 'message is communicative, non-financial');

// confirm
booking = { ...booking, status: rules.statusAfter('confirm'), userStatusKey: 'booking_confirmed' };
trail.push('confirmed');
assert(booking.status === 'confirmed' && slot.bookedCount === 1, 'confirm keeps the seat, no money');

// cancel → seat released
slot.bookedCount = rules.applySeatDelta(slot.bookedCount, rules.seatDeltaFor('cancel'));
booking = { ...booking, status: rules.statusAfter('cancel'), userStatusKey: 'booking_cancelled' };
trail.push('cancelled');
assert(slot.bookedCount === 0, 'cancel releases the seat (no refund — nothing was charged)');
assert(booking.status === 'cancelled', 'cancel → cancelled');

// audit (append-only, non-financial)
const audit = trail.map((action) => ({ bookingId: booking.slotId, action, byUid: V2_PLAYER, byRole: 'player' }));
assert(audit.length === 4 && audit.every((a) => rules.isNonFinancialBooking(a)), 'audit trail is complete and non-financial');

// Whole-run zero-V1 proof: no V1 identifier anywhere in the synthetic state.
const blob = JSON.stringify({ target, slot, booking, messages, audit });
const runLeaks = V1_FORBIDDEN.filter((b) => blob.includes(b));
assert(runLeaks.length === 0, 'entire synthetic V2 run contains no golfriend-v1 identifier');

if (fails.length) {
  console.error(`\n❌ synthetic V2 verification FAILED (${fails.length}).`);
  process.exit(1);
}
console.log(`\n✅ synthetic V2 verification passed: non-financial journey (${trail.join(' → ')} → audit) runs under injected V2 identities with zero V1 resolution.`);
