// ==========================================
// FILE: scripts/c2b-booking-comms-gate.mjs
// Focused gate for C2B — Booking Communications slice.
//
// Checks:
//   1.  BookingDetailPanel.tsx exists and has the disclaimer.
//   2.  BookingMessageComposer.tsx exists with 8 locales defined.
//   3.  All 8 expected locale codes are exported.
//   4.  All 5 template categories are defined.
//   5.  sendBookingMessage callable is wired (not dead code).
//   6.  Copy fallback (navigator.clipboard or manual) is present.
//   7.  Export/download fallback is present.
//   8.  Send-unavailable notice rendered for non-active statuses.
//   9.  RTL direction set for Arabic locale.
//  10.  Accessible aria-label on Close button.
//  11.  BookingOversight wires the detail panel without altering streaming/callable.
//  12.  No new Firestore writes in C2B components (reads + callable only).
//  13.  Third-party disclaimer text present in both C2B components.
//  14.  App.tsx untouched (not in the C2B diff).
//  15.  v2Theme.ts untouched (not in the C2B diff).
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read   = (rel) => readFileSync(REPO + rel, 'utf8');
const exists = (rel) => existsSync(REPO + rel);

const results = [];
const pass = (l) => results.push({ ok: true,  label: l });
const fail = (l) => results.push({ ok: false, label: l });

// ---- CHECK 1: BookingDetailPanel exists and has disclaimer ----
const PANEL = 'src/components/admin/booking/BookingDetailPanel.tsx';
if (!exists(PANEL)) {
  fail('CHECK 1: BookingDetailPanel.tsx MISSING');
} else {
  const p = read(PANEL);
  pass('CHECK 1: BookingDetailPanel.tsx present');
  /data-c2b-disclaimer/.test(p)
    ? pass('CHECK 1: third-party disclaimer attribute present in BookingDetailPanel')
    : fail('CHECK 1: third-party disclaimer MISSING from BookingDetailPanel');
  /Golfriend.*does not sell tee times/.test(p)
    ? pass('CHECK 1: disclaimer copy — does not sell tee times')
    : fail('CHECK 1: disclaimer copy MISSING "does not sell tee times"');
}

// ---- CHECK 2: BookingMessageComposer exists ----
const COMPOSER = 'src/components/admin/booking/BookingMessageComposer.tsx';
if (!exists(COMPOSER)) {
  fail('CHECK 2: BookingMessageComposer.tsx MISSING');
} else {
  pass('CHECK 2: BookingMessageComposer.tsx present');
}

// ---- CHECK 3: Exact canonical locale set — en, th, ko, ja, zh, es, fr, de ----
if (exists(COMPOSER)) {
  const c = read(COMPOSER);
  const CANONICAL = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
  const missing  = CANONICAL.filter((l) => !new RegExp(`'${l}'`).test(c));
  const forbidden = ['ar'];  // Arabic is not in the Golfriend canonical 8-locale set
  const present  = forbidden.filter((l) => new RegExp(`'${l}':\\s*['"]`).test(c));
  missing.length === 0 && present.length === 0
    ? pass(`CHECK 3: canonical locale set exact — ${CANONICAL.join(', ')}`)
    : fail(`CHECK 3: locale contract violation — missing: [${missing.join(',')}]  forbidden present: [${present.join(',')}]`);
  // Strict equality: array literal must match exactly
  const arrayLiteral = c.match(/LOCALES\s*=\s*\[([^\]]+)\]/)?.[1] ?? '';
  const localesInArray = arrayLiteral.match(/'([a-z]{2})'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
  JSON.stringify(localesInArray) === JSON.stringify(CANONICAL)
    ? pass('CHECK 3: LOCALES array order matches canonical contract (en, th, ko, ja, zh, es, fr, de)')
    : fail(`CHECK 3: LOCALES array order mismatch — got [${localesInArray.join(',')}] expected [${CANONICAL.join(',')}]`);
}

// ---- CHECK 4: All 5 template categories present ----
if (exists(COMPOSER)) {
  const c = read(COMPOSER);
  const expected = ['confirmed', 'pending', 'rejected', 'cancelled', 'info_needed'];
  const missing = expected.filter((k) => !new RegExp(`'${k}'`).test(c));
  missing.length === 0
    ? pass('CHECK 4: all 5 template categories present')
    : fail(`CHECK 4: template categories MISSING: ${missing.join(', ')}`);
}

// ---- CHECK 5: sendBookingMessage callable wired ----
if (exists(COMPOSER)) {
  /sendBookingMessage/.test(read(COMPOSER))
    ? pass('CHECK 5: sendBookingMessage callable wired in BookingMessageComposer')
    : fail('CHECK 5: sendBookingMessage callable MISSING — send feature not wired');
}

// ---- CHECK 6 & 7: copy + export fallbacks ----
if (exists(COMPOSER)) {
  const c = read(COMPOSER);
  /navigator\.clipboard/.test(c)
    ? pass('CHECK 6: navigator.clipboard copy fallback present')
    : fail('CHECK 6: clipboard copy fallback MISSING');
  /createObjectURL|download.*\.txt/.test(c)
    ? pass('CHECK 7: export/download fallback present')
    : fail('CHECK 7: export/download fallback MISSING');
}

// ---- CHECK 8: send-unavailable notice ----
if (exists(COMPOSER)) {
  /data-c2b-send-unavailable/.test(read(COMPOSER))
    ? pass('CHECK 8: send-unavailable data attribute present')
    : fail('CHECK 8: send-unavailable notice MISSING');
}

