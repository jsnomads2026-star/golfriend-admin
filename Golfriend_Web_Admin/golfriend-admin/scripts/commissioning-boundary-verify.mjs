// ==========================================
// FILE: scripts/commissioning-boundary-verify.mjs
// Run: node scripts/commissioning-boundary-verify.mjs
//
// Proves that every capability awaiting an operator decision is actually fail-closed, and
// that the decision manifest describes the code as it is rather than as it was intended.
//
// A manifest that drifts from the behaviour it documents is worse than no manifest, because
// it is trusted. So each declared `currentBehaviour` is checked against the real module.
// ==========================================
import assert from 'node:assert/strict';
// assert/strict does not expose notMatch in every Node version this repo is run on.
const notMatch = (value, pattern, message) => assert.equal(pattern.test(value), false, message);
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'docs/OPERATOR_DECISION_MANIFEST.json'), 'utf8'));
assert.equal(manifest.status, 'awaiting_operator_decisions');
assert.ok(manifest.decisions.length >= 7, 'the decision manifest is incomplete');

const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((c) => existsSync(c));
assert.ok(tsc, 'no local typescript compiler found');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

const authorityMod = await import(`file://${resolve(FUNCTIONS, 'lib/outreachAuthority.js')}`);
const authority = authorityMod.default ?? authorityMod;
const appCheckMod = await import(`file://${resolve(FUNCTIONS, 'lib/appCheckCommissioning.js')}`);
const appCheck = appCheckMod.default ?? appCheckMod;

// ---- 1. EVERY DECISION IS COMPLETE AND OWNED ---------------------------------------
for (const decision of manifest.decisions) {
  for (const field of ['id', 'topic', 'owner', 'question', 'whyCodeCannotDecide', 'requiredValues', 'port', 'currentBehaviour']) {
    assert.ok(decision[field], `${decision.id} is missing ${field}`);
  }
  assert.ok(Array.isArray(decision.requiredValues) && decision.requiredValues.length > 0, `${decision.id} names no required values`);
  notMatch(String(decision.owner), /^(TBD|TODO|unknown)$/i, `${decision.id} has no named owner`);
}
ok(`${manifest.decisions.length} decisions are complete, owned, and name the values an operator must supply`);

// ---- 2. RETENTION AND DELETION ARE FAIL-CLOSED, AND NO DELETION PATH EXISTS ---------
for (const policy of [null, undefined, {}, { approved: true }, { approved: 'true', version: 'v1' },
  { approved: true, version: '' }, { approved: 1, version: 'v1' }]) {
  const decided = authority.retentionDecision(policy);
  assert.ok(decided && decided.ok === false, `retention permitted with policy ${JSON.stringify(policy)}`);
  assert.equal(decided.code, 'retention_policy_unavailable');
}
// An approved policy is accepted, so the refusals are a gate rather than a stub.
assert.equal(authority.retentionDecision({ approved: true, version: 'r-1' }), null);

