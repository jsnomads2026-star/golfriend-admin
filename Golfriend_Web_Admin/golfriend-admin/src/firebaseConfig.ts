import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { resolveFirebaseTarget, resolveEmulatorEndpoints } from './firebaseTarget.js';

// ==========================================
// Firebase target selection (V1 / fail-closed V2 preview / local emulator modes).
// The resolver (src/firebaseTarget.js) is the single, testable swap point:
//  - default 'golfriend-v1' (current project; unchanged — issue #21 governs V2);
//  - 'v2-preview'    builds ONLY from injected VITE_FIREBASE_V2_* identities and
//    FAILS CLOSED (throws) if any are missing/mixed — it never resolves V1;
//  - 'precommission' runs ONLY against the local Firebase emulator suite (a
//    demo-* offline-only project) and FAILS CLOSED if the emulator endpoints are
//    absent — it never falls back to production, and is development-only.
//  - 'partner-authority-local' is an explicit development-only session for the
//    canonical V2 Partner Authority emulator. It fixes the canonical V2 web app,
//    requires all four emulator endpoints, and is rejected in production builds.
// Selected via VITE_FIREBASE_PROJECT (build env); defaults to golfriend-v1 and
// never silently falls through. No component defines its own config.
// ==========================================

// NOTE: read `import.meta.env` directly (NOT `import.meta?.env`) — the optional
// chain prevented Vite from injecting the VITE_* values, which silently forced the
// app onto production golfriend-v1 regardless of VITE_FIREBASE_PROJECT.
const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
const ACTIVE_PROJECT = env.VITE_FIREBASE_PROJECT || 'golfriend-v1';

export const ACTIVE_FIREBASE_PROJECT = ACTIVE_PROJECT;
// All Admin callables, including the externally retained V2 commissioning
// callable, are deployed in the V2 regional endpoint. Keeping this exported
// and unconditional prevents a production-mode fallback to us-central1.
export const FUNCTIONS_REGION = 'asia-southeast1';
export const USING_PARTNER_AUTHORITY_LOCAL = ACTIVE_PROJECT === 'partner-authority-local';
export const USING_EMULATORS = ACTIVE_PROJECT === 'precommission' || USING_PARTNER_AUTHORITY_LOCAL;

// Throws on unknown mode, on a v2-preview with missing/mixed identities, or on a
// precommission config that is not a demo-* / carries a V1 identifier.
const firebaseConfig = resolveFirebaseTarget(ACTIVE_PROJECT, env);

const app = initializeApp(firebaseConfig);

if (USING_PARTNER_AUTHORITY_LOCAL) {
  // This exact mode is development-only. vite.config.ts also refuses to create a
  // production bundle when it is selected, so it cannot become a deployed host.
  if (!import.meta.env.DEV) {
    throw new Error('partner-authority-local is development-only and must never run in a production build or host.');
  }
  const providerKind = env.VITE_PARTNER_AUTHORITY_APPCHECK_PROVIDER;
  const siteKey = env.VITE_PARTNER_AUTHORITY_APPCHECK_SITE_KEY;
  if (!siteKey || !siteKey.trim()) {
    throw new Error('partner-authority-local requires VITE_PARTNER_AUTHORITY_APPCHECK_SITE_KEY; no App Check bypass is available.');
  }
  const provider = providerKind === 'recaptcha-enterprise'
    ? new ReCaptchaEnterpriseProvider(siteKey.trim())
    : providerKind === 'recaptcha-v3'
      ? new ReCaptchaV3Provider(siteKey.trim())
      : null;
  if (!provider) {
    throw new Error('partner-authority-local requires VITE_PARTNER_AUTHORITY_APPCHECK_PROVIDER to be recaptcha-enterprise or recaptcha-v3.');
  }
  // Firebase's official web Debug Provider switch. `true` causes the SDK to
  // generate a browser-local debug token before App Check initialisation; it is
  // never supplied by source, Vite environment, UI, or a callable request.
  (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

// Development-only emulator wiring. All four services are pinned to the local
// emulator; there is no production endpoint in either local mode.
if (USING_EMULATORS) {
  // Hard guard: emulator modes must never run in a production build.
  if (!import.meta.env.DEV) {
    throw new Error(
      `${ACTIVE_PROJECT} (emulator) mode is development-only and must never run in a production build.`,
    );
  }
  // Fails closed if any emulator endpoint is missing — never a production fallback.
  const emu = resolveEmulatorEndpoints(ACTIVE_PROJECT, env)!;
  connectAuthEmulator(auth, `http://${emu.host}:${emu.ports.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emu.host, emu.ports.firestore);
  connectFunctionsEmulator(functions, emu.host, emu.ports.functions);
  connectStorageEmulator(storage, emu.host, emu.ports.storage);
}
