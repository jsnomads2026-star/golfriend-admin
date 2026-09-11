import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const config=read('src/firebaseConfig.ts');
const hosting=JSON.parse(read('firebase.json'));
const targets=JSON.parse(read('.firebaserc'));
const build=read('scripts/build-v2-admin-production.mjs');
const bundleVerify=read('scripts/v2-admin-bundle-verify.mjs');

assert.match(config,/ReCaptchaEnterpriseProvider/);
assert.match(config,/initializeAppCheck\(app/);
assert.match(config,/VITE_FIREBASE_APPCHECK_SITE_KEY/);
assert.match(config,/ACTIVE_PROJECT === 'v2-preview'/);
assert.match(config,/isTokenAutoRefreshEnabled:\s*true/);
assert.equal(hosting.hosting.target,'admin');
assert.deepEqual(hosting.hosting.predeploy,['npm run build:admin:v2-production']);
assert.deepEqual(targets.projects,{v2:'golfriend-v2-production-2ee34'});
assert.deepEqual(targets.targets['golfriend-v2-production-2ee34'].hosting.admin,['golfriend-v2-admin']);
for(const marker of ['apps:sdkconfig','recaptchaEnterpriseConfig','VITE_FIREBASE_PROJECT','VITE_FIREBASE_APPCHECK_SITE_KEY','V2_APP_CHECK_SITE_KEY_MISSING'])assert.match(build,new RegExp(marker));
for(const marker of ['golfriend-v2-production-2ee34','inspectGolfApiClubRegion','exchangeRecaptchaEnterpriseToken','V2_APP_CHECK_SITE_KEY_MISSING'])assert.match(bundleVerify,new RegExp(marker));
assert.doesNotMatch(config+build,/GOLF_API_KEY|golfapi\.io|Authorization:\s*Bearer/i);
console.log('Admin V2 production boundary PASS: explicit V2 Hosting target, canonical SDK/App Check build injection, reCAPTCHA Enterprise initialization, and Siam-inspector bundle proof.');
