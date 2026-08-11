import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { resolveFirebaseTarget } from './firebaseTarget.js';

// ==========================================
// Firebase target selection (V1 / fail-closed V2 preview).
// The resolver (src/firebaseTarget.js) is the single, testable swap point:
//  - default 'golfriend-v1' (current project; unchanged — issue #21 governs V2);
//  - 'v2-preview' builds ONLY from injected VITE_FIREBASE_V2_* identities and
//    FAILS CLOSED (throws) if any are missing/mixed — it never resolves V1.
// Selected via VITE_FIREBASE_PROJECT (build env); defaults to golfriend-v1 and
// never silently falls through. No component defines its own config.
// ==========================================

const env = ((import.meta as any)?.env ?? {}) as Record<string, string | undefined>;
const ACTIVE_PROJECT = env.VITE_FIREBASE_PROJECT || 'golfriend-v1';

export const ACTIVE_FIREBASE_PROJECT = ACTIVE_PROJECT;

// Throws on unknown mode, on a v2-preview with missing identities, or on any
// V1 identifier leaking into a v2-preview config.
const firebaseConfig = resolveFirebaseTarget(ACTIVE_PROJECT, env);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
