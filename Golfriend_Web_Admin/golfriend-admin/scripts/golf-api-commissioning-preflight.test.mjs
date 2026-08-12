import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateGolfApiPreflight } from './golf-api-commissioning-preflight-core.mjs';

const ready = {
  nodeVersion: 'v20.20.2', project: 'golfriend-v2', stage: 'emulator', mode: 'preview',
  functionsHost: '127.0.0.1:5001', firestoreHost: 'localhost:8080', billingEnabled: true,
  secretManagerApi: true, secretContainer: true, distinctCredentialVersion: true, emulatorCredentialName: true,
};
const check = (input, name) => evaluateGolfApiPreflight(input).checks.find((item) => item.name === name);

assert.equal(evaluateGolfApiPreflight(ready).overall, 'PASS');
assert.equal(evaluateGolfApiPreflight(ready).productionWrites, 0);
assert.equal(check({ ...ready, nodeVersion: 'v24.18.0' }, 'node20').status, 'BLOCKED');
assert.equal(check({ ...ready, project: undefined }, 'explicitProject').status, 'BLOCKED');
assert.equal(check({ ...ready, project: 'golfriend-v1' }, 'explicitProject').status, 'BLOCKED');
assert.equal(check({ ...ready, mode: 'apply' }, 'previewOnly').status, 'BLOCKED');
assert.equal(check({ ...ready, mode: 'production' }, 'previewOnly').status, 'BLOCKED');
assert.equal(check({ ...ready, functionsHost: 'cloudfunctions.net:443' }, 'loopbackEmulators').status, 'BLOCKED');
assert.equal(check({ ...ready, firestoreHost: 'firestore.googleapis.com:443' }, 'loopbackEmulators').status, 'BLOCKED');
assert.equal(evaluateGolfApiPreflight({ ...ready, stage: 'synthetic' }).evidenceType.startsWith('synthetic preview'), true);
assert.equal(evaluateGolfApiPreflight(ready).evidenceType.startsWith('emulator preview'), true);
assert.equal(evaluateGolfApiPreflight({ ...ready, stage: 'live' }).evidenceType.startsWith('founder-authorized live read-only preview'), true);
assert.equal(check({ ...ready, stage: 'live' }, 'founderAuthorization').status, 'BLOCKED');
assert.equal(check({ ...ready, stage: 'live', founderAuthorized: true }, 'founderAuthorization').status, 'PASS');
assert.equal(evaluateGolfApiPreflight({ ...ready, billingEnabled: false }).b3Status, 'BLOCKED');
assert.equal(evaluateGolfApiPreflight({ ...ready, distinctCredentialVersion: false }).b3Status, 'BLOCKED');
assert.deepEqual(evaluateGolfApiPreflight(ready).requiredConfigurationNames,
  ['secretmanager.googleapis.com', 'GOLF_API_KEY', 'FUNCTIONS_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']);
assert.equal(JSON.stringify(evaluateGolfApiPreflight(ready)).includes('secretValue'), false);
const cli = readFileSync(new URL('./golf-api-commissioning-preflight.mjs', import.meta.url), 'utf8');
assert.equal(/secrets['"],\s*['"]versions['"],\s*['"]access/.test(cli), false);
assert.equal(/golfapi\.io|firebase deploy|mode\s*===\s*['"]apply['"]/.test(cli), false);

console.log('golf-api commissioning preflight: 19 deterministic safety checks passed.');
