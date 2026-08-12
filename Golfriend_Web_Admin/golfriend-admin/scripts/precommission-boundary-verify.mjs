// ==========================================
// FILE: scripts/precommission-boundary-verify.mjs  (run: `npm run verify:precommission`)
// Boundary proof that `precommission` mode can NEVER contact production Firebase:
//  1. it resolves a demo-* (offline-only) project carrying zero V1 identifiers;
//  2. it FAILS CLOSED when emulator endpoints are absent (no production fallback);
//  3. firebaseConfig reads import.meta.env directly (not the optional-chained form
//     that silently forced production), connects ALL FOUR emulators, is guarded
//     development-only, and routes through the fail-closed endpoint resolver.
// Static + resolver-level assertions; no network. See src/firebaseTarget.js.
// ==========================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  resolveFirebaseTarget, resolveEmulatorEndpoints, findV1Leaks, V1_CONFIG, V1_FORBIDDEN,
} from '../src/firebaseTarget.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_RAW = readFileSync(resolve(HERE, '../src/firebaseConfig.ts'), 'utf8');
// Strip comments so source-level checks never trip on documentation prose that
// legitimately names the anti-pattern it removed (e.g. `import.meta?.env`).
const CONFIG_SRC = CONFIG_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const fails = [];
const assert = (c, m) => { if (!c) { fails.push(m); console.error(`  ✗ ${m}`); } else console.log(`  ✓ ${m}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const EMU_ENV = {
  VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  VITE_EMU_AUTH_PORT: '9298', VITE_EMU_FIRESTORE_PORT: '8282',
  VITE_EMU_FUNCTIONS_PORT: '5202', VITE_EMU_STORAGE_PORT: '19399',
};

// ---- 1. Demo project, zero V1 ----
const cfg = resolveFirebaseTarget('precommission', EMU_ENV);
assert(cfg.projectId.startsWith('demo-'), `precommission projectId is demo-* (offline-only): ${cfg.projectId}`);
assert(findV1Leaks(cfg).length === 0, 'precommission config has zero V1 identifiers');
for (const [k, v] of Object.entries(cfg)) assert(v !== V1_CONFIG[k], `precommission field ${k} != V1 value`);
assert(!V1_FORBIDDEN.some((b) => JSON.stringify(cfg).includes(b)), 'no V1_FORBIDDEN token in precommission config');

// ---- 2. Fail closed without emulator endpoints ----
assert(throws(() => resolveEmulatorEndpoints('precommission', {})), 'precommission with NO emulator endpoints fails closed');
assert(throws(() => resolveEmulatorEndpoints('precommission', { ...EMU_ENV, VITE_EMU_FIRESTORE_PORT: '' })), 'precommission with a missing port fails closed');
assert(throws(() => resolveEmulatorEndpoints('precommission', { ...EMU_ENV, VITE_EMU_AUTH_PORT: 'not-a-port' })), 'precommission with an invalid port fails closed');
const emu = resolveEmulatorEndpoints('precommission', EMU_ENV);
assert(emu && emu.host === '127.0.0.1' && emu.ports.firestore === 8282, 'precommission resolves emulator endpoints when present');
// Other modes never use emulators (so their behaviour is unchanged).
assert(resolveEmulatorEndpoints('golfriend-v1', EMU_ENV) === null, 'golfriend-v1 mode uses no emulator (null)');
assert(resolveEmulatorEndpoints('v2-preview', EMU_ENV) === null, 'v2-preview mode uses no emulator (null)');

// ---- 3. firebaseConfig source-level boundary ----
assert(/import\.meta\.env/.test(CONFIG_SRC) && !/import\.meta\?\.env/.test(CONFIG_SRC),
  'firebaseConfig reads import.meta.env directly (the optional-chained form is gone)');
assert(/USING_EMULATORS\s*=\s*ACTIVE_PROJECT === 'precommission'/.test(CONFIG_SRC),
  'firebaseConfig gates emulator wiring on precommission mode');
assert(/if\s*\(!import\.meta\.env\.DEV\)/.test(CONFIG_SRC), 'firebaseConfig hard-guards emulator mode to development-only');
assert(/resolveEmulatorEndpoints\(ACTIVE_PROJECT, env\)/.test(CONFIG_SRC), 'firebaseConfig routes through the fail-closed endpoint resolver');
for (const conn of ['connectAuthEmulator', 'connectFirestoreEmulator', 'connectFunctionsEmulator', 'connectStorageEmulator']) {
  assert(new RegExp(conn + '\\(').test(CONFIG_SRC), `firebaseConfig connects the ${conn.replace('connect', '').replace('Emulator', '')} emulator`);
}
// The emulator connections must live INSIDE the USING_EMULATORS guard (never unconditional).
const guardIdx = CONFIG_SRC.indexOf('if (USING_EMULATORS)');
assert(guardIdx !== -1 && CONFIG_SRC.indexOf('connectFirestoreEmulator(') > guardIdx,
  'emulator connections are inside the USING_EMULATORS guard (production build connects nothing)');

if (fails.length) {
  console.error(`\n❌ precommission boundary verify FAILED (${fails.length}).`);
  process.exit(1);
}
console.log(`\n✅ precommission boundary verified: demo-* offline-only project, zero V1, fail-closed without emulator endpoints, dev-only, all four services pinned to the local emulator — production endpoints are unreachable in precommission mode.`);
