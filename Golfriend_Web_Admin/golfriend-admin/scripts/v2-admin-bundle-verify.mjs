import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveFirebaseTarget } from '../src/firebaseTarget.js';

const productionEnv = {
  VITE_FIREBASE_V2_API_KEY: process.env.VITE_FIREBASE_V2_API_KEY,
  VITE_FIREBASE_V2_AUTH_DOMAIN: process.env.VITE_FIREBASE_V2_AUTH_DOMAIN,
  VITE_FIREBASE_V2_PROJECT_ID: process.env.VITE_FIREBASE_V2_PROJECT_ID,
  VITE_FIREBASE_V2_STORAGE_BUCKET: process.env.VITE_FIREBASE_V2_STORAGE_BUCKET,
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_V2_MESSAGING_SENDER_ID,
  VITE_FIREBASE_V2_APP_ID: process.env.VITE_FIREBASE_V2_APP_ID,
};
const resolved = resolveFirebaseTarget('v2-preview', productionEnv);
assert.equal(resolved.projectId, 'golfriend-v2-production-2ee34');

const html = readFileSync('dist/index.html', 'utf8');
const asset = html.match(/src="\/(assets\/index-[^"]+\.js)"/)?.[1];
assert.ok(asset, 'ADMIN_BUNDLE_ASSET_MISSING');
const bundle = readFileSync(`dist/${asset}`, 'utf8');

assert.ok(bundle.includes('golfriend-v2-production-2ee34'), 'V2_PRODUCTION_IDENTITY_MISSING');
assert.ok(bundle.includes('asia-southeast1'), 'V2_FUNCTIONS_REGION_MISSING');
console.log('V2 Admin bundle PASS: production identity resolves without the V1 fallback and Functions bind asia-southeast1.');
