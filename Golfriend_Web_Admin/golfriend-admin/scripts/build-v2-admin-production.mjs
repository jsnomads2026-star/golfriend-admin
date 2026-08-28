import { execFileSync } from 'node:child_process';

const project = 'golfriend-v2-production-2ee34';
const appId = '1:533338463502:web:8a45afed98abc0cdc38b5f';
const firebase = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, options = {}) => execFileSync(command, args, { shell: process.platform === 'win32', ...options });
const config = JSON.parse(run(firebase, ['apps:sdkconfig', 'WEB', appId, '--project', project], { encoding: 'utf8' }));
const env = {
  ...process.env,
  VITE_FIREBASE_PROJECT: 'v2-preview',
  VITE_FIREBASE_V2_API_KEY: config.apiKey,
  VITE_FIREBASE_V2_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_V2_PROJECT_ID: config.projectId,
  VITE_FIREBASE_V2_STORAGE_BUCKET: config.storageBucket,
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: config.messagingSenderId,
  VITE_FIREBASE_V2_APP_ID: config.appId,
};
run(npm, ['run', 'build'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/v2-admin-bundle-verify.mjs'], { env, stdio: 'inherit' });
