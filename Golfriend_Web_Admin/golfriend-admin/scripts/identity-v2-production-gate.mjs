import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_V2_AUTH_DOMAIN,
  CANONICAL_V2_PROJECT_ID,
  CANONICAL_V2_STORAGE_BUCKET,
  resolveFirebaseTarget,
} from '../src/firebaseTarget.js';

const completeV2 = Object.freeze({
  VITE_FIREBASE_V2_API_KEY: 'public-test-key',
  VITE_FIREBASE_V2_AUTH_DOMAIN: CANONICAL_V2_AUTH_DOMAIN,
  VITE_FIREBASE_V2_PROJECT_ID: CANONICAL_V2_PROJECT_ID,
  VITE_FIREBASE_V2_STORAGE_BUCKET: CANONICAL_V2_STORAGE_BUCKET,
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_V2_APP_ID: '1:123456789012:web:canonicaltest',
});

const production = resolveFirebaseTarget(CANONICAL_V2_PROJECT_ID, completeV2);
assert.equal(production.projectId, CANONICAL_V2_PROJECT_ID);
assert.equal(production.authDomain, CANONICAL_V2_AUTH_DOMAIN);
assert.equal(production.storageBucket, CANONICAL_V2_STORAGE_BUCKET);

assert.throws(
  () => resolveFirebaseTarget('golfriend-v1', completeV2),
  /V1 is not an allowed Admin or Partner Portal target/,
);
assert.throws(
  () => resolveFirebaseTarget(CANONICAL_V2_PROJECT_ID, { ...completeV2, VITE_FIREBASE_V2_PROJECT_ID: 'other-project' }),
  /not the canonical V2 identity/,
);
assert.throws(
  () => resolveFirebaseTarget(CANONICAL_V2_PROJECT_ID, {}),
  /requires injected V2 identities/,
);

const root = path.resolve(import.meta.dirname, '..');
const initializer = fs.readFileSync(path.join(root, 'src/firebaseConfig.ts'), 'utf8');
const firebaserc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
assert.match(initializer, new RegExp(`VITE_FIREBASE_PROJECT \\|\\| '${CANONICAL_V2_PROJECT_ID}'`));
assert.doesNotMatch(initializer, /VITE_FIREBASE_PROJECT \|\| 'golfriend-v1'/);
assert.match(initializer, /getFunctions\(app, 'asia-southeast1'\)/);
assert.equal(firebaserc.projects.default, CANONICAL_V2_PROJECT_ID);

console.log(`PASS: Admin and Partner Portal production target is ${CANONICAL_V2_PROJECT_ID}; V1 is rejected.`);
