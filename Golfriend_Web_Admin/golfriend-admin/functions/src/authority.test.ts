// ==========================================
// FILE: functions/src/authority.test.ts
// Focused positive/negative authorization tests for the server-owned staff
// authority used by syncCoursesFromProvider (and available to other callables).
// Run: `npm run test:authority`. Exits non-zero on the first failed assertion.
// ==========================================
import assert from 'node:assert';
import { isActiveStaff, isActiveDirector } from './authority.js';

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
  assert.equal(isActiveStaff({ role: 'Support' }), true); // status defaults to active if not Suspended
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
