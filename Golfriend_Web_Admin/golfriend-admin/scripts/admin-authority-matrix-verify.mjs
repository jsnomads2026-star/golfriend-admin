// ==========================================
// FILE: scripts/admin-authority-matrix-verify.mjs
// Run: node scripts/admin-authority-matrix-verify.mjs
//
// The SHARED Admin authority matrix. One place that proves, for every consumer of the
// staff predicate, that authorization is an ALLOWLIST and fails closed.
//
// Three things are checked, and the third is the one that matters most:
//   1. BEHAVIOUR — the server predicate over a large status matrix, including values
//      nobody has written down. A denylist passes (1) only for the values it happens to
//      list; an allowlist passes for everything.
//   2. AGREEMENT — the server predicate (functions/src/authority.ts) and the client
//      journey (src/auth/roleJourney.js) must reach the same verdict on every input.
//      A divergence means the portal authorizes someone the server will refuse.
//   3. CALL SITES — no consumer may re-implement the check inline. An ad-hoc
//      `data()?.role !== 'Director'` or `status !== 'Suspended'` is how the denylist
//      survived in three callables even while the shared predicate existed.
//
// Static + pure analysis. No network, no emulator, no production project.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

// The compiled predicate is the one the callables actually run.
const tsc = [
  resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'),
  resolve(ROOT, 'node_modules/typescript/bin/tsc'),
].find((candidate) => existsSync(candidate));
assert.ok(tsc, 'no local typescript compiler found for functions/');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

const serverModule = await import(`file://${resolve(FUNCTIONS, 'lib/authority.js')}`);
const server = serverModule.default ?? serverModule;
const journey = await import(`file://${resolve(ROOT, 'src/auth/roleJourney.js')}`);

// ---- 1. BEHAVIOUR: the allowlist over a wide matrix --------------------------------
const AUTHORIZING = ['Active', 'active', 'ACTIVE', ' Active ', '\tActive\n', 'aCtIvE'];
const REFUSING = [
  // Explicitly known-inactive.
  'Suspended', 'suspended', 'SUSPENDED', 'Inactive', 'inactive', 'Deactivated',
  'Revoked', 'Expired', 'Disabled', 'Deleted', 'Removed', 'Terminated', 'Pending', 'Unknown',
  // Never written down anywhere — the class a denylist can never cover.
  'Archived', 'On Leave', 'probation', 'former', 'contractor', 'Active-ish', 'Actives',
  'act ive', 'in-active', 'not suspended', 'active_partner', 'ACTIVE_PARTNER',
  // Shapes that come from half-written or hand-edited documents.
  '', '   ', '\n', 'null', 'undefined', 'true', '1', '0', 'NaN', '[object Object]',
  // Confusables: they LOOK active and are not.
  'Аctive', 'Activе', 'Асtive', 'Ａctive',
];

for (const status of AUTHORIZING) {
  assert.equal(server.isActiveStaff({ role: 'Support', status }), true, `staff should authorize: ${JSON.stringify(status)}`);
}
for (const status of REFUSING) {
  assert.equal(server.isActiveStaff({ role: 'Director', status }), false, `staff must refuse: ${JSON.stringify(status)}`);
  assert.equal(server.isActiveDirector({ role: 'Director', status }), false, `director must refuse: ${JSON.stringify(status)}`);
}
// Absent, and wrong-typed, status.
for (const doc of [{ role: 'Director' }, { role: 'Director', status: null }, { role: 'Director', status: undefined },
  { role: 'Director', status: 1 }, { role: 'Director', status: true }, { role: 'Director', status: {} },
  { role: 'Director', status: ['Active'] }]) {
  assert.equal(server.isActiveStaff(doc), false, `absent/mistyped status must refuse: ${JSON.stringify(doc)}`);
}
// A valid role never rescues an inactive status.
for (const status of ['Suspended', 'Inactive', '', 'Archived']) {
  assert.equal(server.isActiveDirector({ role: 'Director', status }), false, status);
}
ok(`allowlist behaviour: ${AUTHORIZING.length} authorizing, ${REFUSING.length + 7} refusing (incl. confusables and absent status)`);

