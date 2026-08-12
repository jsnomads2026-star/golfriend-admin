// ==========================================
// FILE: scripts/role-journey-verify.mjs
// Executable cross-role journey matrix. Imports the SAME server-owned derivation
// used by App.tsx (src/auth/roleJourney.js) and the fail-closed Firebase target
// resolver (src/firebaseTarget.js), and asserts every journey state is reachable
// for the right inputs across BOTH portal modes. Fail-closed: exit 1 on any
// mismatch. No git/npm/build side effects.
//
// Run: node scripts/role-journey-verify.mjs
// ==========================================

import {
  resolvePortalAccess,
  JOURNEY_STATES,
  STATE_COPY,
} from '../src/auth/roleJourney.js';
import {
  resolveFirebaseTarget,
  findV1Leaks,
} from '../src/firebaseTarget.js';

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];
const reached = new Set();

/**
 * Assert that resolvePortalAccess(input) yields the expected fields.
 * @param {string} name
 * @param {object} input
 * @param {{ state: string, surface?: string, role?: string }} expect
 */
function assertResolve(name, input, expect) {
  const got = resolvePortalAccess(input);
  const checks = [];
  checks.push(got.state === expect.state);
  if (expect.surface !== undefined) checks.push(got.surface === expect.surface);
  if (expect.role !== undefined) checks.push(got.role === expect.role);
  const ok = checks.every(Boolean);
  if (ok && got.state) reached.add(got.state);
  results.push({
    name,
    ok,
    detail: ok
      ? `→ ${JSON.stringify(got)}`
      : `expected ${JSON.stringify(expect)}, got ${JSON.stringify(got)}`,
  });
}

/**
 * Assert an arbitrary boolean predicate.
 * @param {string} name
 * @param {boolean} cond
 * @param {string} detail
 */
function assertTrue(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
}

const user = { uid: 'u' };

// ---------------------------------------------------------------------------
// 1. Every JOURNEY_STATE is reachable for the right inputs, for BOTH modes.
// ---------------------------------------------------------------------------

for (const mode of ['admin', 'partner']) {
  // Pre-role states are mode-agnostic in the resolver, but we exercise both
  // modes to prove neither mode short-circuits them.
  assertResolve(`[${mode}] auth_pending`, { mode, authPending: true }, { state: 'auth_pending' });
  assertResolve(`[${mode}] signed_out`, { mode, user: null }, { state: 'signed_out' });
  assertResolve(`[${mode}] role_resolving`, { mode, user, roleLoading: true }, { state: 'role_resolving' });
  assertResolve(`[${mode}] error`, { mode, user, resolveError: true }, { state: 'error' });
}

// admin authorized / suspended / unauthorized
assertResolve('[admin] unauthorized (no adminDoc)', { mode: 'admin', user, adminDoc: null }, { state: 'unauthorized', surface: 'admin' });
assertResolve('[admin] suspended', { mode: 'admin', user, adminDoc: { role: 'Director', status: 'Suspended' } }, { state: 'suspended', surface: 'admin' });
assertResolve('[admin] authorized Director', { mode: 'admin', user, adminDoc: { role: 'Director', status: 'Active' } }, { state: 'authorized', surface: 'admin', role: 'Director' });

// partner authorized / suspended / unauthorized
assertResolve('[partner] unauthorized (no partnerDoc)', { mode: 'partner', user, partnerDoc: null }, { state: 'unauthorized', surface: 'partner' });
assertResolve('[partner] suspended (inactive)', { mode: 'partner', user, partnerDoc: { tier: 'small_business', status: 'inactive' } }, { state: 'suspended', surface: 'partner' });
assertResolve('[partner] authorized small_business', { mode: 'partner', user, partnerDoc: { tier: 'small_business', status: 'active_partner' } }, { state: 'authorized', surface: 'small' });
assertResolve('[partner] authorized enterprise (tier=enterprise)', { mode: 'partner', user, partnerDoc: { tier: 'enterprise', status: 'active_partner' } }, { state: 'authorized', surface: 'enterprise' });
assertResolve('[partner] authorized enterprise (tier=master_host)', { mode: 'partner', user, partnerDoc: { tier: 'master_host', status: 'active_partner' } }, { state: 'authorized', surface: 'enterprise' });
assertResolve('[partner] authorized enterprise (tier=Product & Service Promotion)', { mode: 'partner', user, partnerDoc: { tier: 'Product & Service Promotion', status: 'active_partner' } }, { state: 'authorized', surface: 'enterprise' });

