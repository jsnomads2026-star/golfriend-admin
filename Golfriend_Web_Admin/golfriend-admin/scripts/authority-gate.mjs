// ==========================================
// FILE: scripts/authority-gate.mjs
// Fail-closed static source gate (run: `npm run gate:authority`).
// Scans the Admin/Portal client source for WRITES to authoritative collections
// or authoritative fields. Any match OUTSIDE the quarantined-dead-code allowlist
// fails the build (exit 1). Proves clients never finalize authoritative state.
// ==========================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Collections whose writes must be server-owned (see AUTHORITY_MANIFEST.md).
const AUTH_COLLECTIONS = [
  'users', 'transactions', 'b2b_partners', 'admin_users', 'tee_time_slots',
  'bookings', 'course_operators', 'enterprise_staff', 'moderation_incidents',
  'blacklist', 'games', 'fulfillment_orders',
];
// Authoritative fields that must never be client-written via increment/assignment.
const AUTH_FIELDS = ['chips', 'reliability_score', 'tier', 'priceChips'];

// Quarantined dead code (unrouted; write handlers decommissioned via early return).
const ALLOWLIST = [
  'components/admin/LedgerWatchtower.tsx',
  'components/admin/sponsors/SponsorOnboardingWizard.tsx',
];

const writeToAuthColl = new RegExp(
  `(updateDoc|setDoc|addDoc|deleteDoc)\\(\\s*(doc|collection)\\(\\s*db\\s*,\\s*['"](${AUTH_COLLECTIONS.join('|')})['"]`,
);
const incrementAuthField = new RegExp(`(${AUTH_FIELDS.join('|')})\\s*:\\s*increment\\(`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const SRC_FWD = SRC.replace(/\\/g, '/');
const violations = [];
for (const file of walk(SRC)) {
  const norm = file.replace(/\\/g, '/');
  const rel = norm.startsWith(SRC_FWD + '/') ? norm.slice(SRC_FWD.length + 1) : norm;
  if (ALLOWLIST.includes(rel)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (writeToAuthColl.test(line) || incrementAuthField.test(line)) {
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error('❌ AUTHORITY GATE FAILED — client writes to authoritative state found:');
  for (const v of violations) console.error('  ' + v);
  console.error(`\n${violations.length} violation(s). Route these through a Cloud Function (see AUTHORITY_MANIFEST.md).`);
  process.exit(1);
}
console.log(`✅ Authority gate passed: no client authoritative writes across ${AUTH_COLLECTIONS.length} collections (allowlist: ${ALLOWLIST.length} quarantined files).`);
