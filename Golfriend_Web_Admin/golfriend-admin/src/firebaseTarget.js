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

/**
 * Precommission demo project config. Firebase treats any `demo-*` projectId as an
 * OFFLINE-ONLY project: the SDK refuses to contact Google production servers for
 * it and only talks to a local emulator. Combined with the mandatory emulator
 * connections (see resolveEmulatorEndpoints + firebaseConfig), precommission mode
 * can never reach production. Matches Lane B's canonical demo project.
 */
export const PRECOMMISSION_CONFIG = {
  apiKey: 'demo-precommission-emulator-key',
  authDomain: 'demo-golfriend-v2-canonical.firebaseapp.com',
  projectId: 'demo-golfriend-v2-canonical',
  storageBucket: 'demo-golfriend-v2-canonical.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:demoPrecommissionEmulator',
};

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

  if (mode === 'precommission') {
    // Emulator-only demo project. Must be a `demo-*` id (offline-only) and carry
    // zero V1 identifiers. The emulator endpoints are validated separately by
    // resolveEmulatorEndpoints, which fails closed when they are absent.
    const cfg = { ...PRECOMMISSION_CONFIG };
    if (!String(cfg.projectId).startsWith('demo-')) {
      throw new Error('precommission projectId must be a demo-* (offline-only) project; refusing to run.');
    }
    for (const k of REQUIRED) {
      for (const bad of V1_FORBIDDEN) {
        if (String(cfg[k]).includes(bad)) {
          throw new Error(`precommission config field "${k}" resolves a V1 identifier ("${bad}"); forbidden.`);
        }
      }
    }
    return cfg;
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

/**
 * Resolve the local emulator endpoints for a mode. ONLY `precommission` uses
 * emulators; every other mode returns null (talks to its cloud target as before).
 * For `precommission` this FAILS CLOSED — throws if the host or any per-service
 * port is missing/empty/invalid — so the app can never silently run without the
 * emulator (and therefore never fall back to production).
 * @param {string} mode
 * @param {Record<string,string|undefined>} [env]
 * @returns {null | { host: string, ports: { auth:number, firestore:number, functions:number, storage:number } }}
 */
export function resolveEmulatorEndpoints(mode, env = {}) {
  if (mode !== 'precommission') return null;
  const host = env.VITE_FIREBASE_EMULATOR_HOST;
  const rawPorts = {
    auth: env.VITE_EMU_AUTH_PORT,
    firestore: env.VITE_EMU_FIRESTORE_PORT,
    functions: env.VITE_EMU_FUNCTIONS_PORT,
    storage: env.VITE_EMU_STORAGE_PORT,
  };
  const missing = [];
  if (!present(host)) missing.push('VITE_FIREBASE_EMULATOR_HOST');
  for (const [k, v] of Object.entries(rawPorts)) if (!present(String(v ?? ''))) missing.push(`VITE_EMU_${k.toUpperCase()}_PORT`);
  if (missing.length) {
    throw new Error(
      `precommission mode requires local emulator endpoints; missing/empty: ${missing.join(', ')}. ` +
      `It fails closed and NEVER falls back to production.`,
    );
  }
  const ports = {};
  for (const [k, v] of Object.entries(rawPorts)) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) {
      throw new Error(`precommission emulator port for "${k}" is invalid: ${JSON.stringify(v)}.`);
    }
    ports[k] = n;
  }
  return { host, ports };
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
