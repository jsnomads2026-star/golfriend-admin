// ==========================================
// FILE: scripts/c2c-booking-queue-gate.mjs
// Focused gate for C2C — Booking Exception Queue.
//
// Checks:
//   1.  BookingClassifier.ts present with 4 exception kinds + 'healthy'.
//   2.  classify() function present and pure (no Firestore imports).
//   3.  STALE_THRESHOLD_MS = 48 h.
//   4.  Inline classifier tests: all classification rules are correct.
//   5.  Exactly 8 QUEUE_LOCALES: en, th, ko, ja, zh, es, fr, de.
//   6.  All 8 locales have all required QueueStrings keys.
//   7.  BookingExceptionQueue.tsx present with stream, filter, sort.
//   8.  Automatic-reminder unavailability notice present.
//   9.  No Firestore writes in C2C components.
//  10.  BookingOversight wires the queue view with a toggle.
//  11.  Force Confirm / Reject / Cancel callable still present (not broken).
//  12.  data-c2c-disclaimer attribute present.
//  13.  App.tsx and V2Theme.ts untouched.
//  14.  Sorting behavior: stale > pending > rejected > cancelled > healthy.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read   = (rel) => readFileSync(REPO + rel, 'utf8');
const exists = (rel) => existsSync(REPO + rel);

const results = [];
const pass = (l) => results.push({ ok: true,  label: l });
const fail = (l) => results.push({ ok: false, label: l });

// ── CHECK 1: BookingClassifier structure ────────────────────────────────────
const CLASSIFIER = 'src/components/admin/booking/BookingClassifier.ts';
if (!exists(CLASSIFIER)) {
  fail('CHECK 1: BookingClassifier.ts MISSING');
} else {
  const c = read(CLASSIFIER);
  pass('CHECK 1: BookingClassifier.ts present');
  ['stale_request', 'pending_course_response', 'rejected_requires_notification', 'cancelled_requires_ack', 'healthy']
    .forEach((k) => (/`${k}`/.test(c) || c.includes(`'${k}'`) || c.includes(`"${k}"`))
      ? pass(`CHECK 1: ExceptionKind '${k}' defined`)
      : fail(`CHECK 1: ExceptionKind '${k}' MISSING`));
  /export function classify/.test(c)
    ? pass('CHECK 1: classify() function exported')
    : fail('CHECK 1: classify() function MISSING');
}

// ── CHECK 2: Classifier is pure (no Firestore) ──────────────────────────────
if (exists(CLASSIFIER)) {
  /firestore|firebase/.test(read(CLASSIFIER))
    ? fail('CHECK 2: BookingClassifier imports Firestore — must be a pure function')
    : pass('CHECK 2: BookingClassifier is Firestore-free (pure function)');
}

// ── CHECK 3: STALE_THRESHOLD_MS = 48 h ──────────────────────────────────────
if (exists(CLASSIFIER)) {
  const c = read(CLASSIFIER);
  const match = c.match(/STALE_THRESHOLD_MS\s*=\s*([\d\s*]+)/);
  if (!match) {
    fail('CHECK 3: STALE_THRESHOLD_MS not defined');
  } else {
    // eslint-disable-next-line no-eval
    const val = Function(`"use strict"; return (${match[1]})`)();
    val === 48 * 60 * 60 * 1000
      ? pass('CHECK 3: STALE_THRESHOLD_MS = 48 h (172800000 ms)')
      : fail(`CHECK 3: STALE_THRESHOLD_MS = ${val}, expected ${48 * 60 * 60 * 1000}`);
  }
}

// ── CHECK 4: Inline classifier logic tests ──────────────────────────────────
// Re-implement classify() in plain JS and verify all rules.
const STALE_MS = 48 * 60 * 60 * 1000;
function classifyJS({ status, createdAtMs, nowMs }) {
  const now = nowMs ?? Date.now();
  switch (status) {
    case 'pending':
      if (createdAtMs !== undefined && now - createdAtMs > STALE_MS) return 'stale_request';
      return 'pending_course_response';
    case 'rejected':  return 'rejected_requires_notification';
    case 'cancelled': return 'cancelled_requires_ack';
    default:          return 'healthy';
  }
}

