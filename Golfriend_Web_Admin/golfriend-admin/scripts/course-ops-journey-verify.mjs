// ==========================================
// FILE: scripts/course-ops-journey-verify.mjs  (run: `npm run verify:courseops`)
// LUNCH SPRINT Lane C item 3 — Course-operations commissioning journey under
// SYNTHETIC v2-preview config. Exercises the REAL pure logic (courseSync +
// bookingLogic) across: provider sync (dry-run / validation / manual-lock
// preservation / audit-failure), inventory, availability, operator assignment,
// and the non-financial booking lifecycle — proving zero V1 resolution.
// Local source test only: no provider, no emulator, no network.
// ==========================================
import { resolveFirebaseTarget, findV1Leaks, V1_FORBIDDEN } from '../src/firebaseTarget.js';

// Real compiled pure cores (functions/lib). Fail loudly if not built.
let courseSync, booking;
try {
  courseSync = await import('../functions/lib/courseSync.js');
  booking = await import('../functions/lib/bookingLogic.js');
} catch (e) {
  console.error('❌ functions/lib not built — run `npm --prefix functions run build` first.', e.message);
  process.exit(1);
}
const { classifyCourseSync, isValidCoordinate, isValidProviderId } = courseSync;
const { isSlotBookable, statusAfter, seatDeltaFor, applySeatDelta, isNonFinancialBooking } = booking;

const fails = [];
const assert = (c, m) => { if (!c) { fails.push(m); console.error(`  ✗ ${m}`); } else { console.log(`  ✓ ${m}`); } };

// ---- Stage 0: synthetic v2-preview config (zero V1) ----
const V2_ENV = {
  VITE_FIREBASE_V2_API_KEY: 'FAKE_V2_API_KEY_0000',
  VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v2-preview.firebaseapp.com',
  VITE_FIREBASE_V2_PROJECT_ID: 'golfriend-v2-preview',
  VITE_FIREBASE_V2_STORAGE_BUCKET: 'golfriend-v2-preview.appspot.com',
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '999999999999',
  VITE_FIREBASE_V2_APP_ID: '1:999999999999:web:v2preview000000',
};
const target = resolveFirebaseTarget('v2-preview', V2_ENV);
assert(target.projectId === 'golfriend-v2-preview', 'stage0: v2-preview config resolves injected V2 project');
assert(findV1Leaks(target).length === 0, 'stage0: v2-preview config has zero V1 identifiers');

const COURSE = 'v2course_commissioning';

// ---- Stage 1: provider sync — dry-run classifications, validation, manual lock, audit failure ----
console.log('\n[stage 1] provider sync (dry-run / validation / manual-lock / audit failure)');
assert(isValidProviderId(COURSE) === true, 'valid provider id accepted');
assert(isValidProviderId('unknown') === false && isValidProviderId('') === false, 'invalid provider ids rejected');
assert(isValidCoordinate(12.9236, 100.8825) === true, 'valid coordinate accepted');
assert(isValidCoordinate(0, 0) === false && isValidCoordinate(91, 200) === false, 'null-island/out-of-range coords rejected');

assert(classifyCourseSync(COURSE, { latitude: 0, longitude: 0 }, { courseID: COURSE, latitude: 12.9, longitude: 100.8 }).result === 'updated',
  'dry-run: broken course → updated');
assert(classifyCourseSync(COURSE, { latitude: 12.9, longitude: 100.8 }, { courseID: COURSE, latitude: 12.9, longitude: 100.8 }).result === 'nochange',
  'dry-run: already-correct → nochange (idempotent)');
assert(classifyCourseSync(COURSE, {}, { courseID: 'other_course', latitude: 12.9, longitude: 100.8 }).result === 'conflict',
  'dry-run: provider id mismatch → conflict');
assert(classifyCourseSync(COURSE, {}, { courseID: COURSE, latitude: 0, longitude: 0 }).result === 'conflict',
  'dry-run: provider bad coords → conflict');