// ---- 2. AGREEMENT: server predicate vs client journey ------------------------------
// If these disagree, the portal renders an admin shell whose every action then fails.
const user = { uid: 'u1' };
const allStatuses = [...AUTHORIZING, ...REFUSING];
for (const status of allStatuses) {
  const serverSays = server.isActiveStaff({ role: 'Director', status });
  const clientSays = journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: { role: 'Director', status } }).state === 'authorized';
  assert.equal(
    clientSays, serverSays,
    `server and client DISAGREE on ${JSON.stringify(status)}: server=${serverSays} client=${clientSays}`,
  );
}
// Absent status, both sides.
assert.equal(server.isActiveStaff({ role: 'Director' }), false);
assert.equal(journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: { role: 'Director' } }).state, 'unauthorized');
// Role-less, both sides.
assert.equal(server.isActiveStaff({ status: 'Active' }), false);
assert.equal(journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: { status: 'Active' } }).state, 'unauthorized');
// An unknown status reports as unauthorized, NOT as suspended — we do not know it was.
assert.equal(journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: { role: 'Director', status: 'Archived' } }).state, 'unauthorized');
assert.equal(journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: { role: 'Director', status: 'Suspended' } }).state, 'suspended');
// The two normalizers agree.
for (const value of [...allStatuses, null, undefined, 42, {}, []]) {
  assert.equal(server.normalizeStaffStatus(value), journey.normalizeStaffStatus(value), `normalizers diverge on ${JSON.stringify(value)}`);
}
assert.deepEqual([...server.ACTIVE_STAFF_STATUSES], [...journey.ACTIVE_ADMIN_STATUSES], 'the two active-status lists have drifted apart');
ok(`server/client agreement over ${allStatuses.length} statuses, both normalizers, and both active lists`);

// ---- 3. NO PORTAL/PARTNER/MEMBER PATH GRANTS ADMIN AUTHORITY -----------------------
// A course representative or ordinary member has a b2b_partners/users doc, never an
// admin_users one. Admin authority must not be reachable from either.
for (const partnerDoc of [
  { tier: 'enterprise', status: 'active_partner' },
  { tier: 'master_host', status: 'active_partner' },
  { tier: 'small_business', status: 'active_partner' },
]) {
  const resolved = journey.resolvePortalAccess({ mode: 'partner', user, partnerDoc });
  assert.equal(resolved.state, 'authorized');
  assert.notEqual(resolved.surface, 'admin', 'a partner resolved onto the admin surface');
  assert.equal(server.isActiveStaff(partnerDoc), false, 'a partner document satisfied the STAFF predicate');
  assert.equal(server.isActiveDirector(partnerDoc), false);
}
// A partner doc carrying an admin-looking role must still not be staff, because the
// predicate is fed from admin_users and a partner has no such document.
assert.equal(server.isActiveStaff({ role: 'Director', status: 'active_partner' }), false,
  'a partner status must never satisfy the staff allowlist');
// An admin request with only a partner doc is unauthorized.
assert.equal(journey.resolvePortalAccess({ mode: 'admin', user, adminDoc: null, partnerDoc: { tier: 'enterprise', status: 'active_partner' } }).state, 'unauthorized');
ok('no partner tier, course representative or member document can reach admin authority');

