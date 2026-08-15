// ==========================================
// FILE: functions/src/appCheckCommissioning.test.ts
// Run: node lib/appCheckCommissioning.test.js
//
// Every branch of the App Check port, including the enforced branch that this deployment
// does not yet use. Testing only the branch that currently runs would leave the one that
// matters — enforcement — unproved until the day it is switched on.
// ==========================================
import assert from 'node:assert/strict';
import {
  APP_CHECK_DECISIONS, COMMISSIONING_STAGE, COMMISSIONING_STAGES, EXPECTED_PROJECT_ID,
  REQUIRED_IN_PRODUCTION, commissioningReadiness, createReplayMemory, decideAppCheck,
  type AppCheckEvidence,
} from './appCheckCommissioning.js';

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };

const NOW = 1_800_000_000;
const valid = (over: Partial<AppCheckEvidence> = {}): AppCheckEvidence => ({
  appId: 'app-1', projectId: EXPECTED_PROJECT_ID,
  issuedAt: NOW - 60, expiresAt: NOW + 1800, tokenId: 'tok-1', ...over,
});

// ---- the declared posture ----------------------------------------------------------
check('App Check is REQUIRED in production and the current stage says so honestly', () => {
  assert.equal(REQUIRED_IN_PRODUCTION, true, 'the production requirement must not be softened');
  assert.equal(COMMISSIONING_STAGE, 'not_provisioned',
    'the stage must state what is actually true; claiming enforcement without a provider is a fabricated production state');
  const readiness = commissioningReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.length >= 2);
  assert.ok(readiness.blockers.some((b) => /operator action required/.test(b)));
  // And a fully commissioned deployment reports ready — so `ready:false` is a state, not a
  // function that always says no.
  assert.equal(commissioningReadiness('enforced').ready, true);
  assert.deepEqual(commissioningReadiness('enforced').blockers, []);
});

// ---- ABSENT evidence ----------------------------------------------------------------
check('absent evidence is refused under enforcement, and never reported as attested', () => {
  const memory = createReplayMemory();
  for (const absent of [null, undefined, {}, { appId: '' }, { appId: '   ' }]) {
    const decision = decideAppCheck(absent as AppCheckEvidence, 'enforced', memory, NOW);
    assert.equal(decision.ok, false, JSON.stringify(absent));
    assert.equal(decision.unattested, true);
    assert.ok(APP_CHECK_DECISIONS.includes(decision.code), decision.code);
  }
  assert.equal(decideAppCheck(null, 'enforced', memory, NOW).code, 'app_check_required');
});

// ---- INVALID evidence ---------------------------------------------------------------
check('invalid evidence is refused: failed verification, expired, future-dated, malformed', () => {
  const memory = createReplayMemory();
  const cases: Array<[string, AppCheckEvidence]> = [
    ['verification failed', valid({ verificationError: 'jwt malformed' })],
    ['expired', valid({ expiresAt: NOW - 1 })],
    ['expiring exactly now', valid({ expiresAt: NOW })],
    ['minted in the future', valid({ issuedAt: NOW + 3600 })],
    ['no issuedAt', valid({ issuedAt: undefined })],
    ['no expiresAt', valid({ expiresAt: undefined })],
    ['non-numeric times', valid({ issuedAt: 'soon' as never })],
    ['NaN expiry', valid({ expiresAt: NaN })],
    ['Infinity expiry', valid({ expiresAt: Infinity })],
    ['blank project', valid({ projectId: '' })],
    ['non-string project', valid({ projectId: 42 as never })],
    ['blank token id', valid({ tokenId: '' })],
    ['non-string token id', valid({ tokenId: {} as never })],
  ];
  for (const [label, evidence] of cases) {
    const decision = decideAppCheck(evidence, 'enforced', memory, NOW);
    assert.equal(decision.ok, false, label);
    assert.ok(['app_check_invalid', 'app_check_required'].includes(decision.code), `${label} → ${decision.code}`);
  }
});