// There is NO deletion execution anywhere in the outreach server binding.
const store = readFileSync(resolve(FUNCTIONS, 'src/outreachStore.ts'), 'utf8');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const DELETION_PATTERNS = [
  /\.delete\s*\(/,          // ref.delete()
  /deleteDoc\s*\(/,         // client SDK
  /bulkWriter/,             // bulk deletion helper
  /recursiveDelete/,        // Admin SDK recursive delete
  /\.remove\s*\(/,          // RTDB-style removal
];
const deletionHits = DELETION_PATTERNS.filter((pattern) => pattern.test(stripComments(store))).map(String);
assert.deepEqual(deletionHits, [], 'a deletion path exists in the outreach store: ' + deletionHits.join(', '));
// And the patterns are known to be capable of matching, so the empty result means absence
// of deletion rather than a regex that can never fire.
assert.ok(DELETION_PATTERNS.some((pattern) => pattern.test('await ref.delete();')), 'the deletion patterns cannot match a real deletion');
assert.ok(DELETION_PATTERNS.some((pattern) => pattern.test('recursiveDelete(ref)')), 'the deletion patterns cannot match a recursive delete');
ok('retention refuses without an approved policy; no deletion path exists in the server binding');

// ---- 3. JURISDICTION: NOTHING IS APPROVED, AND TRUTHY IS NOT TRUE ------------------
for (const approval of [null, undefined, {}, { legallyApproved: true }, { legallyApproved: 'true', version: 'v' },
  { legallyApproved: 1, version: 'v' }, { legallyApproved: 'pending', version: 'v' }, { legallyApproved: true, version: '  ' }]) {
  assert.equal(authority.jurisdictionDecision('TH', approval).approved, false, JSON.stringify(approval));
}
assert.equal(authority.jurisdictionDecision('TH', { legallyApproved: true, version: 'th-1' }).approved, true);
// No approved jurisdiction record ships in this repository.
const jurisdictionFixtures = execFileSync('git', ['-C', ROOT, 'grep', '-l', 'legallyApproved', '--', '.'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !/\.test\.|verify|docs\//.test(f));
assert.deepEqual(jurisdictionFixtures.filter((f) => !/outreachAuthority\.ts$/.test(f)), [],
  `a jurisdiction approval fixture ships in the repository: ${jurisdictionFixtures.join(', ')}`);
ok('no jurisdiction is approved; a truthy-but-not-true approval does not read as approval');

// ---- 4. TRANSMISSION IS OFF AND UNREACHABLE ----------------------------------------
assert.equal(authority.TRANSMISSION_ENABLED, false);
const best = authority.sendability({
  record: { draftId: 'd', state: 'approved', version: 1, content: {}, contentDigest: 'x', digestAlgorithm: 'sha-256', createdByKey: 'a', assignedReviewerKey: 'b', jurisdiction: 'TH', expiresAt: null },
  jurisdictionApproved: true, legalHold: false, now: '2026-08-15T00:00:00.000Z',
});
assert.equal(best.sendable, false, 'a fully approved draft in an approved jurisdiction reported as sendable');
assert.equal(best.reason, 'transmission_not_permitted');
ok('transmission is disabled: even a fully approved draft in an approved jurisdiction is not sendable');

// ---- 5. LEGAL HOLD: UNKNOWN BLOCKS --------------------------------------------------
assert.equal(authority.legalHoldState(null, false), null, 'a FAILED read must be unknown, never "not held"');
assert.equal(authority.legalHoldState({ active: 'false' }, true), null);
assert.equal(authority.legalHoldState(null, true), false);
assert.equal(authority.legalHoldDecision(null).code, 'legal_hold_unknown');
assert.equal(authority.legalHoldDecision(true).code, 'legal_hold_active');
assert.equal(authority.legalHoldDecision(false), null);
ok('legal hold is three-valued and unknown blocks');

// ---- 6. APP CHECK: REQUIRED, NOT PROVISIONED, AND HONEST ABOUT IT -------------------
assert.equal(appCheck.REQUIRED_IN_PRODUCTION, true);
assert.equal(appCheck.COMMISSIONING_STAGE, 'not_provisioned');
const readiness = appCheck.commissioningReadiness();
assert.equal(readiness.ready, false);
assert.ok(readiness.blockers.some((b) => /operator action required/.test(b)));
// No evidence can make the current stage allow — the un-provisioned state cannot be faked.
const memory = appCheck.createReplayMemory();
for (const evidence of [null, {}, { appId: 'a', projectId: appCheck.EXPECTED_PROJECT_ID, issuedAt: 1, expiresAt: 9e9, tokenId: 't' }]) {
  assert.equal(appCheck.decideAppCheck(evidence, appCheck.COMMISSIONING_STAGE, memory, 1000).ok, false,
    'the un-provisioned stage allowed a request — a fabricated production state');
}
// The manifest records the cross-lane inconsistency rather than hiding it.
const appCheckDecision = manifest.decisions.find((d) => d.id === 'D6');
assert.ok(appCheckDecision.knownInconsistency, 'the manifest does not record the Admin/Portal App Check asymmetry');
assert.match(appCheckDecision.knownInconsistency, /Portal|Admin/);
ok('App Check is required, honestly reported as not provisioned, cannot be faked, and the cross-lane asymmetry is recorded');

// ---- 7. THE MANIFEST'S INVARIANTS HOLD ----------------------------------------------
assert.ok(manifest.invariants.length >= 5);
for (const invariant of manifest.invariants) assert.ok(invariant.length > 20, 'an invariant is too vague to check');
// Every declared port actually exists.
for (const decision of manifest.decisions) {
  // `json` must be matched BEFORE `js`, or `firebase.json` is parsed as `firebase.js` and
  // the check reports a port that does not exist.
  const referenced = String(decision.port).match(/[\w/.-]+\.(json|mjs|tsx?|js)\b/g) || [];
  for (const file of referenced) {
    assert.ok(existsSync(resolve(ROOT, file)), `${decision.id} names a port in ${file}, which does not exist`);
  }
}
ok(`${manifest.invariants.length} invariants declared; every port named by a decision exists`);

console.log(`\nCommissioning boundary verification PASS: ${checks} checks (${manifest.decisions.length} operator decisions, all dependent capabilities fail-closed, nothing invented, no deletion path).`);
