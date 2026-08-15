// ==========================================
// FILE: functions/src/enterpriseMembershipRegistry.test.ts
// Run: tsc && node lib/enterpriseMembershipRegistry.test.js
//
// Hostile tests for the membership vocabulary. Every case here is something that used to
// come back from `collectionGroup('members')` looking exactly like enterprise staff.
// ==========================================
import assert from 'node:assert/strict';
import {
  MEMBERSHIP_REGISTRY_VERSION,
  REMOVAL_REASONS,
  classifyMembershipPath,
  evaluateMembershipCandidate,
  decideMembershipAdmission,
  removalFingerprint,
  isRemovalReason,
  isValidCommandId,
} from './enterpriseMembershipRegistry.js';

let checks = 0;
const ok = (label: string) => { checks += 1; console.log(`  ✓ ${label}`); };

const CALLER = 'ent-1';
const ORG = 'org-1';
const STAFF = 'staff-1';
const good = (over: Record<string, unknown> = {}) => ({
  staffUid: STAFF, enterpriseUid: CALLER, organizationId: ORG, role: 'manager',
  status: 'active', registryVersion: MEMBERSHIP_REGISTRY_VERSION, grantSeq: 1, ...over,
});
const evaluate = (path: unknown, data: unknown) => evaluateMembershipCandidate({
  path, data, expectedStaffUid: STAFF, callerUid: CALLER, callerOrganizationId: ORG,
});

// ---- SAME-NAMED FOREIGN SUBCOLLECTIONS ------------------------------------------------
// The whole reason this module exists: a collection-group query matches a NAME, not a
// location. None of these are enterprise memberships, and none may influence a grant.
const FOREIGN_PATHS = [
  'partner_organizations/org-9/members/staff-1',
  'clubs/club-4/members/staff-1',
  'tournaments/t-1/teams/a/members/staff-1',
  'enterprise_staff/ent-1/members/staff-1/history/h1',
  'enterprise_staffing/ent-1/members/staff-1',
  'other_enterprise_staff/ent-1/members/staff-1',
  'enterprise_staff/members/staff-1',
  'members/staff-1',
];
for (const path of FOREIGN_PATHS) {
  assert.equal(classifyMembershipPath(path).kind, 'foreign_domain', path);
  assert.equal(evaluate(path, good({ enterpriseUid: 'ent-9' })).verdict, 'foreign_ignore', path);
}
// And the canonical path IS recognized, so the above is a control and not a blanket reject.
const canonical = classifyMembershipPath(`enterprise_staff/${CALLER}/members/${STAFF}`);
assert.equal(canonical.kind, 'enterprise_membership');
assert.equal((canonical as any).enterpriseUid, CALLER);
assert.equal((canonical as any).staffUid, STAFF);
// Leading/trailing slashes are normalized rather than making a real path look foreign.
assert.equal(classifyMembershipPath(`/enterprise_staff/${CALLER}/members/${STAFF}/`).kind, 'enterprise_membership');
ok(`${FOREIGN_PATHS.length} same-named foreign subcollection paths ignored; the canonical path is still recognized`);

// ---- CROSS-ENTERPRISE AND CROSS-ORGANIZATION -----------------------------------------
assert.equal(
  evaluate('enterprise_staff/ent-9/members/staff-1', good({ enterpriseUid: 'ent-9' })).verdict,
  'cross_enterprise',
);
assert.equal(
  evaluate(`enterprise_staff/${CALLER}/members/${STAFF}`, good({ organizationId: 'org-9' })).verdict,
  'cross_organization',
);
assert.equal(evaluate(`enterprise_staff/${CALLER}/members/${STAFF}`, good()).verdict, 'own_active');
assert.equal(evaluate(`enterprise_staff/${CALLER}/members/${STAFF}`, good({ status: 'removed' })).verdict, 'own_inactive');
ok('cross-enterprise and cross-organization bindings are distinguished from an own active membership');

// ---- MALFORMED, SURPLUS AND LEGACY ---------------------------------------------------
const MALFORMED: [string, unknown][] = [
  ['not an object', 'a string'],
  ['null', null],
  ['an array', [good()]],
  ['surplus field', good({ isAdmin: true })],
  ['two surplus fields', good({ shadowRole: 'Director', bypass: 1 })],
  ['staffUid disagrees with the document id', good({ staffUid: 'someone-else' })],
  ['enterpriseUid disagrees with the path', { ...good(), enterpriseUid: 'ent-9' }],
  ['unknown status', good({ status: 'pending' })],
  ['status is not a string', good({ status: 1 })],
  ['blank organization binding', good({ organizationId: '   ' })],
  ['missing organization binding', (() => { const d: any = good(); delete d.organizationId; return d; })()],
  ['wrong registryVersion', good({ registryVersion: '1999-01-01.v0' })],
];
for (const [label, data] of MALFORMED) {
  const path = `enterprise_staff/${CALLER}/members/${STAFF}`;
  // enterpriseUid mismatch is evaluated against the path it is filed under.
  assert.equal(evaluate(path, data).verdict, 'malformed', label);
}
// A PRE-REGISTRY record is called out separately: it is not corrupt, it is unevaluable,
// and it must not be read as "unattached".
const legacy: any = good();
delete legacy.registryVersion;
assert.equal(evaluate(`enterprise_staff/${CALLER}/members/${STAFF}`, legacy).verdict, 'legacy_unregistered');
ok(`${MALFORMED.length} malformed/surplus shapes rejected; a pre-registry record is separately refused, never treated as unattached`);

