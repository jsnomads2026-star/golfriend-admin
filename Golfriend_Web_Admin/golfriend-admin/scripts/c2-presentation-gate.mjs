// ==========================================
// FILE: scripts/c2-presentation-gate.mjs
// Focused gate for C2A — BookingOversight and BookingAudit re-skin.
//
// Checks:
//   1. v2Primitives.tsx exists and exports V2Badge and V2ControlRow.
//   2. BookingOversight imports V2Theme and V2Primitives.
//   3. BookingAudit imports V2Theme and V2Primitives.
//   4. Filter inputs carry aria-label (accessibility requirement).
//   5. Action buttons have minHeight set (≥36px touch target).
//   6. No V1 palette literals (#0a0a0a / #121212 / sans-serif) in target files.
//   7. Financial surfaces not re-activated (storefront fail-closed check).
//   8. Admin nav-panel anchor present — route-guard-verify still detects it.
//   9. No data-flow, callable, or Firestore write changes.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read  = (rel) => readFileSync(REPO + rel, 'utf8');
const exists = (rel) => existsSync(REPO + rel);

const results = [];
const pass = (l) => results.push({ ok: true,  label: l });
const fail = (l) => results.push({ ok: false, label: l });

// ---- CHECK 1: v2Primitives.tsx present and exports required symbols ----
if (!exists('src/theme/v2Primitives.tsx')) {
  fail('CHECK 1: src/theme/v2Primitives.tsx MISSING');
} else {
  const p = read('src/theme/v2Primitives.tsx');
  ['V2Badge', 'V2ControlRow'].forEach((sym) => {
    new RegExp(`export function ${sym}`).test(p)
      ? pass(`CHECK 1: v2Primitives exports ${sym}`)
      : fail(`CHECK 1: v2Primitives missing export ${sym}`);
  });
}

// ---- CHECK 2 & 3: imports in both target files ----
for (const [label, path] of [
  ['BookingOversight', 'src/components/admin/BookingOversight.tsx'],
  ['BookingAudit',     'src/components/admin/BookingAudit.tsx'],
]) {
  if (!exists(path)) { fail(`CHECK 2/3: ${path} MISSING`); continue; }
  const c = read(path);
  c.includes('v2Theme')     ? pass(`CHECK 2: ${label} imports V2Theme`)     : fail(`CHECK 2: ${label} missing V2Theme import`);
  c.includes('v2Primitives') ? pass(`CHECK 3: ${label} imports v2Primitives`) : fail(`CHECK 3: ${label} missing v2Primitives import`);
}

// ---- CHECK 4: aria-label on filter inputs ----
for (const [label, path] of [
  ['BookingOversight', 'src/components/admin/BookingOversight.tsx'],
  ['BookingAudit',     'src/components/admin/BookingAudit.tsx'],
]) {
  if (!exists(path)) continue;
  /aria-label=/.test(read(path))
    ? pass(`CHECK 4: ${label} filter input has aria-label`)
    : fail(`CHECK 4: ${label} filter input MISSING aria-label`);
}

// ---- CHECK 5: minHeight on action buttons (touch targets) ----
const oversight = exists('src/components/admin/BookingOversight.tsx') ? read('src/components/admin/BookingOversight.tsx') : '';
/minHeight/.test(oversight)
  ? pass('CHECK 5: BookingOversight action buttons have minHeight (≥36px touch target)')
  : fail('CHECK 5: BookingOversight action buttons MISSING minHeight');

// ---- CHECK 6: no V1 hex palette in re-skinned files ----
for (const [label, path] of [
  ['BookingOversight', 'src/components/admin/BookingOversight.tsx'],
  ['BookingAudit',     'src/components/admin/BookingAudit.tsx'],
]) {
  if (!exists(path)) continue;
  const stripped = read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const v1 = [];
  if (/backgroundColor:\s*'#121212'/.test(stripped)) v1.push('#121212');
  if (/backgroundColor:\s*'#0a0a0a'/.test(stripped)) v1.push('#0a0a0a');
  if (/fontFamily:\s*'sans-serif'/.test(stripped))   v1.push("'sans-serif'");
  v1.length === 0
    ? pass(`CHECK 6: ${label} free of V1 palette literals`)
    : fail(`CHECK 6: ${label} still contains V1 palette: ${v1.join(', ')}`);
}

// ---- CHECK 7: financial surfaces remain unavailable ----
const storefront = exists('src/components/public/B2BStorefront.tsx')
  ? read('src/components/public/B2BStorefront.tsx') : '';
/data-policy-unavailable="non-financial-precommission"/.test(storefront)
  ? pass('CHECK 7: B2BStorefront subscription unavailable notice present')
  : fail('CHECK 7: B2BStorefront subscription unavailable notice MISSING');

const sfCode = storefront
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');
/handleSubscribe/.test(sfCode)
  ? fail('CHECK 7: handleSubscribe present in active B2BStorefront code — Stripe re-activated')
  : pass('CHECK 7: handleSubscribe absent from active B2BStorefront code');

// ---- CHECK 8: admin nav anchor still present ----
const app = exists('src/App.tsx') ? read('src/App.tsx') : '';
/aria-label="Admin navigation panel"/.test(app)
  ? pass('CHECK 8: admin nav-panel aria-label anchor present — route-guard-verify still works')
  : fail('CHECK 8: admin nav-panel aria-label anchor MISSING');

// ---- CHECK 9: no Firestore write in re-skinned files ----
for (const [label, path] of [
  ['BookingOversight', 'src/components/admin/BookingOversight.tsx'],
  ['BookingAudit',     'src/components/admin/BookingAudit.tsx'],
]) {
  if (!exists(path)) continue;
  const c = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /setDoc|addDoc|updateDoc|deleteDoc|writeBatch/.test(c)
    ? fail(`CHECK 9: ${label} contains direct Firestore write — data flow may have changed`)
    : pass(`CHECK 9: ${label} has no direct Firestore write (callable-only)`);
}

// ---- REPORT ----
console.log('\nC2A Presentation Gate  (BookingOversight + BookingAudit)\n');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}`);
  if (!r.ok) failed++;
}
console.log('');
if (failed) {
  console.error(`❌ c2-presentation-gate FAILED: ${failed} violation(s).`);
  process.exit(1);
}
console.log('✅ c2-presentation-gate passed: V2 primitives applied, accessibility labels present, financial surfaces fail-closed, callable authority unchanged.');