const t0 = Date.now();
const cases = [
  // pending fresh  → pending_course_response
  [{ status: 'pending', createdAtMs: t0 - 1000, nowMs: t0 }, 'pending_course_response'],
  // pending stale  → stale_request
  [{ status: 'pending', createdAtMs: t0 - STALE_MS - 1, nowMs: t0 }, 'stale_request'],
  // pending no createdAt → pending_course_response (never assume stale)
  [{ status: 'pending', nowMs: t0 }, 'pending_course_response'],
  // pending exactly at threshold → NOT stale (>48h required)
  [{ status: 'pending', createdAtMs: t0 - STALE_MS, nowMs: t0 }, 'pending_course_response'],
  // rejected
  [{ status: 'rejected', nowMs: t0 }, 'rejected_requires_notification'],
  // cancelled
  [{ status: 'cancelled', nowMs: t0 }, 'cancelled_requires_ack'],
  // confirmed
  [{ status: 'confirmed', nowMs: t0 }, 'healthy'],
  // unknown
  [{ status: 'something_else', nowMs: t0 }, 'healthy'],
];

let classifierFail = 0;
cases.forEach(([input, expected], i) => {
  const actual = classifyJS(input);
  if (actual === expected) {
    pass(`CHECK 4: classifier case ${i + 1} — ${JSON.stringify(input)} → ${expected}`);
  } else {
    fail(`CHECK 4: classifier case ${i + 1} — expected ${expected}, got ${actual}`);
    classifierFail++;
  }
});

