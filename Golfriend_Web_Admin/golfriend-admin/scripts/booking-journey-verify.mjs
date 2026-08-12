// ==========================================
// FILE: scripts/booking-journey-verify.mjs
// Fail-closed STATIC verifier for the role-specific, strictly NON-FINANCIAL
// booking journey (run: `npm run verify:booking`).
//
// Journey (no money anywhere): course inventory/availability → request →
// confirm/reject/cancel → message → audit. Every authoritative write is a
// Cloud Function callable; clients only read their own scope.
//
// This script scans SOURCE ONLY (no build, no network). It proves, per role
// surface, that:
//   • the expected callable(s) are wired in each booking component, and
//   • NO financial primitive (priceChips / booking_hold / escrow / refund /
//     payout / settle / chips) exists in the booking CODE.
//
// Descriptive comments legitimately DESCRIBE the non-financial guarantee (e.g.
// "// no refund, payout, escrow or settlement"), so comments are STRIPPED
// before the negative scans — we assert on real code, not on prose. Any failed
// check exits 1 (fail-closed).
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const FUNCTIONS = join(ROOT, 'functions', 'src', 'index.ts');

// ---- helpers --------------------------------------------------------------

// Strip /* block */ and // line comments so negative scans hit CODE only.
// String-literal edge cases don't occur in the scanned sources; kept simple.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function loadCode(absPath) {
  if (!existsSync(absPath)) return null;
  return stripComments(readFileSync(absPath, 'utf8'));
}

const results = [];
function check(label, passed, detail = '') {
  results.push({ label, passed: !!passed, detail });
}

// A callable is "wired" if its name appears as a string literal in the code
// (i.e. httpsCallable(getFunctions(), 'name')).
const callable = (code, name) =>
  new RegExp(`['"\`]${name}['"\`]`).test(code);

// Financial primitives that must never appear in booking code.
const FIN = ['priceChips', 'booking_hold', 'escrow', 'refund', 'payout', 'settle', 'chips'];
const finHits = (code, terms = FIN) =>
  terms.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(code));

// Resolve a component under src/, tolerant of the two accepted availability
// authors (SB CourseAvailability OR Admin TeeTimeInventory).
const compPath = (rel) => join(SRC, rel);

// ---- surfaces -------------------------------------------------------------

const F = {
  courseAvailability: 'components/B2B/CourseAvailability.tsx',
  bookingRequests: 'components/B2B/BookingRequests.tsx',
  bookingOversight: 'components/admin/BookingOversight.tsx',
  bookingHandoff: 'components/public/BookingHandoff.tsx',
  teeTimeInventory: 'components/admin/TeeTimeInventory.tsx',
  enterpriseReporting: 'components/B2B/enterprise/EnterpriseReporting.tsx',
};

// === 1. CLIENT WIRING (positive) ==========================================

// 1a · Small-Business availability author.
{
  const code = loadCode(compPath(F.courseAvailability));
  if (code == null) {
    check('SB CourseAvailability wires manageTeeTimeSlot', false, 'file missing');
    check('SB CourseAvailability has NO priceChips', false, 'file missing');
  } else {
    check('SB CourseAvailability wires manageTeeTimeSlot', callable(code, 'manageTeeTimeSlot'));
    check('SB CourseAvailability has NO priceChips', !/priceChips/i.test(code));
  }
}

// 1b · Small-Business booking desk.
{
  const code = loadCode(compPath(F.bookingRequests));
  if (code == null) {
    check('SB BookingRequests wires respondBooking + cancelBooking + sendBookingMessage', false, 'file missing');
  } else {
    check(
      'SB BookingRequests wires respondBooking + cancelBooking + sendBookingMessage',
      callable(code, 'respondBooking') && callable(code, 'cancelBooking') && callable(code, 'sendBookingMessage'),
    );
  }
}

// 1c · Admin oversight console.
{
  const code = loadCode(compPath(F.bookingOversight));
  if (code == null) {
    check('Admin BookingOversight wires adminResolveBooking', false, 'file missing');
    check('Admin BookingOversight has NO refund/escalate/booking_hold/priceChips', false, 'file missing');
  } else {
    check('Admin BookingOversight wires adminResolveBooking', callable(code, 'adminResolveBooking'));
    const banned = finHits(code, ['refund', 'escalate', 'booking_hold', 'priceChips']);
    check('Admin BookingOversight has NO refund/escalate/booking_hold/priceChips', banned.length === 0,
      banned.length ? `found: ${banned.join(', ')}` : '');
  }
}

