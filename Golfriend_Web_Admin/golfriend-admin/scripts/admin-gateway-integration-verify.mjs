import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePortalAccess } from '../src/auth/roleJourney.js';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(app, /path="\/" element=\{<Navigate to="\/admin" replace \/>\}/,
  'root must expose the protected Admin gateway');
assert.match(app, /path="\/admin" element=\{<Dashboard mode="admin" \/>\}/,
  'canonical Admin route must remain resolver-gated');
assert.doesNotMatch(app, /createUserWithEmailAndPassword|signUp|registerAdmin/i,
  'Admin must not expose self-registration');
assert.match(app, /signInWithEmailAndPassword/,
  'Admin must use provider-backed sign-in');
assert.match(app, /onSnapshot\(doc\(db, 'admin_users', currentUser\.uid\)/,
  'rendered authority must react to server-side suspension or revocation');
assert.match(app, /SESSION_IDLE_MS\s*=\s*30 \* 60 \* 1000/,
  'Admin session must expire after bounded inactivity');

const user = { uid: 'server-authenticated-user' };
for (const role of ['Director', 'Manager', 'Support']) {
  assert.equal(resolvePortalAccess({ mode:'admin', user, adminDoc:{ role, status:'Active' } }).state, 'authorized');
}
for (const role of ['', 'director', 'Owner', 'super_admin', null, undefined]) {
  assert.notEqual(resolvePortalAccess({ mode:'admin', user, adminDoc:{ role, status:'Active' } }).state, 'authorized');
}
for (const status of ['Suspended', 'Revoked', 'Expired', 'Pending', 'Unknown']) {
  assert.notEqual(resolvePortalAccess({ mode:'admin', user, adminDoc:{ role:'Director', status } }).state, 'authorized');
}
assert.equal(resolvePortalAccess({ mode:'admin', user, adminDoc:null }).state, 'unauthorized');
assert.equal(resolvePortalAccess({ mode:'admin', user, resolveError:true }).state, 'error');

console.log('Admin gateway integration PASS: canonical root, no registration, provider sign-in, closed roles, live revocation, idle expiry and fail-closed states.');