// ---------------------------------------------------------------------------
// 2. Server-owned derivation proof: a God-Mode-literal email with NO adminDoc
//    is 'unauthorized'. The resolver ignores email entirely — access requires
//    the server-owned admin_users doc.
// ---------------------------------------------------------------------------
assertResolve(
  '[admin] God-Mode email WITHOUT adminDoc is unauthorized (email ignored)',
  { mode: 'admin', user: { uid: 'u', email: 'admin@golfriend.co' }, adminDoc: null },
  { state: 'unauthorized', surface: 'admin' },
);
// And WITH a server doc the same email-bearing user is authorized ONLY because
// of the doc (proves the doc, not the email, is the source of truth).
assertResolve(
  '[admin] same email WITH adminDoc is authorized (doc is the source)',
  { mode: 'admin', user: { uid: 'u', email: 'admin@golfriend.co' }, adminDoc: { role: 'Director', status: 'Active' } },
  { state: 'authorized', surface: 'admin', role: 'Director' },
);

// ---------------------------------------------------------------------------
// 3. No V1 under v2-preview: auth journey resolves under injected V2 identities
//    with zero V1 fallback, and v2-preview fails closed when unconfigured.
// ---------------------------------------------------------------------------
const fakeV2 = {
  VITE_FIREBASE_V2_API_KEY: 'AIzaFAKE_v2_key_0000000000000000000000',
  VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v2.firebaseapp.com',
  VITE_FIREBASE_V2_PROJECT_ID: 'golfriend-v2',
  VITE_FIREBASE_V2_STORAGE_BUCKET: 'golfriend-v2.firebasestorage.app',
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '999888777666',
  VITE_FIREBASE_V2_APP_ID: '1:999888777666:web:deadbeefcafef00dfeed01',
};

let v2cfg = null;
let v2Threw = false;
try {
  v2cfg = resolveFirebaseTarget('v2-preview', fakeV2);
} catch (e) {
  v2Threw = true;
}
assertTrue(
  'v2-preview resolves from injected V2 env (no throw)',
  !v2Threw && v2cfg !== null,
  v2Threw ? 'unexpectedly threw' : `→ projectId=${v2cfg && v2cfg.projectId}`,
);
assertTrue(
  'v2-preview config has ZERO V1 leaks',
  v2cfg !== null && findV1Leaks(v2cfg).length === 0,
  v2cfg === null ? 'no config' : `leaks=${JSON.stringify(findV1Leaks(v2cfg))}`,
);

let emptyThrew = false;
try {
  resolveFirebaseTarget('v2-preview', {});
} catch (e) {
  emptyThrew = true;
}
assertTrue(
  'v2-preview with {} throws (fail-closed, no V1 fallback)',
  emptyThrew,
  emptyThrew ? 'threw as required' : 'did NOT throw',
);

// ---------------------------------------------------------------------------
// Reachability coverage: every JOURNEY_STATE must have been produced above.
// ---------------------------------------------------------------------------
const unreached = JOURNEY_STATES.filter((s) => !reached.has(s));
assertTrue(
  `all ${JOURNEY_STATES.length} JOURNEY_STATES reachable`,
  unreached.length === 0,
  unreached.length ? `unreached: ${unreached.join(', ')}` : `reached: ${[...reached].join(', ')}`,
);

// Every non-authorized state has honest STATE_COPY (no raw provider errors).
const missingCopy = JOURNEY_STATES.filter((s) => s !== 'authorized' && !STATE_COPY[s]);
assertTrue(
  'every non-authorized state has honest STATE_COPY',
  missingCopy.length === 0,
  missingCopy.length ? `missing copy: ${missingCopy.join(', ')}` : 'all present',
);

// ---------------------------------------------------------------------------
// Print ✓/✗ table and exit fail-closed.
// ---------------------------------------------------------------------------
const pad = Math.max(...results.map((r) => r.name.length));
let failed = 0;
console.log('\nPortal Auth Journey — role-journey-verify\n');
for (const r of results) {
  if (!r.ok) failed++;
  const mark = r.ok ? '✓' : '✗';
  console.log(`  ${mark}  ${r.name.padEnd(pad)}  ${r.detail}`);
}
console.log(`\n  ${results.length - failed}/${results.length} passed; ${failed} failed.\n`);

if (failed > 0) {
  console.error('FAIL: portal auth journey mismatch (fail-closed).');
  process.exit(1);
}
console.log('OK: every journey state reachable; server-owned derivation + zero-V1 verified.');
process.exit(0);
