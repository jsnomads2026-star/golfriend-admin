import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { CustomProvider, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { resolveFirebaseTarget, resolveEmulatorEndpoints } from './firebaseTarget.js';

// ==========================================
// Firebase target selection (V1 / fail-closed V2 preview / precommission emulator).
// The resolver (src/firebaseTarget.js) is the single, testable swap point:
//  - default 'golfriend-v1' (current project; unchanged — issue #21 governs V2);
//  - 'v2-preview'    builds ONLY from injected VITE_FIREBASE_V2_* identities and
//    FAILS CLOSED (throws) if any are missing/mixed — it never resolves V1;
//  - 'precommission' runs ONLY against the local Firebase emulator suite (a
//    demo-* offline-only project) and FAILS CLOSED if the emulator endpoints are
//    absent — it never falls back to production, and is development-only.
// Selected via VITE_FIREBASE_PROJECT (build env); defaults to golfriend-v1 and
// never silently falls through. No component defines its own config.
// ==========================================

// NOTE: read `import.meta.env` directly (NOT `import.meta?.env`) — the optional
// chain prevented Vite from injecting the VITE_* values, which silently forced the
// app onto production golfriend-v1 regardless of VITE_FIREBASE_PROJECT.
const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
const ACTIVE_PROJECT = env.VITE_FIREBASE_PROJECT || 'golfriend-v1';

export const ACTIVE_FIREBASE_PROJECT = ACTIVE_PROJECT;
export const USING_EMULATORS = ACTIVE_PROJECT === 'precommission';

// Throws on unknown mode, on a v2-preview with missing/mixed identities, or on a
// precommission config that is not a demo-* / carries a V1 identifier.
const firebaseConfig = resolveFirebaseTarget(ACTIVE_PROJECT, env);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
// V2 callables are deployed in asia-southeast1. Keep the existing V1 default
// unchanged, but never let a v2-preview Admin build silently use us-central1.
const FUNCTIONS_REGION = ACTIVE_PROJECT === 'v2-preview' ? 'asia-southeast1' : 'us-central1';
export const ACTIVE_FUNCTIONS_REGION = FUNCTIONS_REGION;
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

// ==========================================
// App Check attestation.
//
// Callables that enforce App Check (the Golf API calibration controls among them)
// reject any call from a build with no attestation. The site key is a PUBLIC,
// non-secret value supplied at build time as VITE_FIREBASE_APPCHECK_SITE_KEY.
//
// This FAILS CLOSED in both directions and never lies about its state: with no site
// key we do not initialize a provider and `APP_CHECK_ACTIVE` stays false, so the
// surfaces that require attestation disable themselves rather than issuing calls that
// the server will reject. We never substitute a stand-in provider outside the
// development-only emulator branch below — doing so would claim an attestation that
// does not exist.
// ==========================================
const APP_CHECK_SITE_KEY = (env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
let appCheckActive = false;
if (!USING_EMULATORS && APP_CHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: ACTIVE_PROJECT === 'v2-preview'
      ? new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
      : new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckActive = true;
}
/** True only when a real attestation provider is installed for this build. */
export const APP_CHECK_ACTIVE = appCheckActive || USING_EMULATORS;

// Development-only precommission emulator wiring. All four services are pinned to
// the local emulator; there is no production endpoint in this mode.
if (USING_EMULATORS) {
  // Hard guard: precommission/emulator mode must never run in a production build.
  if (!import.meta.env.DEV) {
    throw new Error(
      'precommission (emulator) mode is development-only and must never run in a production build.',
    );
  }
  // Local attestation is non-secret and exists only inside this development-only
  // branch. Auth and server role projection remain independently mandatory.
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => Promise.resolve({ token: 'local-emulator-attestation', expireTimeMillis: Date.now() + 60 * 60 * 1000 }),
    }),
    isTokenAutoRefreshEnabled: false,
  });
  // Fails closed if any emulator endpoint is missing — never a production fallback.
  const emu = resolveEmulatorEndpoints(ACTIVE_PROJECT, env)!;
  connectAuthEmulator(auth, `http://${emu.host}:${emu.ports.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emu.host, emu.ports.firestore);
  connectFunctionsEmulator(functions, emu.host, emu.ports.functions);
  connectStorageEmulator(storage, emu.host, emu.ports.storage);
}