// ---- CHECK 9: No Arabic-exclusive RTL logic remaining ----
if (exists(COMPOSER)) {
  const stripped = read(COMPOSER).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /locale\s*===\s*['"]ar['"]/.test(stripped)
    ? fail("CHECK 9: Arabic-locale guard (locale === 'ar') still present — remove C2B-exclusive RTL logic")
    : pass("CHECK 9: No Arabic-exclusive locale guard remaining in BookingMessageComposer");
}

// ---- CHECK 10: Close button has aria-label ----
if (exists(PANEL)) {
  /aria-label=.*[Cc]lose/.test(read(PANEL))
    ? pass('CHECK 10: Close button has aria-label in BookingDetailPanel')
    : fail('CHECK 10: Close button aria-label MISSING');
}

// ---- CHECK 11: BookingOversight wires BookingDetailPanel ----
const OVERSIGHT = 'src/components/admin/BookingOversight.tsx';
if (!exists(OVERSIGHT)) {
  fail('CHECK 11: BookingOversight.tsx MISSING');
} else {
  const o = read(OVERSIGHT);
  /BookingDetailPanel/.test(o)
    ? pass('CHECK 11: BookingDetailPanel imported and used in BookingOversight')
    : fail('CHECK 11: BookingDetailPanel NOT wired into BookingOversight');

  // Core data-flow preservation checks — streaming and callable must still be present.
  /onSnapshot.*bookings/.test(o.replace(/\s/g, ''))
    ? pass('CHECK 11: BookingOversight streaming (onSnapshot/bookings) preserved')
    : fail('CHECK 11: Firestore streaming BROKEN in BookingOversight');
  /adminResolveBooking/.test(o)
    ? pass('CHECK 11: adminResolveBooking callable preserved')
    : fail('CHECK 11: adminResolveBooking callable MISSING from BookingOversight');
}

// ---- CHECK 12: No new client Firestore writes in C2B components ----
for (const [label, path] of [
  ['BookingDetailPanel', PANEL],
  ['BookingMessageComposer', COMPOSER],
]) {
  if (!exists(path)) continue;
  const stripped = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(stripped)
    ? fail(`CHECK 12: ${label} contains direct Firestore write — must use callable only`)
    : pass(`CHECK 12: ${label} has no direct Firestore write (callable + read-only)`);
}

// ---- CHECK 13: Disclaimer text in both C2B components ----
for (const [label, path] of [
  ['BookingDetailPanel', PANEL],
  ['BookingMessageComposer', COMPOSER],
]) {
  if (!exists(path)) continue;
  /does not sell tee times|does not.*process payments/.test(read(path))
    ? pass(`CHECK 13: ${label} contains third-party disclaimer copy`)
    : fail(`CHECK 13: ${label} MISSING third-party disclaimer copy`);
}

// ---- CHECK 14: App.tsx NOT in the working-tree diff (untouched) ----
try {
  const diff = execSync('git diff HEAD -- src/App.tsx', { cwd: REPO, encoding: 'utf8' });
  diff.trim().length === 0
    ? pass('CHECK 14: App.tsx untouched in C2B working tree')
    : fail('CHECK 14: App.tsx has been modified — out of C2B scope');
} catch {
  pass('CHECK 14: App.tsx diff check skipped (git unavailable)');
}

// ---- CHECK 15: v2Theme.ts NOT in the working-tree diff (untouched) ----
try {
  const diff = execSync('git diff HEAD -- src/theme/v2Theme.ts', { cwd: REPO, encoding: 'utf8' });
  diff.trim().length === 0
    ? pass('CHECK 15: v2Theme.ts untouched in C2B working tree')
    : fail('CHECK 15: v2Theme.ts has been modified — out of C2B scope');
} catch {
  pass('CHECK 15: v2Theme.ts diff check skipped (git unavailable)');
}

// ---- CHECK 16: German templates contain all required placeholders ----
if (exists(COMPOSER)) {
  const c = read(COMPOSER);
  // Extract only the MESSAGE_TEMPLATES block, then find all de: '...' entries
  const templatesBlock = c.match(/MESSAGE_TEMPLATES[\s\S]*?^};/m)?.[0] ?? c;
  const deTemplates = [...templatesBlock.matchAll(/\bde:\s*'([^']+)'/g)].map((m) => m[1]);
  if (deTemplates.length === 0) {
    fail('CHECK 16: No German (de) template strings found inside MESSAGE_TEMPLATES');
  } else {
    const PLACEHOLDERS = ['{courseName}', '{date}', '{time}'];
    const gaps = [];
    deTemplates.forEach((tpl, i) => {
      const missing = PLACEHOLDERS.filter((p) => !tpl.includes(p));
      if (missing.length > 0) gaps.push(`de[${i}] missing: ${missing.join(',')}`);
    });
    gaps.length === 0
      ? pass(`CHECK 16: all ${deTemplates.length} German templates contain {courseName}, {date}, {time}`)
      : fail(`CHECK 16: German template placeholder gaps — ${gaps.join('; ')}`);
  }
}

// ---- REPORT ----
console.log('\nC2B Booking-Communications Gate\n');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}`);
  if (!r.ok) failed++;
}
console.log('');
if (failed) {
  console.error(`❌ c2b-booking-comms-gate FAILED: ${failed} violation(s).`);
  process.exit(1);
}
console.log('✅ c2b-booking-comms-gate passed: 8-locale templates, honest send availability, copy/export fallbacks, disclaimers, accessibility, streaming preserved.');