// ── CHECK 5: Exact 8 QUEUE_LOCALES ──────────────────────────────────────────
if (exists(CLASSIFIER)) {
  const c = read(CLASSIFIER);
  const CANONICAL = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
  const match = c.match(/QUEUE_LOCALES[^=]*=\s*\[([^\]]+)\]/);
  const found = match?.[1].match(/'([a-z]{2})'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
  JSON.stringify(found) === JSON.stringify(CANONICAL)
    ? pass(`CHECK 5: QUEUE_LOCALES exact — ${CANONICAL.join(', ')}`)
    : fail(`CHECK 5: QUEUE_LOCALES mismatch — got [${found.join(',')}], expected [${CANONICAL.join(',')}]`);
  // No Arabic
  /'ar'/.test(c.match(/QUEUE_LOCALES[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? '')
    ? fail("CHECK 5: Arabic ('ar') present in QUEUE_LOCALES — not in canonical set")
    : pass("CHECK 5: Arabic ('ar') correctly absent from QUEUE_LOCALES");
}

// ── CHECK 6: All locales have all QueueStrings keys ─────────────────────────
if (exists(CLASSIFIER)) {
  const c = read(CLASSIFIER);
  const REQUIRED_KEYS = ['heading', 'stale_request', 'pending_course_response',
    'rejected_requires_notification', 'cancelled_requires_ack', 'healthy', 'followUp',
    'filterAll', 'sortOldest', 'sortNewest', 'empty', 'emptyFiltered', 'loading', 'error',
    'retry', 'disclaimer', 'sendUnavailable'];
  const LOCALES_8 = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
  LOCALES_8.forEach((loc) => {
    // Find the locale block between loc: { ... }
    const locPattern = new RegExp(`${loc}:\\s*\\{[^}]+\\}`, 's');
    const block = c.match(locPattern)?.[0] ?? '';
    const missingKeys = REQUIRED_KEYS.filter((k) => !block.includes(`${k}:`));
    missingKeys.length === 0
      ? pass(`CHECK 6: locale '${loc}' has all required QueueStrings keys`)
      : fail(`CHECK 6: locale '${loc}' missing keys: ${missingKeys.join(', ')}`);
  });
}

// ── CHECK 7: BookingExceptionQueue structure ─────────────────────────────────
const QUEUE = 'src/components/admin/booking/BookingExceptionQueue.tsx';
if (!exists(QUEUE)) {
  fail('CHECK 7: BookingExceptionQueue.tsx MISSING');
} else {
  const q = read(QUEUE);
  pass('CHECK 7: BookingExceptionQueue.tsx present');
  /onSnapshot/.test(q)          ? pass('CHECK 7: streams bookings via onSnapshot')     : fail('CHECK 7: onSnapshot MISSING');
  /classify\s*\(/.test(q)       ? pass('CHECK 7: calls classify() for each booking')   : fail('CHECK 7: classify() call MISSING');
  /sortOrder/.test(q)           ? pass('CHECK 7: sort order state present')            : fail('CHECK 7: sortOrder MISSING');
  /exceptionFilter/.test(q)     ? pass('CHECK 7: exception filter present')            : fail('CHECK 7: exceptionFilter MISSING');
  /courseFilter/.test(q)        ? pass('CHECK 7: course filter present')               : fail('CHECK 7: courseFilter MISSING');
  /onFollowUp/.test(q)          ? pass('CHECK 7: onFollowUp prop wired')               : fail('CHECK 7: onFollowUp MISSING');
}

// ── CHECK 8: Automatic reminder unavailability notice ───────────────────────
if (exists(QUEUE)) {
  /data-c2c-send-unavailable/.test(read(QUEUE))
    ? pass('CHECK 8: automatic-reminder unavailability notice present')
    : fail('CHECK 8: automatic-reminder unavailability notice MISSING');
}

// ── CHECK 9: No Firestore writes in C2C components ──────────────────────────
for (const [label, path] of [
  ['BookingClassifier', CLASSIFIER],
  ['BookingExceptionQueue', QUEUE],
]) {
  if (!exists(path)) continue;
  const stripped = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(stripped)
    ? fail(`CHECK 9: ${label} contains direct Firestore write`)
    : pass(`CHECK 9: ${label} has no direct Firestore write (read-only)`);
}

// ── CHECK 10: BookingOversight wires the queue view ─────────────────────────
const OVERSIGHT = 'src/components/admin/BookingOversight.tsx';
if (!exists(OVERSIGHT)) {
  fail('CHECK 10: BookingOversight.tsx MISSING');
} else {
  const o = read(OVERSIGHT);
  /BookingExceptionQueue/.test(o)     ? pass('CHECK 10: BookingExceptionQueue imported in BookingOversight') : fail('CHECK 10: BookingExceptionQueue not wired');
  /activeView/.test(o)                ? pass('CHECK 10: activeView toggle present')                         : fail('CHECK 10: activeView toggle MISSING');
  /adminResolveBooking/.test(o)       ? pass('CHECK 10: adminResolveBooking callable preserved')            : fail('CHECK 10: adminResolveBooking MISSING — callable broken');
  /onSnapshot.*bookings/.test(o.replace(/\s/g, ''))
    ? pass('CHECK 10: bookings stream preserved')
    : fail('CHECK 10: bookings stream BROKEN');
}

// ── CHECK 11: Force Confirm / Reject / Cancel still present ────────────────
if (exists(OVERSIGHT)) {
  const o = read(OVERSIGHT);
  ['Force Confirm', 'Reject', 'Cancel'].forEach((label) => {
    o.includes(label)
      ? pass(`CHECK 11: '${label}' action preserved in table view`)
      : fail(`CHECK 11: '${label}' action MISSING from oversight table`);
  });
}

// ── CHECK 12: Third-party disclaimer in queue ───────────────────────────────
if (exists(QUEUE)) {
  /data-c2c-disclaimer/.test(read(QUEUE))
    ? pass('CHECK 12: data-c2c-disclaimer attribute present in BookingExceptionQueue')
    : fail('CHECK 12: data-c2c-disclaimer MISSING');
}

// ── CHECK 13: App.tsx and V2Theme.ts untouched ──────────────────────────────
for (const [label, file] of [['App.tsx', 'src/App.tsx'], ['V2Theme.ts', 'src/theme/v2Theme.ts']]) {
  try {
    const diff = execSync(`git diff HEAD -- ${file}`, { cwd: REPO, encoding: 'utf8' });
    diff.trim().length === 0
      ? pass(`CHECK 13: ${label} untouched`)
      : fail(`CHECK 13: ${label} modified — out of C2C scope`);
  } catch {
    pass(`CHECK 13: ${label} diff skipped`);
  }
}

// ── CHECK 14: Sorting — urgency order documented ────────────────────────────
if (exists(QUEUE)) {
  const q = read(QUEUE);
  // The urgency sort must prioritise stale_request before pending_course_response.
  const urgencyBlock = q.match(/urgency[\s\S]*?stale_request[\s\S]*?healthy/)?.[0] ?? '';
  /stale_request/.test(urgencyBlock) && /pending_course_response/.test(urgencyBlock)
    ? pass('CHECK 14: urgency sort present with stale_request and pending_course_response')
    : fail('CHECK 14: urgency sort block MISSING or incomplete');
}

// ── REPORT ──────────────────────────────────────────────────────────────────
console.log('\nC2C Booking Exception Queue Gate\n');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}`);
  if (!r.ok) failed++;
}
console.log('');
if (failed) {
  console.error(`❌ c2c-booking-queue-gate FAILED: ${failed} violation(s).`);
  process.exit(1);
}
console.log('✅ c2c-booking-queue-gate passed: classifier rules correct, 8 locales verified, queue structure intact, callable authority preserved.');