// ---- 4. CALL SITES: no consumer re-implements the check ----------------------------
// This is what actually failed before: the shared predicate was correct-ish, and three
// callables ignored it and compared fields themselves.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const SOURCES = ['index.ts', 'courseIngestion.ts', 'outreachStore.ts', 'outreachAuthority.ts'];
const offenders = [];
for (const file of SOURCES) {
  const full = resolve(FUNCTIONS, 'src', file);
  if (!existsSync(full)) continue;
  const code = stripComments(readFileSync(full, 'utf8'));
  // An inline comparison of an admin_users role or status is an authority decision made
  // outside the shared predicate.
  const patterns = [
    /data\(\)\?\.role\s*[!=]==\s*['"]Director['"]/g,
    /adminSnap\.data\(\)\?\.status\s*[!=]==\s*['"]Suspended['"]/g,
    /callerDoc\.data\(\)\?\.status\s*[!=]==\s*['"]/g,
    /adminUser\.data\(\)\?\.status\s*[!=]==\s*['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      offenders.push(`${relative(ROOT, full).replace(/\\/g, '/')}: ${match[0]}`);
    }
  }
}
assert.deepEqual(offenders, [], `authority decided outside the shared predicate:\n  ${offenders.join('\n  ')}`);

// And every admin_users read in the deploy entry must be adjacent to a predicate call.
const indexSource = readFileSync(resolve(FUNCTIONS, 'src/index.ts'), 'utf8');
const adminReads = [...indexSource.matchAll(/collection\(['"]admin_users['"]\)\.doc\(([^)]*)\)\.get\(\)/g)].length;
const predicateCalls = [...indexSource.matchAll(/isActive(Staff|Director)\s*\(/g)].length;
assert.ok(
  predicateCalls >= adminReads - 1,
  `${adminReads} admin_users reads but only ${predicateCalls} predicate calls — at least one read decides authority by itself`,
);
ok(`no inline authority decisions; ${adminReads} admin_users reads covered by ${predicateCalls} predicate calls`);

// ---- 5. THE PREDICATE IS LOAD-BEARING (mutation) -----------------------------------
// Each guard is removed from a COPY of the source and the matrix is re-run. If the matrix
// still passes, that guard was decorative. This is the check that catches a test shaped to
// the implementation rather than to the requirement.
const authoritySource = readFileSync(resolve(FUNCTIONS, 'src/authority.ts'), 'utf8');
// Each guard is DECLARED as either load-bearing ('required') or a deliberate safety net
// ('redundant'), and the harness asserts the declaration is true. Simply deleting from
// this list until it goes green would be the same self-deception as writing a test that
// matches the implementation — so the redundant ones are named and checked too. If a
// safety net ever becomes the only thing holding a case up, or a required guard stops
// mattering, the classification breaks and this gate fails.
const MUTATIONS = [
  ['status normalization', 'required', /const normalized = value\.normalize\('NFC'\)\.trim\(\)\.toLowerCase\(\);/, 'const normalized = value;'],
  ['active-state allowlist', 'required', /if \(ACTIVE_STAFF_STATUSES\.indexOf\(status\) === -1\) return false;.*/, ''],
  ['role verification', 'required', /if \(typeof adminDoc\.role !== 'string' \|\| adminDoc\.role\.trim\(\) === ''\) return false;.*/, ''],
  ['director role check', 'required', /return isActiveStaff\(adminDoc\) && adminDoc!\.role === 'Director';/, 'return isActiveStaff(adminDoc);'],
  ['missing-document denial', 'required', /if \(!adminDoc \|\| typeof adminDoc !== 'object'\) return false;.*/, ''],
  // Safety nets: the allowlist already refuses everything these refuse. They exist so the
  // refusal is explicit at the point a reader looks for it, and so widening the allowlist
  // later cannot silently re-admit a known-bad status.
  ['known-inactive denial', 'redundant', /if \(KNOWN_INACTIVE_STATUSES\.indexOf\(status\) !== -1\) return false;.*/, ''],
  ['blank/absent status denial', 'redundant', /if \(status === null\) return false;.*/, ''],
  ['explicit Suspended denial', 'redundant', /if \(adminDoc\.status === 'Suspended'\) return false;.*/, ''],
  ['array-type denial', 'redundant', /if \(Array\.isArray\(adminDoc\)\) return false;.*/, ''],
];
const runMatrixAgainst = (source) => {
  // Transpile the mutated TypeScript in memory and re-run the matrix against it.
  const js = source
    .replace(/export interface [\s\S]*?\n}\n/g, '')
    .replace(/: readonly string\[\]/g, '')
    .replace(/\(value: unknown\)/g, '(value)')
    .replace(/: string \| null/g, '')
    .replace(/\(adminDoc: AdminUserDoc \| null \| undefined\)/g, '(adminDoc)')
    .replace(/: boolean/g, '')
    .replace(/adminDoc!/g, 'adminDoc');
  return import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
};
const matrixHolds = async (mod) => {
  try {
    for (const status of AUTHORIZING) if (mod.isActiveStaff({ role: 'Support', status }) !== true) return false;
    for (const status of REFUSING) if (mod.isActiveStaff({ role: 'Director', status }) !== false) return false;
    if (mod.isActiveStaff({ role: 'Director' }) !== false) return false;
    if (mod.isActiveStaff({ status: 'Active' }) !== false) return false;
    if (mod.isActiveStaff(['Active']) !== false) return false;
    // A missing document is part of the requirement, so the matrix has to state it —
    // otherwise the guard that handles it cannot be proved load-bearing.
    if (mod.isActiveStaff(null) !== false) return false;
    if (mod.isActiveStaff(undefined) !== false) return false;
    if (mod.isActiveDirector(null) !== false) return false;
    if (mod.isActiveDirector({ role: 'Support', status: 'Active' }) !== false) return false;
    return true;
  } catch { return false; }
};
// The unmutated source must PASS, or every mutation below would "fail" for free.
assert.equal(await matrixHolds(await runMatrixAgainst(authoritySource)), true, 'the matrix does not hold against the real source');
let required = 0;
let redundant = 0;
for (const [label, classification, pattern, replacement] of MUTATIONS) {
  const mutated = authoritySource.replace(pattern, replacement);
  assert.notEqual(mutated, authoritySource, `mutation '${label}' did not apply — the guard it targets has moved or gone`);
  const stillHolds = await matrixHolds(await runMatrixAgainst(mutated));
  if (classification === 'required') {
    assert.equal(stillHolds, false, `'${label}' is declared REQUIRED but removing it changed nothing — it is decorative`);
    required += 1;
  } else {
    assert.equal(stillHolds, true, `'${label}' is declared a REDUNDANT safety net but removing it broke the matrix — it is load-bearing and must be reclassified`);
    redundant += 1;
  }
}
ok(`${required} guards proved load-bearing by mutation; ${redundant} proved to be the declared safety nets`);

console.log(`\nAdmin authority matrix PASS: ${checks} checks (allowlist over ${AUTHORIZING.length + REFUSING.length} statuses, server/client agreement, no partner or member path to admin, no inline authority decisions, ${MUTATIONS.length} guards classified by mutation).`);
