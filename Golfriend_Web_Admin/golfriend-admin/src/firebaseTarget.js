// ==========================================
// FILE: src/firebaseTarget.js  (ESM — imported by firebaseConfig.ts AND by the
// executable gate/tests in scripts/, so the SAME resolution logic is verified.)
// Fail-closed Firebase target resolution with an explicit fail-closed
// `v2-preview` mode that must NEVER resolve any golfriend-v1 identity/target.
// ==========================================

/** The current V1 project config (public web keys are non-secret by design). */
export const V1_CONFIG = {
  apiKey: 'AIzaSyDdcu6nWK4_wFqeuqZ5HodZ8GhLiLmIOYY',
  authDomain: 'golfriend-v1.firebaseapp.com',
  projectId: 'golfriend-v1',
  storageBucket: 'golfriend-v1.firebasestorage.app',
  messagingSenderId: '368292182099',
  appId: '1:368292182099:web:986581e047a7e2ee2ceea6',
};

/**
 * Substrings that identify the V1 project. A `v2-preview` config that contains
 * ANY of these is a mixed/leaked V1 resolution and is rejected (zero-V1 rule).
 * Also covers the `.firebaserc` deploy alias and hosting/functions target.
 */
export const V1_FORBIDDEN = [
  'golfriend-v1',            // projectId / authDomain / storageBucket / deploy alias / hosting site
  '368292182099',           // V1 messagingSenderId / appId sender
  '986581e047a7e2ee2ceea6', // V1 appId suffix
];

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

/** Non-empty string guard. */
function present(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Resolve the Firebase config for a mode.
 *  - 'golfriend-v1'  → the V1 config.
 *  - 'v2-preview'    → built ONLY from injected env (VITE_FIREBASE_V2_*). Fails
 *                      closed if any identity is missing/empty (never falls back
 *                      to V1) or if any field carries a V1 identifier (mixed).
 *  - anything else   → throws.
 * @param {string} mode
 * @param {Record<string,string|undefined>} [env]
 * @returns {{apiKey:string,authDomain:string,projectId:string,storageBucket:string,messagingSenderId:string,appId:string}}
 */
export function resolveFirebaseTarget(mode, env = {}) {
  if (mode === 'golfriend-v1') {
    return { ...V1_CONFIG };
  }

  if (mode === 'v2-preview') {
    // Built PURELY from injected identities — no V1 fallback of any kind.
    const cfg = {
      apiKey: env.VITE_FIREBASE_V2_API_KEY,
      authDomain: env.VITE_FIREBASE_V2_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_V2_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_V2_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_V2_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_V2_APP_ID,
    };
    const missing = REQUIRED.filter((k) => !present(cfg[k]));
    if (missing.length) {
      throw new Error(
        `v2-preview requires injected V2 identities; missing/empty: ${missing.join(', ')}. ` +
        `It never falls back to golfriend-v1.`,
      );
    }
    // Zero-V1: reject if ANY field carries a V1 identifier (mixed/leaked V1/V2).
    for (const k of REQUIRED) {
      for (const bad of V1_FORBIDDEN) {
        if (String(cfg[k]).includes(bad)) {
          throw new Error(`v2-preview config field "${k}" resolves a V1 identifier ("${bad}"); mixed V1/V2 is forbidden.`);
        }
      }
    }
    return cfg;
  }

  throw new Error(`Unknown Firebase target "${mode}". Add it to the resolver before selecting it (issue #21).`);
}

/** Deep-scan a resolved config for any V1 identifier. Returns the offending [field, token] pairs. */
export function findV1Leaks(cfg) {
  const leaks = [];
  for (const [k, v] of Object.entries(cfg || {})) {
    for (const bad of V1_FORBIDDEN) {
      if (String(v).includes(bad)) leaks.push([k, bad]);
    }
  }
  return leaks;
}
