import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { resolveFirebaseTarget, resolveEmulatorEndpoints } from './firebaseTarget.js';

// ==========================================
// Firebase target selection (fail-closed V2 / precommission emulator).
// The resolver (src/firebaseTarget.js) is the single, testable swap point:
//  - 'v2-preview'    builds ONLY from injected VITE_FIREBASE_V2_* identities and
//    FAILS CLOSED (throws) if any are missing/mixed — there is no fallback;
//  - 'precommission' runs ONLY against the local Firebase emulator suite (a
//    demo-* offline-only project) and FAILS CLOSED if the emulator endpoints are
//    absent — it never falls back to production, and is development-only.
// Selected via VITE_FIREBASE_PROJECT (build env); it is mandatory for production
// builds and never silently falls through. No component defines its own config.
// ==========================================

// NOTE: read `import.meta.env` directly (NOT `import.meta?.env`) — the optional
// chain prevented Vite from injecting the VITE_* values, which could otherwise
// hide a missing required build-time target.
const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
const ACTIVE_PROJECT = env.VITE_FIREBASE_PROJECT;

if (!ACTIVE_PROJECT) {
  throw new Error('VITE_FIREBASE_PROJECT is required; the Admin app has no Firebase fallback.');
}

export const ACTIVE_FIREBASE_PROJECT = ACTIVE_PROJECT;
export const USING_EMULATORS = ACTIVE_PROJECT === 'precommission';

// Throws on an absent/unknown mode, on a v2-preview with missing/mixed identities,
// or on a precommission config that is not a demo-* / carries a legacy identifier.
const firebaseConfig = resolveFirebaseTarget(ACTIVE_PROJECT, env);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
// Callables are REGIONAL: the SDK builds the endpoint from this value, and a
// mismatch surfaces as "function not found" rather than as a configuration error.
// V1's callables answer in us-central1 (the SDK default, which is why no region was
// needed before). Every function deployed to the V2 project is asia-southeast1, so
// the region has to follow the resolved target rather than the SDK default.
const FUNCTIONS_REGION = ACTIVE_PROJECT === 'v2-preview' ? 'asia-southeast1' : 'us-central1';
export const ACTIVE_FUNCTIONS_REGION = FUNCTIONS_REGION;
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

// Development-only precommission emulator wiring. All four services are pinned to
// the local emulator; there is no production endpoint in this mode.
if (USING_EMULATORS) {
  // Hard guard: precommission/emulator mode must never run in a production build.
  if (!import.meta.env.DEV) {
    throw new Error(
      'precommission (emulator) mode is development-only and must never run in a production build.',
    );
  }
  // Fails closed if any emulator endpoint is missing — never a production fallback.
  const emu = resolveEmulatorEndpoints(ACTIVE_PROJECT, env)!;
  connectAuthEmulator(auth, `http://${emu.host}:${emu.ports.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emu.host, emu.ports.firestore);
  connectFunctionsEmulator(functions, emu.host, emu.ports.functions);
  connectStorageEmulator(storage, emu.host, emu.ports.storage);
}
