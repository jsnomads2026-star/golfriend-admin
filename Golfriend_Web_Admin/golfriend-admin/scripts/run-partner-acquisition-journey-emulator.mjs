// Runner for the partner acquisition journey acceptance.
//
// Starts ONE isolated emulator data plane (Auth + Firestore + Functions + Storage) on bounded
// ports against a demo project, runs the journey, and always tears the emulators down —
// emulators:exec guarantees the shutdown even when the script fails.
//
// Two environment settings are required and are explained where they are set below.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';

const env = {
  ...process.env,
  CI: 'true',
  GOLFRIEND_LOCAL_AUTH_FIXTURES: 'enabled',
  // Transient, generated per run, never persisted or reused.
  GOLFRIEND_LOCAL_E2E_PASSWORD: process.env.GOLFRIEND_LOCAL_E2E_PASSWORD || `transient-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
  // The Functions emulator DOES enforce enforceAppCheck. It cannot verify a real App Check
  // signature locally, so the framework's documented emulator path is used: the attestation is
  // decoded rather than verified. Presence enforcement stays real — the harness proves that a
  // call with no attestation header is still denied.
  FIREBASE_DEBUG_MODE: 'true',
  FIREBASE_DEBUG_FEATURES: JSON.stringify({skipTokenVerification: true}),
  // firebase-tools' emulator proxy .bind()s admin.firestore, which drops FieldValue/Timestamp.
  // See scripts/emulator-admin-namespace-shim.cjs — a tooling workaround, not product code.
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : ''}--require ${path.join(root, 'scripts', 'emulator-admin-namespace-shim.cjs').split(path.sep).join('/')}`,
};

const result = spawnSync(
  runner,
  ['emulators:exec', '--config', 'firebase.partner-acceptance.json', '--project', 'demo-partner-acquisition',
    '--only', 'auth,firestore,functions,storage', 'node scripts/partner-acquisition-journey-emulator.mjs'],
  {cwd: root, env, stdio: 'inherit', shell: true},
);

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