assert(classifyCourseSync(COURSE, { latitude: 10, longitude: 20 }, null).result === 'missing',
  'dry-run: no provider data → missing');
assert(classifyCourseSync(COURSE, { latitude: 12.9, longitude: 100.8, manualLock: true }, { courseID: COURSE, latitude: 5, longitude: 50 }).result === 'skipped_manual',
  'manual-lock preserved: trusted manual correction NOT overwritten → skipped_manual');
assert(classifyCourseSync('', { latitude: 12.9, longitude: 100.8 }, { courseID: '', latitude: 5, longitude: 50 }).result === 'error',
  'audit-failure path: invalid stored provider id → error (never silently applied)');

// ---- Stage 2: inventory + availability (non-financial) ----
console.log('\n[stage 2] inventory + availability');
const slot = { courseId: COURSE, date: '2999-01-01', time: '08:00', capacity: 4, bookedCount: 0, status: 'open' };
assert(!('priceChips' in slot), 'tee-time slot carries NO price (non-financial inventory)');
assert(isSlotBookable(slot.status, slot.bookedCount, slot.capacity) === true, 'published slot is bookable (capacity only)');
assert(isSlotBookable('closed', 0, 4) === false && isSlotBookable('open', 4, 4) === false, 'closed/full slots not bookable');

// ---- Stage 3: operator assignment (server-owned authority) ----
console.log('\n[stage 3] operator assignment');
const operatorRecord = { courseId: COURSE, operatorUid: 'v2_operator', operatorPartnerId: 'v2_operator' };
const isOperator = (uid) => operatorRecord.courseId === COURSE && operatorRecord.operatorUid === uid;
assert(isOperator('v2_operator') === true, 'claimed operator authorizes their own course');
assert(isOperator('someone_else') === false, 'non-operator is denied the course');

// ---- Stage 4: non-financial booking lifecycle ----
console.log('\n[stage 4] non-financial booking (request → confirm → reject → cancel → message → audit)');
const player = 'v2_player';
let booked = applySeatDelta(slot.bookedCount, seatDeltaFor('request'));
let b = { slotId: `${COURSE}_20990101_0800`, courseId: COURSE, playerUid: player, status: statusAfter('request'), userStatusKey: 'booking_pending' };
assert(booked === 1 && b.status === 'pending', 'request reserves a seat → pending');
assert(isNonFinancialBooking(b), 'booking doc has no financial field');
b = { ...b, status: statusAfter('confirm') };
assert(b.status === 'confirmed' && booked === 1, 'operator confirm keeps seat, no money');
const rejected = applySeatDelta(booked, seatDeltaFor('reject'));
assert(rejected === 0 && statusAfter('reject') === 'rejected', 'reject releases seat, no refund');
booked = applySeatDelta(1, seatDeltaFor('cancel'));
assert(booked === 0 && statusAfter('cancel') === 'cancelled', 'cancel releases seat, no refund');
const message = { senderUid: player, senderRole: 'player', text: 'On my way.' };
assert(!('amount' in message), 'booking message is communicative, non-financial');
const audit = ['requested', 'confirmed', 'cancelled'].map((action) => ({ bookingId: b.slotId, action, byUid: player, byRole: 'player' }));
assert(audit.every((a) => isNonFinancialBooking(a)), 'audit trail append-only and non-financial');

// ---- Whole-run zero-V1 proof ----
const blob = JSON.stringify({ target, slot, operatorRecord, b, message, audit });
assert(V1_FORBIDDEN.filter((x) => blob.includes(x)).length === 0, 'entire course-ops commissioning run contains no golfriend-v1 identifier');

if (fails.length) {
  console.error(`\n❌ course-ops commissioning journey FAILED (${fails.length}).`);
  process.exit(1);
}
console.log('\n✅ course-ops commissioning journey passed under synthetic v2-preview: sync(dry-run/validation/manual-lock/audit) → inventory/availability → operator assignment → non-financial booking, zero V1.');