// ---- REPLAYED evidence ---------------------------------------------------------------
check('a replayed token is refused the second time, and replay memory is mandatory', () => {
  const memory = createReplayMemory();
  const first = decideAppCheck(valid(), 'enforced', memory, NOW);
  assert.equal(first.ok, true, first.code);
  const second = decideAppCheck(valid(), 'enforced', memory, NOW);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'app_check_replayed');
  // A DIFFERENT token still works, so this is replay detection and not a one-shot fuse.
  assert.equal(decideAppCheck(valid({ tokenId: 'tok-2' }), 'enforced', memory, NOW).ok, true);
  // Without replay memory, enforcement cannot honestly be claimed, so it refuses.
  assert.equal(decideAppCheck(valid({ tokenId: 'tok-3' }), 'enforced', undefined, NOW).code, 'app_check_invalid');
});

// ---- MISMATCHED PROJECT ---------------------------------------------------------------
check('evidence minted for another project is refused', () => {
  const memory = createReplayMemory();
  for (const projectId of ['golfriend-v1', 'some-other-project', 'GOLFRIEND-V2', `${EXPECTED_PROJECT_ID}-staging`]) {
    const decision = decideAppCheck(valid({ projectId }), 'enforced', memory, NOW);
    assert.equal(decision.ok, false, projectId);
    assert.equal(decision.code, 'app_check_project_mismatch', projectId);
  }
  // Exact match is required; the correct project passes.
  assert.equal(decideAppCheck(valid({ tokenId: 'tok-ok' }), 'enforced', memory, NOW).ok, true);
});

// ---- VALID evidence --------------------------------------------------------------------
check('valid evidence is allowed and reported as attested', () => {
  const memory = createReplayMemory();
  const decision = decideAppCheck(valid(), 'enforced', memory, NOW);
  assert.equal(decision.ok, true);
  assert.equal(decision.code, 'allowed');
  assert.equal(decision.unattested, false, 'a verified request must not be reported as unattested');
});

// ---- STAGE BEHAVIOUR --------------------------------------------------------------------
check('the current stage refuses rather than pretending, and monitoring does not block', () => {
  const memory = createReplayMemory();
  // NOT PROVISIONED + required in production → an explicit refusal, never a silent allow.
  const current = decideAppCheck(valid(), COMMISSIONING_STAGE, memory, NOW);
  assert.equal(current.ok, false);
  assert.equal(current.code, 'app_check_not_provisioned');
  assert.equal(current.unattested, true);
  // MONITORING accepts, but truthfully reports an unattested request as unattested.
  assert.equal(decideAppCheck(null, 'monitoring', memory, NOW).ok, true);
  assert.equal(decideAppCheck(null, 'monitoring', memory, NOW).unattested, true);
  assert.equal(decideAppCheck(valid({ tokenId: 'mon-1' }), 'monitoring', memory, NOW).unattested, false);
  // An unrecognized stage fails closed.
  for (const bogus of ['ENFORCED', 'on', '', null, undefined, 1]) {
    assert.equal(decideAppCheck(valid(), bogus as never, memory, NOW).ok, false, String(bogus));
  }
  assert.equal(COMMISSIONING_STAGES.length, 3);
});

// ---- NOTHING IS FABRICATED --------------------------------------------------------------
check('the port cannot report a commissioned state that does not exist', () => {
  // There is no input to decideAppCheck that makes the CURRENT stage allow a request.
  const memory = createReplayMemory();
  const attempts = [null, undefined, {}, valid(), valid({ projectId: EXPECTED_PROJECT_ID })];
  for (const evidence of attempts) {
    assert.equal(decideAppCheck(evidence as AppCheckEvidence, COMMISSIONING_STAGE, memory, NOW).ok, false,
      'the un-provisioned stage allowed a request — that would be a fabricated production state');
  }
  assert.equal(commissioningReadiness(COMMISSIONING_STAGE).ready, false);
});

console.log(`\nappCheckCommissioning: ${passed} checks passed.`);
