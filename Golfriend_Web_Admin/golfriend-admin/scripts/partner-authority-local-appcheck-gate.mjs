// Local Partner Authority App Check boundary verifier. It is static only: it
// neither starts an emulator nor obtains, prints, registers, or validates a
// debug token.
import { readFileSync } from 'node:fs';
import {
  PARTNER_AUTHORITY_LOCAL_CONFIG,
  V1_FORBIDDEN,
  findV1Leaks,
  resolveEmulatorEndpoints,
  resolveFirebaseTarget,
} from '../src/firebaseTarget.js';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const fullEmulatorEnv = {
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_EMU_AUTH_PORT: '9099',
  VITE_EMU_FIRESTORE_PORT: '8080',
  VITE_EMU_FUNCTIONS_PORT: '5001',
  VITE_EMU_STORAGE_PORT: '9199',
};

const config = resolveFirebaseTarget('partner-authority-local', fullEmulatorEnv);
assert(config.projectId === 'golfriend-v2-production-2ee34', 'local mode must use the canonical V2 project');
assert(config.appId === '1:533338463502:web:8a45afed98abc0cdc38b5f', 'local mode must use the canonical V2 web app');
assert(findV1Leaks(config).length === 0, 'local mode must resolve zero V1 identifiers');
assert(!V1_FORBIDDEN.some((id) => JSON.stringify(PARTNER_AUTHORITY_LOCAL_CONFIG).includes(id)), 'fixed local config must contain zero V1 identifiers');
assert(throws(() => resolveEmulatorEndpoints('partner-authority-local', {})), 'local mode must fail closed with no emulator endpoints');
assert(throws(() => resolveEmulatorEndpoints('partner-authority-local', { ...fullEmulatorEnv, VITE_EMU_STORAGE_PORT: '' })), 'local mode must fail closed with a missing Storage endpoint');
assert(throws(() => resolveEmulatorEndpoints('partner-authority-local', { ...fullEmulatorEnv, VITE_FIREBASE_EMULATOR_HOST: 'emulator.example.test' })), 'local mode must reject non-loopback emulator hosts');

const endpoints = resolveEmulatorEndpoints('partner-authority-local', fullEmulatorEnv);
assert(endpoints?.host === '127.0.0.1', 'local mode must use a loopback emulator host');
assert(endpoints?.ports.functions === 5001, 'local mode must pin the Functions emulator port');

const firebaseConfig = read('../src/firebaseConfig.ts');
assert(/USING_PARTNER_AUTHORITY_LOCAL/.test(firebaseConfig), 'firebaseConfig must retain an explicit local-mode guard');
assert(/FIREBASE_APPCHECK_DEBUG_TOKEN\?[^\n]*boolean/.test(firebaseConfig), 'debug switch type must not accept a source-provided token string');
assert(/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*true/.test(firebaseConfig), 'debug switch must be enabled before App Check initialization');
assert(firebaseConfig.indexOf('FIREBASE_APPCHECK_DEBUG_TOKEN') < firebaseConfig.indexOf('initializeAppCheck(app'), 'debug switch must precede initializeAppCheck');
assert(/new ReCaptchaEnterpriseProvider\(siteKey\.trim\(\)\)/.test(firebaseConfig), 'local mode must support Firebase App Check reCAPTCHA Enterprise initialization');
assert(/new ReCaptchaV3Provider\(siteKey\.trim\(\)\)/.test(firebaseConfig), 'local mode must support Firebase App Check reCAPTCHA v3 initialization');
assert(/providerKind === 'recaptcha-enterprise'/.test(firebaseConfig) && /providerKind === 'recaptcha-v3'/.test(firebaseConfig), 'local mode must allow only explicit Firebase App Check provider kinds');
assert(/getFunctions\(app, 'asia-southeast1'\)/.test(firebaseConfig), 'local mode must explicitly select asia-southeast1 Functions');
assert(!/getDownloadURL|X-Firebase-AppCheck|enforceAppCheck\s*:\s*false|FIREBASE_DEBUG_FEATURES/.test(firebaseConfig), 'local mode must not add an App Check or callable bypass');

const viteConfig = read('../vite.config.ts');
assert(/command === 'build' && env\.VITE_FIREBASE_PROJECT === 'partner-authority-local'/.test(viteConfig), 'Vite must reject a production build of local mode');

const firebaserc = read('../.firebaserc');
assert(/"default"\s*:\s*"golfriend-v1"/.test(firebaserc), 'Portal default deploy target must remain V1');
assert(!firebaserc.includes('golfriend-v2-production-2ee34'), 'local V2 identity must not be added as a deploy target');

console.log('✅ Partner Authority local App Check gate passed: fixed V2 web identity, loopback-only four-service emulator wiring, App Check Debug Provider switch, explicit asia-southeast1 Functions region, no bypass, and production-build rejection.');
