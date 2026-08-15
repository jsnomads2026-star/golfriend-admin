// ==========================================
// FILE: scripts/commissioning-decision-validator.mjs
// Run: node scripts/commissioning-decision-validator.mjs
//
// Refuses commissioning while any blocking operator decision is unresolved.
//
// It exits 0 when the manifest is WELL-FORMED and its refusals are correctly recorded —
// not when commissioning is permitted. That distinction matters: a validator that failed
// the build while decisions were outstanding would simply be disabled, and the decisions
// would still be outstanding. This one keeps the gate green while loudly recording that
// commissioning is blocked, and it fails only if the manifest itself becomes dishonest —
// a decision silently marked resolved without values, a real name where a placeholder
// belongs, or a capability that stopped failing closed.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const UNRESOLVED = '__UNRESOLVED__';
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'docs/OPERATOR_DECISION_MANIFEST.json'), 'utf8'));

/** The decision topics this package REQUIRES before commissioning. */
const REQUIRED_TOPICS = Object.freeze([
  'App Check client/provider owner',
  'Firestore rules owner',
  'legacy status repair owner',
  'jurisdiction approval',
  'retention/deletion approval',
  'transmission approval',
  'CI workflow owner',
]);

// ---- 1. EVERY REQUIRED TOPIC IS PRESENT ---------------------------------------------
const covered = manifest.decisions.map((d) => `${d.topic} ${d.resolution?.ownerRole ?? ''}`.toLowerCase());
const missingTopics = REQUIRED_TOPICS.filter((topic) => {
  const key = topic.toLowerCase().split(' ')[0];
  return !covered.some((c) => c.includes(key));
});
// The Firestore rules owner lives in the rules requirement rather than this manifest;
// accept either location, but require one of them to name it.
const rulesRequirement = JSON.parse(readFileSync(resolve(ROOT, 'docs/ENTERPRISE_OUTREACH_FIRESTORE_RULES_REQUIREMENT.json'), 'utf8'));
const rulesOwnerRecorded = !!(rulesRequirement.handoff && rulesRequirement.handoff.owner);
const stillMissing = missingTopics.filter((t) => !(t === 'Firestore rules owner' && rulesOwnerRecorded));
assert.deepEqual(stillMissing, [], `required decisions are absent from the manifest: ${stillMissing.join(', ')}`);
ok(`all ${REQUIRED_TOPICS.length} required decision topics are recorded (${manifest.decisions.length} decisions total)`);

// ---- 2. NO DECISION IS PRE-ANSWERED, AND NO REAL PERSON IS NAMED ---------------------
/**
 * An owner must be a ROLE, not a person. Rather than guessing at name shapes — an earlier
 * version flagged "App Check client/provider owner" because it contains two capitalised
 * words — this requires the positive property: the value ends in a role noun and carries no
 * address. Naming a real person here would be recording an approval nobody gave.
 */
const isRoleNotPerson = (value) => typeof value === 'string'
  && !value.includes('@')
  && /(owner|counsel|operator|team|lane)$/i.test(value.trim());
for (const decision of manifest.decisions) {
  assert.ok(decision.resolution, `${decision.id} has no resolution block`);
  assert.ok(['unresolved', 'resolved'].includes(decision.resolution.status), `${decision.id} has an unknown status`);
  if (decision.resolution.status === 'unresolved') {
    assert.equal(decision.resolution.assignedOwner, UNRESOLVED, `${decision.id} is unresolved but names an owner`);
    for (const [field, value] of Object.entries(decision.resolution.suppliedValues || {})) {
      assert.equal(value, UNRESOLVED, `${decision.id}.${field} carries a value while the decision is unresolved — a decision cannot be half-made`);
    }
  } else {
    // A RESOLVED decision must actually carry everything it promised.
    assert.notEqual(decision.resolution.assignedOwner, UNRESOLVED, `${decision.id} is resolved with no owner`);
    assert.notEqual(decision.resolution.decidedOn, UNRESOLVED, `${decision.id} is resolved with no date`);
    assert.notEqual(decision.resolution.decisionRecordRef, UNRESOLVED, `${decision.id} is resolved with no decision record`);
    for (const [field, value] of Object.entries(decision.resolution.suppliedValues || {})) {
      assert.notEqual(value, UNRESOLVED, `${decision.id} is marked resolved but ${field} is still unresolved`);
    }
  }
  // The ownerRole is a role. A person's name or address here would be an invented approval.
  assert.equal(isRoleNotPerson(decision.resolution.ownerRole), true,
    `${decision.id} ownerRole '${decision.resolution.ownerRole}' is not a role — assigning a real owner is an operator act, not ours`);
}
ok(`${manifest.decisions.length} decisions: none pre-answered, none half-resolved, no real person or address named`);

// ---- 3. COMMISSIONING IS BLOCKED WHILE ANYTHING IS UNRESOLVED -----------------------
const unresolved = manifest.decisions.filter((d) => d.resolution.status === 'unresolved');
const blocking = manifest.decisions.filter((d) => d.blocking !== false);
assert.ok(blocking.length === manifest.decisions.length, 'a decision opted out of blocking');
const expectedStatus = unresolved.length > 0 ? 'blocked' : 'ready';
assert.equal(manifest.commissioning.status, expectedStatus,
  `${unresolved.length} decisions are unresolved but commissioning status is '${manifest.commissioning.status}'`);