// 1d · Public player handoff.
{
  const code = loadCode(compPath(F.bookingHandoff));
  if (code == null) {
    check('Public BookingHandoff wires requestBooking + cancelBooking + sendBookingMessage', false, 'file missing');
    check('Public BookingHandoff shows seats-left with NO price', false, 'file missing');
  } else {
    check(
      'Public BookingHandoff wires requestBooking + cancelBooking + sendBookingMessage',
      callable(code, 'requestBooking') && callable(code, 'cancelBooking') && callable(code, 'sendBookingMessage'),
    );
    const showsSeats = /seatsLeft/i.test(code) || /seats.?left/i.test(code);
    const noPrice = !/\bprice\b/i.test(code);
    check('Public BookingHandoff shows seats-left with NO price', showsSeats && noPrice,
      !showsSeats ? 'seats-left not found' : (!noPrice ? 'price token present in code' : ''));
  }
}

// 1e · Admin availability author.
{
  const code = loadCode(compPath(F.teeTimeInventory));
  if (code == null) {
    check('Admin TeeTimeInventory wires manageTeeTimeSlot with NO priceChips', false, 'file missing');
  } else {
    check('Admin TeeTimeInventory wires manageTeeTimeSlot with NO priceChips',
      callable(code, 'manageTeeTimeSlot') && !/priceChips/i.test(code),
      /priceChips/i.test(code) ? 'priceChips present' : '');
  }
}

// === 2. NO FINANCIAL PRIMITIVES ACROSS BOOKING COMPONENTS (negative) ======
{
  const surfaces = [
    ['Public/BookingHandoff', F.bookingHandoff],
    ['SB/CourseAvailability', F.courseAvailability],
    ['SB/BookingRequests', F.bookingRequests],
    ['Admin/BookingOversight', F.bookingOversight],
    ['Admin/TeeTimeInventory', F.teeTimeInventory],
    ['Enterprise/EnterpriseReporting', F.enterpriseReporting],
  ];
  const dirty = [];
  let missing = 0;
  for (const [name, rel] of surfaces) {
    const code = loadCode(compPath(rel));
    if (code == null) { missing += 1; dirty.push(`${name}: MISSING`); continue; }
    const hits = finHits(code);
    if (hits.length) dirty.push(`${name}: ${hits.join(', ')}`);
  }
  check(
    'No booking component contains priceChips/booking_hold/escrow/refund/payout/settle/chips',
    dirty.length === 0 && missing === 0,
    dirty.join(' | '),
  );
}

// === 3. BACKEND CALLABLES + CLEAN BOOKING SECTION =========================
{
  const CALLABLES = [
    'manageTeeTimeSlot', 'requestBooking', 'respondBooking',
    'cancelBooking', 'sendBookingMessage', 'adminResolveBooking',
  ];
  if (!existsSync(FUNCTIONS)) {
    check('Backend exports all 6 booking callables', false, 'functions/src/index.ts missing');
    check('Backend booking section has NO priceChips/booking_hold/chips', false, 'functions/src/index.ts missing');
  } else {
    const raw = readFileSync(FUNCTIONS, 'utf8');

    // 3a · every callable is exported.
    const missingExports = CALLABLES.filter(
      (n) => !new RegExp(`export\\s+const\\s+${n}\\b`).test(raw),
    );
    check('Backend exports all 6 booking callables', missingExports.length === 0,
      missingExports.length ? `missing: ${missingExports.join(', ')}` : '');

    // 3b · booking SECTION only (from first booking export to the next
    // non-booking export) must be free of financial primitives in CODE.
    // Scoping avoids the file's unrelated resolveEscrow/chips ledger fns.
    const idxs = CALLABLES
      .map((n) => raw.search(new RegExp(`export\\s+const\\s+${n}\\b`)))
      .filter((i) => i >= 0);
    if (idxs.length === 0) {
      check('Backend booking section has NO priceChips/booking_hold/chips', false, 'no booking exports located');
    } else {
      const start = Math.min(...idxs);
      const lastBooking = Math.max(...idxs);
      const nextExport = raw.slice(lastBooking + 1).search(/export\s+const\s+\w+/);
      const end = nextExport >= 0 ? lastBooking + 1 + nextExport : raw.length;
      const section = stripComments(raw.slice(start, end));
      const hits = finHits(section, ['priceChips', 'booking_hold', 'chips']);
      check('Backend booking section has NO priceChips/booking_hold/chips', hits.length === 0,
        hits.length ? `found in booking code: ${hits.join(', ')}` : '');
    }
  }
}

// ---- report ---------------------------------------------------------------

const pad = Math.max(...results.map((r) => r.label.length));
console.log('\n  BOOKING JOURNEY — STATIC VERIFICATION (non-financial)\n');
let failed = 0;
for (const r of results) {
  if (!r.passed) failed += 1;
  const mark = r.passed ? '✓' : '✗';
  const detail = r.detail ? `   << ${r.detail}` : '';
  console.log(`  ${mark}  ${r.label.padEnd(pad)}${detail}`);
}
console.log('');
if (failed) {
  console.error(`❌ BOOKING JOURNEY VERIFY FAILED — ${failed}/${results.length} check(s) failed.`);
  process.exit(1);
}
console.log(`✅ Booking journey verified: ${results.length}/${results.length} checks passed (strictly non-financial).`);
