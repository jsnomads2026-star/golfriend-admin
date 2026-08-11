// ==========================================
// FILE: scripts/dead-route-gate.mjs
// Fail-closed static gate (run: `npm run gate:dead-route`).
// Prevents accidental restoration of QUARANTINED components / dead routes and of
// superseded-branch behavior. Fails (exit 1) if a quarantined component gets
// re-imported/re-rendered, or if its decommission guard is removed.
// ==========================================
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(ROOT + p, 'utf8');

// Strip comments so "restoration" checks look at real code, not prose/markers.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const violations = [];
function fail(msg) { violations.push(msg); }

// ---- 1. Quarantined components must NOT be imported or rendered in App.tsx ----
const appCode = stripComments(read('src/App.tsx'));
for (const q of ['SponsorOnboardingWizard', 'LedgerWatchtower']) {
  if (new RegExp(`import\\s+${q}\\b`).test(appCode)) fail(`App.tsx re-imports quarantined component ${q}.`);
  if (new RegExp(`<\\s*${q}\\b`).test(appCode)) fail(`App.tsx renders quarantined component ${q}.`);
}

// ---- 2. Quarantine guards must remain (decommission early-return intact) ----
const sponsor = read('src/components/admin/sponsors/SponsorOnboardingWizard.tsx');
if (!/QUARANTINED[\s\S]{0,600}?return;/.test(sponsor)) {
  fail('SponsorOnboardingWizard.executeCheckout quarantine early-return is missing.');
}
const ledger = read('src/components/admin/LedgerWatchtower.tsx');
const ledgerGuards = (ledger.match(/QUARANTINED[\s\S]{0,600}?return;/g) || []).length;
if (ledgerGuards < 2) {
  fail(`LedgerWatchtower must keep both decommission guards (found ${ledgerGuards}/2).`);
}

// ---- 3. Superseded-branch behavior must not reappear: booking stays non-financial ----
// (Defense-in-depth alongside gate:authority / verify:booking — booking price is
// the single clearest superseded behavior.)
const bookingComponents = [
  'src/components/admin/TeeTimeInventory.tsx',
  'src/components/B2B/CourseAvailability.tsx',
  'src/components/B2B/BookingRequests.tsx',
  'src/components/admin/BookingOversight.tsx',
  'src/components/public/BookingHandoff.tsx',
];
for (const f of bookingComponents) {
  if (/priceChips/.test(stripComments(read(f)))) fail(`${f} re-introduced priceChips (superseded financial booking).`);
}

if (violations.length) {
  console.error('❌ DEAD-ROUTE GATE FAILED:');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
console.log('✅ Dead-route gate passed: quarantined components stay unrouted + guarded; no superseded financial booking restored.');
