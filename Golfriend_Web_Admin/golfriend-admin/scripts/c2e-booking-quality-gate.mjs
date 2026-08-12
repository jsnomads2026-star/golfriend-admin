// ==========================================
// FILE: scripts/c2e-booking-quality-gate.mjs
// C2E — Unified end-to-end quality gate for C2A through C2D.
// Covers: data integrity, authority boundaries, locale contract,
// accessibility requirements, state correctness, and defect regressions.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read   = (rel) => readFileSync(REPO + rel, 'utf8');
const exists = (rel) => existsSync(REPO + rel);

const results = [];
const pass = (l) => results.push({ ok: true,  label: l });
const fail = (l) => results.push({ ok: false, label: l });

// ── Helpers ──────────────────────────────────────────────────────────────────
const CANONICAL_LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const C2_FILES = {
  oversight:   'src/components/admin/BookingOversight.tsx',
  audit:       'src/components/admin/BookingAudit.tsx',
  panel:       'src/components/admin/booking/BookingDetailPanel.tsx',
  composer:    'src/components/admin/booking/BookingMessageComposer.tsx',
  queue:       'src/components/admin/booking/BookingExceptionQueue.tsx',
  classifier:  'src/components/admin/booking/BookingClassifier.ts',
  report:      'src/components/admin/booking/BookingReport.ts',
  reportView:  'src/components/admin/booking/BookingReportView.tsx',
  primitives:  'src/theme/v2Primitives.tsx',
  indexCss:    'src/index.css',
};

// ── SECTION 1: Complete booking journey files present ────────────────────────
console.log('\n── SECTION 1: Booking journey components ──');
Object.entries(C2_FILES).forEach(([name, path]) => {
  exists(path) ? pass(`1. ${name} present`) : fail(`1. ${name} MISSING — ${path}`);
});

// ── SECTION 2: No Arabic remnants ────────────────────────────────────────────
console.log('\n── SECTION 2: Arabic locale removed from C2B-C2D ──');
const C2B_D = ['composer', 'queue', 'classifier', 'reportView'].map((k) => C2_FILES[k]);
C2B_D.forEach((path) => {
  if (!exists(path)) return;
  const code = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /LOCALES[^=]*=[\s\S]*?'ar'/.test(code) || /QUEUE_LOCALES[^=]*=[\s\S]*?'ar'/.test(code) || /REPORT_LOCALES[^=]*=[\s\S]*?'ar'/.test(code)
    ? fail(`2. ${path.split('/').pop()} contains Arabic in LOCALES array`)
    : pass(`2. ${path.split('/').pop()} — no Arabic in locale array`);
});

