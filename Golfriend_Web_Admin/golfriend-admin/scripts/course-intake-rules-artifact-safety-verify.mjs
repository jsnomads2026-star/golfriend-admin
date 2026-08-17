import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const firebase = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const artifact = JSON.parse(readFileSync(new URL('../docs/ENTERPRISE_COURSE_INTAKE_RULES_REQUIREMENT.json', import.meta.url), 'utf8'));
const rules = readFileSync(new URL('../enterprise-authority.firestore.rules', import.meta.url), 'utf8');
const indexes = JSON.parse(readFileSync(new URL('../enterprise-authority.firestore.indexes.json', import.meta.url), 'utf8'));
let checks = 0;

assert.equal(artifact.deploymentChanged, false); checks += 1;
assert.deepEqual(firebase.firestore, { rules: 'enterprise-authority.firestore.rules', indexes: 'enterprise-authority.firestore.indexes.json' }); checks += 1;
assert.match(rules, /rules_version = '2'/); checks += 1;
for (const collection of ['enterprise_authority_bindings', 'enterprise_authority_memberships', 'enterprise_authority_grants', 'enterprise_organizations', 'enterprise_authority_receipts', 'enterprise_authority_commands']) {
  assert.match(rules, new RegExp(`match /${collection}/\\{document=\\*\\*\\} \\{ allow read, write: if false; \\}`));
  checks += 1;
}
const collectionRuleLines = rules.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('match /') && !line.startsWith('match /databases/'));
assert.ok(collectionRuleLines.length > 0 && collectionRuleLines.every((line) => line.includes('allow read, write: if false;'))); checks += 1;
assert.deepEqual(indexes, { indexes: [], fieldOverrides: [] }); checks += 1;
const expected = ['enterprise_staff/{enterpriseUid}/members/{staffUid}', 'enterprise_staff_memberships/{staffUid}', 'enterprise_staff_grant_audits/{receiptId}', 'enterprise_staff_removal_audits/{receiptId}'];
assert.deepEqual(artifact.collections.map((row) => row.path), expected); checks += 1;
for (const row of artifact.collections) { assert.equal(row.clientWrite, 'deny'); checks += 1; }
for (const row of artifact.collections.slice(1)) { assert.equal(row.clientRead, 'deny'); checks += 1; }
for (const row of artifact.collections.slice(2)) { assert.equal(row.immutable, true); checks += 1; }
assert.match(artifact.commissioningBlocker, /complete Firestore ruleset/); checks += 1;
console.log(`Course Intake rules artifact safety PASS: ${checks}/${checks}`);
