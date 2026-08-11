// ==========================================
// FILE: scripts/client-callable-gate.mjs  (run: `npm run gate:clientcallable`)
// Repository-wide client-to-callable guard. Walks the REACHABLE import graph from
// the app entry (src/main.tsx) and FAILS if any reachable V2 surface imports or
// invokes one of the quarantined/unresolved Cloud Functions. Unimported reference
// files (preserved history) are correctly ignored — only reachable code counts.
// Static analysis only: no network, no emulator, no provider, no deploy.
// See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'src');
const ENTRY = resolve(SRC, 'main.tsx');

const QUARANTINED = [
  'resolveEscrow', 'adminOverrideUser', 'adminManagePartner', 'logPlatformExpense',
  'resolvePhotoValidation', 'updateFulfillmentOrder', 'drawRaffleWinner',
  'manageTournamentOps', 'checkInFlight',
];
// Console components whose sole purpose was a quarantined/unresolved callable; these
// must NOT appear in the reachable graph (they were unmounted). CourseTeeSheet is
// deliberately NOT here — it stays reachable with checkInFlight surgically removed.
const FORBIDDEN_COMPONENTS = [
  'EscrowWatchtower', 'ManualOverride', 'FiatLedger', 'PhotoValidator',
  'CentralBankMonitor', 'OrderFulfillmentHub', 'B2BPartners', 'RaffleEngine',
  'TournamentManager',
];

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // package import — ignore
  const base = resolve(dirname(fromFile), spec);
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => resolve(base, 'index' + e))];
  // A `.js` specifier may map to a real `.ts`/`.tsx` (NodeNext rewrite).
  if (/\.js$/.test(base)) { const stem = base.replace(/\.js$/, ''); cands.push(stem + '.ts', stem + '.tsx'); }
  return cands.find((c) => existsSync(c)) || null;
}

const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNIMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

// BFS the reachable graph.
const reachable = new Set();
const queue = [ENTRY];
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file) || !existsSync(file)) continue;
  reachable.add(file);
  const text = readFileSync(file, 'utf8');
  for (const re of [IMPORT_RE, DYNIMPORT_RE]) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) { const r = resolveSpec(file, m[1]); if (r) queue.push(r); }
  }
}

const fails = [];
const assert = (cond, msg) => { if (!cond) { fails.push(msg); console.error(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

const callableRe = new RegExp(`httpsCallable\\s*\\([^,]*,\\s*['"](${QUARANTINED.join('|')})['"]`);
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

// 1. No reachable file invokes a quarantined callable.
const offenders = [];
for (const file of reachable) {
  const text = readFileSync(file, 'utf8');
  const m = text.match(callableRe);
  if (m) offenders.push(`${rel(file)} → httpsCallable('${m[1]}')`);
}
assert(offenders.length === 0, `no reachable surface invokes a quarantined/unresolved callable${offenders.length ? ' — ' + offenders.join('; ') : ''}`);

// 2. Forbidden console components are unreachable.
for (const comp of FORBIDDEN_COMPONENTS) {
  const hit = [...reachable].find((f) => new RegExp(`[\\\\/]${comp}\\.(tsx|ts|jsx|js)$`).test(f));
  assert(!hit, `quarantined console '${comp}' is unreachable from navigation`);
}

// 3. Approved journey surfaces remain reachable (regression guard).
const APPROVED = ['TeeTimeInventory', 'CourseAvailability', 'BookingRequests', 'BookingOversight', 'BookingAudit', 'HRManagement', 'CourseTeeSheet'];
for (const comp of APPROVED) {
  const hit = [...reachable].find((f) => new RegExp(`[\\\\/]${comp}\\.(tsx|ts|jsx|js)$`).test(f));
  assert(!!hit, `approved journey surface '${comp}' remains reachable`);
}

console.log(`\n  (reachable modules from entry: ${reachable.size})`);
if (fails.length) {
  console.error(`\n❌ client-callable gate FAILED (${fails.length}). A reachable V2 surface reaches a quarantined callable/console.`);
  process.exit(1);
}
console.log(`✅ client-callable gate passed: no reachable surface invokes any of the ${QUARANTINED.length} quarantined callables; ${FORBIDDEN_COMPONENTS.length} prohibited consoles unreachable; approved journeys intact.`);
