// ==========================================
// FILE: functions/src/authority.test.ts
// Focused positive/negative authorization tests for the server-owned staff
// authority used by syncCoursesFromProvider (and available to other callables).
// Run: `npm run test:authority`. Exits non-zero on the first failed assertion.
// ==========================================
import assert from 'node:assert';
import {
  ACTIVE_STAFF_STATUSES, KNOWN_INACTIVE_STATUSES,
  isActiveStaff, isActiveDirector, normalizeStaffStatus,
} from './authority.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

// ---- POSITIVE ----
check('active Director is staff', () => {
  assert.equal(isActiveStaff({ role: 'Director', status: 'Active' }), true);
  assert.equal(isActiveDirector({ role: 'Director', status: 'Active' }), true);
});
check('active Manager/Support is staff (any assigned role)', () => {
  assert.equal(isActiveStaff({ role: 'Manager', status: 'Active' }), true);
  assert.equal(isActiveStaff({ role: 'Support', status: 'Active' }), true);
});

// ---- ALLOWLIST (the behaviour this file used to assert the OPPOSITE of) ----
// This test previously asserted `isActiveStaff({ role: 'Support' }) === true`, with the
// comment "status defaults to active if not Suspended". That was the denylist, written
// down and locked in: a document with NO status granted platform staff authority. An
// authorization predicate must not default to authorized.
check('a MISSING status is denied, not defaulted to active', () => {
  assert.equal(isActiveStaff({ role: 'Support' }), false);
  assert.equal(isActiveStaff({ role: 'Director' }), false);
  assert.equal(isActiveDirector({ role: 'Director' }), false);
});
check('every non-active status is denied, listed or not', () => {
  // Known-inactive values.
  for (const status of KNOWN_INACTIVE_STATUSES) {
    assert.equal(isActiveStaff({ role: 'Director', status }), false, status);
    assert.equal(isActiveDirector({ role: 'Director', status }), false, status);
  }
  // Values nobody has written down. These are the ones a denylist could never cover,
  // and they are exactly what a partially-migrated or hand-edited document contains.
  for (const status of [
    'Inactive', 'Deactivated', 'DEACTIVATED', 'Revoked', 'Expired', 'Disabled',
    'Deleted', 'Archived', 'On Leave', 'probation', 'active_partner', 'Actives',
    'act ive', 'activé', '活性', 'true', '1', 'null', 'undefined', 'Active-ish',
  ]) {
    assert.equal(isActiveStaff({ role: 'Director', status }), false, status);
  }
});
check('canonically equivalent spellings of Active ARE accepted', () => {
  // Case and surrounding whitespace are not a different status.
  for (const status of ['Active', 'active', 'ACTIVE', ' Active ', '\tActive\n']) {
    assert.equal(isActiveStaff({ role: 'Support', status }), true, JSON.stringify(status));
  }
  // A CONFUSABLE is a different status. 'Аctive' below opens with Cyrillic U+0410.
  const confusable = 'Аctive';
  assert.notEqual(confusable, 'Active');
  assert.equal(isActiveStaff({ role: 'Support', status: confusable }), false, 'a Cyrillic look-alike must not authorize');
  // NFC-equivalent forms fold together; decomposed text is normalized, not rejected.
  assert.equal(normalizeStaffStatus('Active'), 'active');
  assert.equal(normalizeStaffStatus('  ACTIVE  '), 'active');
  assert.equal(normalizeStaffStatus(''), null);
  assert.equal(normalizeStaffStatus('   '), null);
  for (const bad of [null, undefined, 0, 1, true, false, {}, [], () => 'Active']) {
    assert.equal(normalizeStaffStatus(bad), null, String(bad));
  }
});
check('a malformed document type is denied', () => {
  for (const bad of [[], ['Active'], 'Active', 42, true, () => true]) {
    assert.equal(isActiveStaff(bad as never), false, String(bad));
  }
  // A status of the wrong TYPE cannot authorize, however truthy.
  for (const bad of [true, 1, {}, [], ['Active']]) {
    assert.equal(isActiveStaff({ role: 'Director', status: bad as never }), false, String(bad));
  }
});
check('a valid role never overrides an inactive status', () => {
  // Status is evaluated first and independently. Director is the strongest role in the
  // system and it still cannot rescue an account that is not active.
  for (const status of ['Suspended', 'Inactive', 'Deactivated', '', '   ']) {
    assert.equal(isActiveStaff({ role: 'Director', status }), false, status);
    assert.equal(isActiveDirector({ role: 'Director', status }), false, status);
  }
  assert.equal(ACTIVE_STAFF_STATUSES.length, 1, 'widening the active set is a reviewed change, not a drive-by');
  assert.deepEqual([...ACTIVE_STAFF_STATUSES], ['active']);
});
check('Director role matching stays exact — hardening must not widen', () => {
  // Case-folding the ROLE would grant Director powers to spellings that never had them.
  for (const role of ['director', 'DIRECTOR', ' Director ', 'Director ']) {
    assert.equal(isActiveDirector({ role, status: 'Active' }), false, role);
  }
  assert.equal(isActiveDirector({ role: 'Director', status: 'Active' }), true);
});

// ---- NEGATIVE (fail closed) ----
check('missing admin_users doc → denied', () => {
  assert.equal(isActiveStaff(null), false);
  assert.equal(isActiveStaff(undefined), false);
  assert.equal(isActiveDirector(null), false);
});
check('suspended staff → denied (even Director)', () => {
  assert.equal(isActiveStaff({ role: 'Director', status: 'Suspended' }), false);
  assert.equal(isActiveDirector({ role: 'Director', status: 'Suspended' }), false);
});
check('role-less / unauthorized record → denied', () => {
  assert.equal(isActiveStaff({ status: 'Active' }), false);   // no role
  assert.equal(isActiveStaff({}), false);
  assert.equal(isActiveStaff({ role: '', status: 'Active' }), false);
  assert.equal(isActiveStaff({ role: '   ', status: 'Active' }), false);
});
check('non-Director active staff is NOT a Director', () => {
  assert.equal(isActiveDirector({ role: 'Support', status: 'Active' }), false);
});
check('authority derives ONLY from the doc — no email/identity input exists', () => {
  // The function signature takes only the admin_users doc; there is no email,
  // env, or client-role parameter that could grant a bypass.
  assert.equal(isActiveStaff.length, 1);
});

console.log(`\nauthority: ${passed} checks passed.`);
