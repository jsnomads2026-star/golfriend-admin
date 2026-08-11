import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// ==========================================
// Firebase target abstraction (V1/V2 swap point).
// The app currently runs against the golfriend-v1 project. Per issue #21, no
// provider project may be created/changed here yet — this only ABSTRACTS the
// config so a future V2 migration is a single, auditable change:
//   1) add a 'golfriend-v2' entry below once that provider project exists, and
//   2) set ACTIVE_PROJECT (or the VITE_FIREBASE_PROJECT build env) to it.
// No component defines its own config — they all import db/auth/storage here.
// ==========================================

type FirebaseTarget = {
  apiKey: string;        // public Firebase Web API key (non-secret by design)
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const FIREBASE_PROJECTS: Record<string, FirebaseTarget> = {
  'golfriend-v1': {
    apiKey: 'AIzaSyDdcu6nWK4_wFqeuqZ5HodZ8GhLiLmIOYY',
    authDomain: 'golfriend-v1.firebaseapp.com',
    projectId: 'golfriend-v1',
    storageBucket: 'golfriend-v1.firebasestorage.app',
    messagingSenderId: '368292182099',
    appId: '1:368292182099:web:986581e047a7e2ee2ceea6',
  },
  // 'golfriend-v2': { ... }  // TODO(issue #21): populate when the V2 provider
  // project is provisioned. Do NOT create/point at a new provider project now.
};

// Single swap point. A build may override via VITE_FIREBASE_PROJECT without a
// code change, but it defaults to golfriend-v1 and never silently falls through.
const ACTIVE_PROJECT =
  ((import.meta as any)?.env?.VITE_FIREBASE_PROJECT as string | undefined) || 'golfriend-v1';

const firebaseConfig = FIREBASE_PROJECTS[ACTIVE_PROJECT];
if (!firebaseConfig) {
  throw new Error(
    `Unknown Firebase target "${ACTIVE_PROJECT}". Add it to FIREBASE_PROJECTS (see issue #21) before selecting it.`,
  );
}

export const ACTIVE_FIREBASE_PROJECT = ACTIVE_PROJECT;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
