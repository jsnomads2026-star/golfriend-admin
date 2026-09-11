import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveFirebaseTarget } from '../src/firebaseTarget.js';

const env={VITE_FIREBASE_V2_API_KEY:process.env.VITE_FIREBASE_V2_API_KEY,VITE_FIREBASE_V2_AUTH_DOMAIN:process.env.VITE_FIREBASE_V2_AUTH_DOMAIN,VITE_FIREBASE_V2_PROJECT_ID:process.env.VITE_FIREBASE_V2_PROJECT_ID,VITE_FIREBASE_V2_STORAGE_BUCKET:process.env.VITE_FIREBASE_V2_STORAGE_BUCKET,VITE_FIREBASE_V2_MESSAGING_SENDER_ID:process.env.VITE_FIREBASE_V2_MESSAGING_SENDER_ID,VITE_FIREBASE_V2_APP_ID:process.env.VITE_FIREBASE_V2_APP_ID};
const resolved=resolveFirebaseTarget('v2-preview',env);
assert.equal(resolved.projectId,'golfriend-v2-production-2ee34');
assert.equal(resolved.appId,'1:533338463502:web:8a45afed98abc0cdc38b5f');
assert.ok(process.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim(),'V2_APP_CHECK_SITE_KEY_MISSING');
const html=readFileSync('dist/index.html','utf8');
const asset=html.match(/src="\/(assets\/index-[^"]+\.js)"/)?.[1];
assert.ok(asset,'ADMIN_BUNDLE_ASSET_MISSING');
const bundle=readFileSync(`dist/${asset}`,'utf8');
for(const marker of ['golfriend-v2-production-2ee34','1:533338463502:web:8a45afed98abc0cdc38b5f','inspectGolfApiClubRegion','exchangeRecaptchaEnterpriseToken',process.env.VITE_FIREBASE_APPCHECK_SITE_KEY])assert.ok(bundle.includes(marker),`ADMIN_BUNDLE_MARKER_MISSING:${marker}`);
console.log(`V2 Admin bundle PASS: ${asset} contains the verified V2 app identity, Siam inspector, and reCAPTCHA Enterprise App Check.`);
