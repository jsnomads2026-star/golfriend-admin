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
const EnterpriseTournament = read('components/B2B/enterpriseTournament/EnterpriseTournamentOperations.tsx');
const EnterpriseTournamentService = read('components/B2B/enterprise/tournamentOperationsService.ts');

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
// The recorded Enterprise tournament consumer is mounted, but remains honest and
// unavailable unless its separately owned authoritative producer is supplied.
assert(/activeTab === 'tournaments' && <EnterpriseTournamentOperations\s*\/>/.test(Ent), `EnterpriseDashboard: 'tournaments' mounts the approved scoped consumer`);
assert(/service=unavailableService/.test(EnterpriseTournament), `Enterprise tournament consumer defaults to the unavailable service`);
assert(/new EnterpriseTournamentOperationsService\(null\)/.test(EnterpriseTournament), `Enterprise tournament consumer does not invent a producer`);
assert(/state==="unavailable"/.test(EnterpriseTournament) && /role="alert"/.test(EnterpriseTournament), `Enterprise tournament consumer exposes an accessible unavailable state`);
assert(/if \(!this\.producer/.test(EnterpriseTournamentService) && /TOURNAMENT_PRODUCER_UNAVAILABLE/.test(EnterpriseTournamentService), `Enterprise tournament service fails closed without its producer`);
assert(!/firebase\/firestore|setDoc|updateDoc|addDoc|deleteDoc/.test(EnterpriseTournament), `Enterprise tournament consumer performs no direct datastore writes`);
assert(/activeTab === 'raffle' && <PolicyUnavailable/.test(Ent), `EnterpriseDashboard: 'raffle' renders PolicyUnavailable`);
assert(!/activeTab === 'tournaments'|EnterpriseTournamentOperations/.test(SB), `SmallBusinessDashboard: Enterprise tournament route remains absent`);

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
const teeSheetBranch = Ent.match(/activeTab === 'teesheet' && <>([\s\S]*?)<\/?>/)?.[1] || '';
assert(
  teeSheetBranch.includes('<EnterpriseBookingCoordinationDesk />') &&
  teeSheetBranch.includes('<BookingOperationsReportV2 />') &&
  teeSheetBranch.includes('<BookingProviderPublicationV2 />') &&
  teeSheetBranch.includes('<CourseTeeSheet />'),
  `EnterpriseDashboard: approved 'teesheet' lifecycle, reporting, publication and tee sheet preserved`,
);
assert(
  /<EnterpriseBookingCoordinationDesk\s*\/>/.test(SB) &&
  /<BookingOperationsReportV2\s*\/>/.test(SB) &&
  /<BookingProviderPublicationV2\s*\/>/.test(SB) &&
  !/CourseAvailabilityV2|VenueManager/.test(SB),
  `SmallBusinessDashboard: booking interoperability is preserved without Enterprise course authority`,
);

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