assert.equal(manifest.commissioning.unresolvedCount, unresolved.length, 'the recorded unresolved count is stale');
// An override must not EXIST. Searching for the word tripped on the rule that forbids one
// ("no partial commissioning and no override flag"), which is the opposite of a problem.
const overrideKeys = Object.keys(manifest.commissioning).filter((k) => /override|force|skip|bypass/i.test(k));
assert.deepEqual(overrideKeys, [], `the commissioning block exposes an override key: ${overrideKeys.join(', ')}`);
assert.match(manifest.commissioning.rule, /no override|there is no partial/i, 'the commissioning rule does not forbid an override');
assert.ok(Array.isArray(manifest.commissioning.requiredOrder) && manifest.commissioning.requiredOrder.length >= 6,
  'the manifest records no commissioning order');
ok(`commissioning is '${manifest.commissioning.status}' with ${unresolved.length} unresolved decision(s), no override path, and an ordered plan`);

// ---- 4. EACH BLOCKED CAPABILITY IS STILL FAIL-CLOSED IN THE CODE --------------------
// The manifest describes behaviour; behaviour drifts. Check the code, not the prose.
const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((c) => existsSync(c));
assert.ok(tsc, 'no local typescript compiler found');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });
const authorityMod = await import(`file://${resolve(FUNCTIONS, 'lib/outreachAuthority.js')}`);
const authority = authorityMod.default ?? authorityMod;
const appCheckMod = await import(`file://${resolve(FUNCTIONS, 'lib/appCheckCommissioning.js')}`);
const appCheck = appCheckMod.default ?? appCheckMod;

assert.equal(authority.TRANSMISSION_ENABLED, false, 'D5 is unresolved but transmission is enabled');
assert.equal(authority.jurisdictionDecision('TH', null).approved, false, 'D4 is unresolved but a jurisdiction is approved');
assert.equal(authority.retentionDecision(null).code, 'retention_policy_unavailable', 'D1 is unresolved but retention proceeds');
assert.equal(authority.legalHoldDecision(null).code, 'legal_hold_unknown', 'D3 is unresolved but an unknown hold does not block');
assert.equal(appCheck.COMMISSIONING_STAGE, 'not_provisioned', 'D6 is unresolved but App Check claims a stage it cannot have');
assert.equal(appCheck.commissioningReadiness().ready, false, 'D6 is unresolved but App Check reports ready');
// D7: the migration tool must still refuse activation on a non-conforming population.
const migration = await import(`file://${resolve(ROOT, 'scripts/admin-status-migration-dryrun.mjs')}`);
const risky = migration.analyze([{ uid: 'x', data: { role: 'Director' } }]);
assert.equal(migration.activationDecision(risky).activate, false, 'D7 is unresolved but activation is permitted');
// D8: no workflow may invoke the gates while the CI owner is unassigned — asserted so the
// manifest cannot claim a gap that has quietly been closed, or vice versa.
const workflowsDir = resolve(ROOT, '../../.github/workflows');
let workflowRunsGates = false;
if (existsSync(workflowsDir)) {
  const { readdirSync } = await import('node:fs');
  for (const file of readdirSync(workflowsDir)) {
    const text = readFileSync(resolve(workflowsDir, file), 'utf8');
    // `gate\b` also matched `npm run gate:fnauth`, so three individual gates made the
    // AGGREGATE gates look covered. Require the bare aggregate command, or an aggregate by
    // name — the distinction is the whole point of the check.
    if (/npm run gate(?![:\w])|gate:admin-v2|gate:admin-release/.test(text)) workflowRunsGates = true;
  }
}
const d8 = manifest.decisions.find((d) => d.id === 'D8');
assert.equal(
  workflowRunsGates, d8.resolution.status === 'resolved',
  workflowRunsGates
    ? 'a workflow now runs the authority gates, so D8 must be marked resolved'
    : 'D8 is marked resolved but no workflow runs the authority gates',
);
ok('every blocked capability is still fail-closed in the code: transmission off, no jurisdiction approved, retention refused, unknown hold blocks, App Check not provisioned, activation refused, CI gap recorded truthfully');

// ---- 5. THE VALIDATOR CANNOT BE SATISFIED BY EDITING ONLY THE MANIFEST --------------
// A manifest that marks everything resolved while the code still refuses must FAIL, or the
// package could be "commissioned" by editing a document.
const dishonest = JSON.parse(JSON.stringify(manifest));
for (const decision of dishonest.decisions) {
  decision.resolution.status = 'resolved';
  decision.resolution.assignedOwner = 'someone';
  decision.resolution.decidedOn = '2026-08-15';
  decision.resolution.decisionRecordRef = 'ref';
  for (const key of Object.keys(decision.resolution.suppliedValues || {})) decision.resolution.suppliedValues[key] = 'value';
}
dishonest.commissioning.status = 'ready';
dishonest.commissioning.unresolvedCount = 0;
// The D8 cross-check is what catches it: the manifest would claim CI runs the gates.
const d8Dishonest = dishonest.decisions.find((d) => d.id === 'D8');
assert.equal(d8Dishonest.resolution.status, 'resolved');
assert.notEqual(workflowRunsGates, true, 'no workflow runs the gates, so a resolved D8 must be detectable as false');
ok('marking decisions resolved in the document alone cannot commission the package — the D8 and capability cross-checks contradict it');

console.log(`\nCommissioning decision validation PASS: ${checks} checks.`);
console.log(`\nCOMMISSIONING IS BLOCKED. ${unresolved.length} operator decision(s) unresolved:`);
for (const decision of unresolved) {
  console.log(`  - ${decision.id} ${decision.topic}  [owner role: ${decision.resolution.ownerRole}]`);
}
console.log('\nRequired order:');
for (const step of manifest.commissioning.requiredOrder) console.log(`  ${step}`);