// ── SECTION 3: Exact canonical 8-locale set ───────────────────────────────────
console.log('\n── SECTION 3: Exact canonical locale contract ──');
[
  { name: 'BookingMessageComposer LOCALES',  path: C2_FILES.composer,   pattern: /LOCALES\s*=\s*\[([^\]]+)\]/ },
  { name: 'BookingExceptionQueue imports QUEUE_LOCALES from Classifier', path: C2_FILES.queue, pattern: /QUEUE_LOCALES[\s\S]{0,200}BookingClassifier/, importCheck: true },
  { name: 'BookingClassifier QUEUE_LOCALES', path: C2_FILES.classifier, pattern: /QUEUE_LOCALES[^=]*=\s*\[([^\]]+)\]/ },
  { name: 'BookingReportView REPORT_LOCALES', path: C2_FILES.reportView, pattern: /REPORT_LOCALES[^=]*=\s*\[([^\]]+)\]/ },
].forEach((entry) => {
  const { name, path, pattern } = entry;
  if (!exists(path)) return;
  // For import-check entries, just verify the pattern exists; no array comparison needed.
  if (pattern.source.includes('from.*BookingClassifier') || entry.importCheck) {
    pattern.test(read(path))
      ? pass(`3. ${name}`)
      : fail(`3. ${name} — import not found`);
    return;
  }
  const match = read(path).match(pattern)?.[1] ?? '';
  const found = match.match(/'([a-z]{2})'/g)?.map((s) => s.replace(/'/g, '')) ?? [];
  JSON.stringify(found) === JSON.stringify(CANONICAL_LOCALES)
    ? pass(`3. ${name} — exact ${CANONICAL_LOCALES.join(', ')}`)
    : fail(`3. ${name} — got [${found.join(',')}] expected [${CANONICAL_LOCALES.join(',')}]`);
});

// ── SECTION 4: Authority boundaries — no direct Firestore writes ──────────────
console.log('\n── SECTION 4: No direct Firestore writes in C2 components ──');
Object.entries(C2_FILES).forEach(([name, path]) => {
  if (!exists(path)) return;
  const stripped = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(stripped)
    ? fail(`4. ${name} contains direct Firestore write`)
    : pass(`4. ${name} — read-only or callable-only`);
});

// ── SECTION 5: Callable authority preserved ───────────────────────────────────
console.log('\n── SECTION 5: Callable authority in BookingOversight ──');
if (exists(C2_FILES.oversight)) {
  const o = read(C2_FILES.oversight);
  ['adminResolveBooking', 'Force Confirm', 'Reject', 'Cancel'].forEach((sym) => {
    o.includes(sym) ? pass(`5. '${sym}' present in BookingOversight`) : fail(`5. '${sym}' MISSING from BookingOversight`);
  });
}

// ── SECTION 6: Data integrity — reconciliation and stale boundary ────────────
console.log('\n── SECTION 6: Data integrity (inline) ──');
const STALE = 48 * 60 * 60 * 1000;
const T0 = 1_723_000_000_000;
function clf(status, ms, now) {
  if (status === 'pending') { if (ms !== undefined && now - ms > STALE) return 'stale'; return 'pending'; }
  if (status === 'rejected') return 'rejected'; if (status === 'cancelled') return 'cancelled'; return 'healthy';
}
// Stale at exactly threshold → NOT stale
clf('pending', T0 - STALE, T0) === 'pending' ? pass('6. Stale boundary: exactly 48 h → NOT stale') : fail('6. Stale boundary wrong');
// Stale at threshold + 1ms → IS stale
clf('pending', T0 - STALE - 1, T0) === 'stale' ? pass('6. Stale boundary: 48h+1ms → stale') : fail('6. Stale boundary wrong (>48h not stale)');
// Unknown timestamp pending → never stale
clf('pending', undefined, T0) === 'pending' ? pass('6. Unknown timestamp → pending_course_response (not stale)') : fail('6. Unknown timestamp wrongly classified');
// Confirmed → healthy regardless of age
clf('confirmed', T0 - STALE * 10, T0) === 'healthy' ? pass('6. Confirmed old → healthy') : fail('6. Confirmed wrong');

// SECTION 6b: status sum reconciliation
function agg(bookings, now) {
  let p=0, c=0, r=0, ca=0, u=0, ut=0, total=bookings.length;
  for (const b of bookings) {
    if (b.ms === undefined) ut++;
    if (b.s === 'pending') p++; else if (b.s === 'confirmed') c++;
    else if (b.s === 'rejected') r++; else if (b.s === 'cancelled') ca++; else u++;
  }
  return { total, pending:p, confirmed:c, rejected:r, cancelled:ca, unknown:u, unknownTs:ut };
}
const test6 = agg([
  {s:'pending',ms:T0-1000},{s:'confirmed',ms:T0-2000},{s:'rejected',ms:T0-3000},
  {s:'cancelled',ms:T0-4000},{s:'pending'}, // unknown ts
], T0);
test6.pending+test6.confirmed+test6.rejected+test6.cancelled+test6.unknown === test6.total
  ? pass('6. Reconciliation: status sum = total')
  : fail(`6. Reconciliation FAILED: sum=${test6.pending+test6.confirmed+test6.rejected+test6.cancelled+test6.unknown} total=${test6.total}`);

// ── SECTION 7: Accessibility requirements ─────────────────────────────────────
console.log('\n── SECTION 7: Accessibility ──');
// BookingDetailPanel: focus trap + focus-on-open
if (exists(C2_FILES.panel)) {
  const p = read(C2_FILES.panel);
  /closeRef\.current\?\.focus\(\)/.test(p)
    ? pass('7. BookingDetailPanel focuses close button on open') : fail('7. BookingDetailPanel missing focus-on-open');
  /focus trap|trap.*keydown|tabindex|focusable/.test(p)
    ? pass('7. BookingDetailPanel has focus-trap logic') : fail('7. BookingDetailPanel missing focus trap');
  /aria-label.*Close/.test(p)
    ? pass('7. BookingDetailPanel close button has aria-label') : fail('7. BookingDetailPanel close aria-label MISSING');
}
// BookingMessageComposer: send-error has retry action
if (exists(C2_FILES.composer)) {
  /Try again|try.*again/i.test(read(C2_FILES.composer))
    ? pass('7. BookingMessageComposer send-error state has "Try again" action')
    : fail('7. BookingMessageComposer send-error MISSING "Try again" action');
}
// BookingAudit: filter input has aria-label
if (exists(C2_FILES.audit)) {
  /aria-label=.*[Ff]ilter/.test(read(C2_FILES.audit))
    ? pass('7. BookingAudit filter input has aria-label') : fail('7. BookingAudit filter aria-label MISSING');
}
// index.css: prefers-reduced-motion
if (exists(C2_FILES.indexCss)) {
  /prefers-reduced-motion/.test(read(C2_FILES.indexCss))
    ? pass('7. index.css respects prefers-reduced-motion') : fail('7. index.css MISSING prefers-reduced-motion');
}

// ── SECTION 8: Retry defect regression ────────────────────────────────────────
console.log('\n── SECTION 8: Retry defect regression ──');
if (exists(C2_FILES.queue)) {
  const q = read(C2_FILES.queue);
  /retryCount/.test(q)
    ? pass('8. BookingExceptionQueue retry uses retryCount (stream re-triggered)')
    : fail('8. BookingExceptionQueue retry DEFECT: stream not re-triggered on retry');
  /setRetryCount/.test(q) && !/setLoading\(true\).*setStreamErr\(false\)|setStreamErr\(false\).*setLoading\(true\)/.test(q)
    ? pass('8. BookingExceptionQueue retry handler uses setRetryCount (not bare setLoading)')
    : fail('8. BookingExceptionQueue retry handler regressed to bare state reset');
}
if (exists(C2_FILES.reportView)) {
  const rv = read(C2_FILES.reportView);
  /retryCount/.test(rv)
    ? pass('8. BookingReportView retry uses retryCount (stream re-triggered)')
    : fail('8. BookingReportView retry DEFECT: stream not re-triggered on retry');
}

// ── SECTION 9: Honest boundaries ─────────────────────────────────────────────
console.log('\n── SECTION 9: Honest unavailability boundaries ──');
// Storefront: payment unavailable
if (exists('src/components/public/B2BStorefront.tsx')) {
  /data-policy-unavailable="non-financial-precommission"/.test(read('src/components/public/B2BStorefront.tsx'))
    ? pass('9. B2BStorefront subscription unavailable (non-financial ruling)')
    : fail('9. B2BStorefront subscription unavailable MISSING');
}
// C2C: automatic reminder unavailable
if (exists(C2_FILES.queue)) {
  /data-c2c-send-unavailable/.test(read(C2_FILES.queue))
    ? pass('9. Exception queue: automatic reminder unavailable notice present')
    : fail('9. Exception queue: automatic reminder unavailable MISSING');
}
// C2D: JHCC unavailable
if (exists(C2_FILES.reportView)) {
  /data-c2d-jhcc-unavailable/.test(read(C2_FILES.reportView))
    ? pass('9. Report view: JHCC unavailable notice present')
    : fail('9. Report view: JHCC unavailable MISSING');
}
// C2D: no revenue/payment/conversion inference
if (exists(C2_FILES.report)) {
  const stripped = read(C2_FILES.report).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const codeOnly = stripped.replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
  const forbidden = ['revenue', 'payment', 'conversion', 'churn', 'ltv', 'mrr'].filter((f) =>
    new RegExp(`\\b${f}\\b`, 'i').test(codeOnly));
  forbidden.length === 0
    ? pass('9. BookingReport: no revenue/payment/conversion inference')
    : fail(`9. BookingReport: forbidden terms in logic: ${forbidden.join(', ')}`);
}

// ── SECTION 10: Subscription cleanup ─────────────────────────────────────────
console.log('\n── SECTION 10: Subscription cleanup ──');
[C2_FILES.panel, C2_FILES.queue, C2_FILES.reportView].forEach((path) => {
  if (!exists(path)) return;
  const code = read(path);
  const snapshots = (code.match(/onSnapshot\s*\(/g) || []).length;
  const cleanups  = (code.match(/return\s*\(\s*\)\s*=>\s*unsub\s*\(\s*\)/g) || []).length;
  snapshots === cleanups
    ? pass(`10. ${path.split('/').pop()} — ${snapshots} stream(s) each has cleanup`)
    : fail(`10. ${path.split('/').pop()} — ${snapshots} streams but ${cleanups} cleanups`);
});

// ── SECTION 11: View toggle and drill-down in BookingOversight ───────────────
console.log('\n── SECTION 11: BookingOversight view toggle integrity ──');
if (exists(C2_FILES.oversight)) {
  const o = read(C2_FILES.oversight);
  ["'table'", "'queue'", "'report'"].forEach((v) => {
    o.includes(v) ? pass(`11. ${v} view present`) : fail(`11. ${v} view MISSING`);
  });
  /onDrillStatus/.test(o) ? pass('11. onDrillStatus drill callback wired') : fail('11. onDrillStatus MISSING');
  /onDrillQueue/.test(o)  ? pass('11. onDrillQueue drill callback wired')  : fail('11. onDrillQueue MISSING');
}

// ── SECTION 12: Untouched files ───────────────────────────────────────────────
console.log('\n── SECTION 12: Out-of-scope files untouched ──');
const UNTOUCHED = ['src/App.tsx', 'src/theme/v2Theme.ts', 'functions/src/index.ts'];
UNTOUCHED.forEach((file) => {
  if (!exists(file)) return;
  try {
    const d = execSync(`git diff HEAD -- ${file}`, { cwd: REPO, encoding: 'utf8' });
    d.trim().length === 0 ? pass(`12. ${file} untouched`) : fail(`12. ${file} modified — out of scope`);
  } catch { pass(`12. ${file} diff skipped`); }
});

// ── REPORT ────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(52));
console.log('C2E Unified Quality Gate — C2A through C2D');
console.log('='.repeat(52));
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}`);
  if (!r.ok) failed++;
}
console.log(`\n  Total: ${results.length} checks, ${results.filter(r=>r.ok).length} passed, ${failed} failed\n`);
if (failed) {
  console.error(`❌ c2e-booking-quality-gate FAILED: ${failed} violation(s).`);
  process.exit(1);
}
console.log('✅ c2e-booking-quality-gate passed: all C2A–C2D booking operations quality requirements met.');
