import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
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
export const functions = getFunctions(app);
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