// ---- THE WHOLE-EVIDENCE DECISION ------------------------------------------------------
const v = (verdict: string) => ({ verdict: verdict as any, detail: '' });
assert.equal(decideMembershipAdmission({ registry: null, candidates: [], saturated: false }).decision, 'proceed');
assert.equal(decideMembershipAdmission({ registry: null, candidates: [v('foreign_ignore'), v('own_inactive')], saturated: false }).decision, 'proceed');
for (const blocking of ['malformed', 'legacy_unregistered', 'cross_enterprise', 'cross_organization']) {
  const decision = decideMembershipAdmission({ registry: null, candidates: [v('foreign_ignore'), v(blocking)], saturated: false });
  assert.equal(decision.decision, 'refuse', blocking);
  assert.ok(decision.code !== 'ok', blocking);
}
// A registry verdict alone refuses, even with a clean candidate page.
assert.equal(decideMembershipAdmission({ registry: v('cross_enterprise'), candidates: [], saturated: false }).decision, 'refuse');
// PAGINATION BEYOND TEN. Every candidate is evaluated, not the first page-worth: the
// blocking record sits at position 24 of 30.
const many = Array.from({ length: 30 }, (_, i) => (i === 23 ? v('cross_enterprise') : v('foreign_ignore')));
assert.equal(decideMembershipAdmission({ registry: null, candidates: many, saturated: false }).decision, 'refuse');
assert.equal(decideMembershipAdmission({ registry: null, candidates: many, saturated: false }).counts.foreign_ignore, 29);
// A SATURATED page refuses regardless of what it happens to contain.
assert.equal(decideMembershipAdmission({ registry: null, candidates: [v('own_inactive')], saturated: true }).decision, 'refuse');
assert.equal(decideMembershipAdmission({ registry: null, candidates: [], saturated: true }).code, 'unavailable');
ok('admission proceeds only on ignorable/own evidence; a blocking record at position 24 of 30 still refuses; a saturated page refuses');

// ---- COMMAND IDENTITY AND REPLAY ------------------------------------------------------
const base = { enterpriseUid: CALLER, staffUid: STAFF, reason: 'access_review', commandId: 'cmd-abcdefgh' };
assert.equal(removalFingerprint(base), removalFingerprint({ ...base }), 'an exact replay does not reproduce its fingerprint');
for (const altered of [
  { ...base, staffUid: 'staff-2' },
  { ...base, reason: 'security_concern' },
  { ...base, enterpriseUid: 'ent-2' },
  { ...base, commandId: 'cmd-abcdefgi' },
]) {
  assert.notEqual(removalFingerprint(altered), removalFingerprint(base), JSON.stringify(altered));
}
// Length-prefixing: no rearrangement of where one field ends and the next begins can
// collide. Without it, ('ab','c') and ('a','bc') are the same string.
assert.notEqual(
  removalFingerprint({ enterpriseUid: 'ab', staffUid: 'c', reason: 'access_review', commandId: 'cmd-abcdefgh' }),
  removalFingerprint({ enterpriseUid: 'a', staffUid: 'bc', reason: 'access_review', commandId: 'cmd-abcdefgh' }),
);
ok('an exact replay reproduces the fingerprint; four alterations and a boundary-shift collision do not');

// ---- CLOSED VOCABULARIES --------------------------------------------------------------
for (const reason of REMOVAL_REASONS) assert.equal(isRemovalReason(reason), true, reason);
for (const bad of ['', '  ', 'Access_Review', 'ACCESS_REVIEW', 'because', null, undefined, 42, {}, ['access_review']]) {
  assert.equal(isRemovalReason(bad), false, JSON.stringify(bad));
}
for (const bad of ['', 'short', 'a'.repeat(65), 'has space', 'has/slash', 'has..dots', null, undefined, 42, {}]) {
  assert.equal(isValidCommandId(bad), false, JSON.stringify(bad));
}
for (const good_ of ['cmd-abcdefgh', 'A'.repeat(64), '12345678', 'a_b-c_d1']) {
  assert.equal(isValidCommandId(good_), true, good_);
}
ok(`${REMOVAL_REASONS.length} removal reasons accepted, 9 rejected including case variants; command ids bounded to 8-64 safe characters`);

console.log(`✅ enterprise membership registry: ${checks} adversarial blocks passed.`);
