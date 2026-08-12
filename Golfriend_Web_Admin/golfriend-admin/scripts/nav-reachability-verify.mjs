// ==========================================
// FILE: scripts/nav-reachability-verify.mjs  (run: `npm run verify:nav`)
// Route/navigation tests for the client-surface authority reconciliation.
// Proves, at the navigation-mount level, that every quarantined/unresolved console
// tab renders the honest PolicyUnavailable state (never the prohibited console),
// and that approved non-financial booking / availability / operator / enterprise /
// moderation / role journeys remain mounted. Static source assertions; no runtime.
// See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
// ==========================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const read = (p) => readFileSync(resolve(SRC, p), 'utf8');

const fails = [];
const assert = (cond, msg) => { if (!cond) { fails.push(msg); console.error(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

const App = read('App.tsx');
const Ent = read('components/B2B/EnterpriseDashboard.tsx');
const SB = read('components/B2B/SmallBusinessDashboard.tsx');
const Tee = read('components/B2B/CourseTeeSheet.tsx');

// Quarantined/unresolved consoles must NOT be JSX-mounted in any nav file.
const FORBIDDEN_MOUNTS = ['EscrowWatchtower', 'ManualOverride', 'FiatLedger', 'PhotoValidator', 'CentralBankMonitor', 'OrderFulfillmentHub', 'B2BPartners', 'RaffleEngine', 'TournamentManager'];
for (const [name, txt] of [['App', App], ['EnterpriseDashboard', Ent], ['SmallBusinessDashboard', SB]]) {
  for (const comp of FORBIDDEN_MOUNTS) {
    assert(!new RegExp(`<${comp}[\\s/>]`).test(txt), `${name}: no <${comp}> mounted`);
  }
}

// Each quarantined/unresolved admin tab renders PolicyUnavailable.
const ADMIN_UNAVAILABLE_TABS = ['photos', 'escrow', 'fiat', 'ledger', 'bank', 'tournaments', 'fulfillment', 'b2b'];
for (const tab of ADMIN_UNAVAILABLE_TABS) {
  const re = new RegExp(`activeTab === '${tab}' && <PolicyUnavailable`);
  assert(re.test(App), `App: '${tab}' tab renders PolicyUnavailable`);
}
// Enterprise + Small-Business tournament/raffle tabs render PolicyUnavailable.
assert(/activeTab === 'tournaments' && <PolicyUnavailable/.test(Ent), `EnterpriseDashboard: 'tournaments' renders PolicyUnavailable`);
assert(/activeTab === 'raffle' && <PolicyUnavailable/.test(Ent), `EnterpriseDashboard: 'raffle' renders PolicyUnavailable`);
assert(/activeTab === 'tournaments' && <PolicyUnavailable/.test(SB), `SmallBusinessDashboard: 'tournaments' renders PolicyUnavailable`);

// Approved journeys remain mounted (regression guard).
const APPROVED_APP_MOUNTS = [
  ["teetimes", 'TeeTimeInventory'], ['coursesync', 'CourseSyncConsole'], ['teesheet', 'CourseTeeSheet'],
  ['bookingoversight', 'BookingOversight'], ['bookingaudit', 'BookingAudit'], ['hr', 'HRManagement'],
  ['support', 'SupportModerationHub'],
];
for (const [tab, comp] of APPROVED_APP_MOUNTS) {
  assert(new RegExp(`activeTab === '${tab}' && <${comp}`).test(App), `App: approved '${tab}' still mounts <${comp}>`);
}
// Enterprise/SB approved surfaces preserved.
assert(/activeTab === 'teesheet' && <CourseTeeSheet/.test(Ent), `EnterpriseDashboard: approved 'teesheet' preserved`);
assert(/CourseAvailability/.test(SB), `SmallBusinessDashboard: approved availability surface preserved`);

// The approved flight sheet stays, but its check-in control no longer calls the callable.
assert(!/httpsCallable\([^,]*,\s*['"]checkInFlight['"]/.test(Tee), `CourseTeeSheet: no checkInFlight invocation remains`);
assert(/reportPlayerIncident/.test(Tee), `CourseTeeSheet: approved reportPlayerIncident moderation action preserved`);
assert(/CHECK-IN UNAVAILABLE/.test(Tee), `CourseTeeSheet: check-in control shows honest unavailable state`);

// PolicyUnavailable itself performs no callable/write.
const PU = read('components/common/PolicyUnavailable.tsx');
assert(!/httpsCallable|getFunctions|setDoc|updateDoc|addDoc/.test(PU), `PolicyUnavailable: performs no callable or write`);

if (fails.length) {
  console.error(`\n❌ nav reachability verify FAILED (${fails.length}).`);
  process.exit(1);
}
console.log(`\n✅ nav reachability verify passed: all quarantined/unresolved console tabs render PolicyUnavailable; no prohibited console is mounted; approved booking/availability/operator/enterprise/moderation/role journeys remain reachable.`);
