// ==========================================
// FILE: scripts/v2-mode-gate.mjs  (run: `npm run gate:v2`)
// Zero-V1 executable guard: proves the `v2-preview` mode is fail-closed and can
// NEVER resolve any golfriend-v1 identity/target. Uses the SAME resolver the app
// uses (src/firebaseTarget.js). Exits 1 on any violation.
// ==========================================
import { readFileSync } from 'node:fs';
import { resolveFirebaseTarget, findV1Leaks, V1_FORBIDDEN, V1_CONFIG } from '../src/firebaseTarget.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fails = [];
const ok = (name) => console.log(`  ✓ ${name}`);
function must(name, fn) { try { fn(); ok(name); } catch (e) { fails.push(`${name}: ${e.message}`); console.error(`  ✗ ${name} — ${e.message}`); } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function throws(fn, m) { let t = false; try { fn(); } catch { t = true; } assert(t, m || 'expected throw'); }

const FAKE_V2 = {
  VITE_FIREBASE_V2_API_KEY: 'FAKE_V2_API_KEY_0000',
  VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v2-preview.firebaseapp.com',
  VITE_FIREBASE_V2_PROJECT_ID: 'golfriend-v2-preview',
  VITE_FIREBASE_V2_STORAGE_BUCKET: 'golfriend-v2-preview.appspot.com',
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '999999999999',
  VITE_FIREBASE_V2_APP_ID: '1:999999999999:web:v2preview000000',
};

must('golfriend-v1 mode resolves the V1 config', () => {
  const c = resolveFirebaseTarget('golfriend-v1', {});
  assert(c.projectId === 'golfriend-v1', 'v1 mode must return v1');
});

must('v2-preview with full injected identities resolves cleanly', () => {
  const c = resolveFirebaseTarget('v2-preview', FAKE_V2);
  assert(c.projectId === 'golfriend-v2-preview', 'must use injected v2 projectId');
});

must('v2-preview resolves ZERO V1 identifiers', () => {
  const c = resolveFirebaseTarget('v2-preview', FAKE_V2);
  const leaks = findV1Leaks(c);
  assert(leaks.length === 0, `V1 leaks present: ${JSON.stringify(leaks)}`);
  // Also: no resolved value equals any V1_CONFIG value.
  for (const [k, v] of Object.entries(c)) {
    assert(v !== V1_CONFIG[k], `v2-preview field ${k} equals a V1 value`);
  }
});

must('v2-preview with NO identities FAILS CLOSED (no V1 fallback)', () => {
  throws(() => resolveFirebaseTarget('v2-preview', {}), 'empty env must throw');
});

must('v2-preview with PARTIAL identities fails closed', () => {
  const partial = { ...FAKE_V2 }; delete partial.VITE_FIREBASE_V2_PROJECT_ID;
  throws(() => resolveFirebaseTarget('v2-preview', partial), 'partial env must throw');
});

must('v2-preview with a MIXED V1 field is rejected', () => {
  const mixed = { ...FAKE_V2, VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v1.firebaseapp.com' };
  throws(() => resolveFirebaseTarget('v2-preview', mixed), 'mixed V1 field must throw');
  const mixed2 = { ...FAKE_V2, VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '368292182099' };
  throws(() => resolveFirebaseTarget('v2-preview', mixed2), 'mixed V1 sender must throw');
});

must('unknown mode throws (never silently v1)', () => {
  throws(() => resolveFirebaseTarget('golfriend-v9', {}), 'unknown mode must throw');
});

must('.firebaserc V1 deploy alias is covered by the zero-V1 forbidden list', () => {
  let rc = '';
  try { rc = readFileSync(ROOT + '.firebaserc', 'utf8'); } catch { /* absent → nothing to cover */ }
  if (rc) {
    const m = rc.match(/"default"\s*:\s*"([^"]+)"/);
    if (m) assert(V1_FORBIDDEN.some((b) => m[1].includes(b)), `deploy alias "${m[1]}" not covered by V1_FORBIDDEN`);
  }
});

if (fails.length) {
  console.error(`\n❌ v2 zero-V1 gate FAILED (${fails.length}).`);
  process.exit(1);
}
console.log('\n✅ v2 zero-V1 gate passed: v2-preview is fail-closed and resolves no golfriend-v1 identity/target.');
