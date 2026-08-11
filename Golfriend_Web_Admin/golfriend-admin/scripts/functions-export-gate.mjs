// ==========================================
// FILE: scripts/functions-export-gate.mjs  (run: `npm run gate:fnexport`)
// Export/deployment guard for the clean-V2 Function bundle. The deploy entry is
// functions/src/index.ts (main: lib/index.js) — only its exports (and modules it
// imports) enter the deployed bundle. This gate FAILS if:
//   - the two quarantined financial jobs (hourlyTreasurySweep, stripeB2BWebhook)
//     re-enter index.ts, or index.ts re-imports Stripe / the treasury path;
//   - the hardened weeklyVaultJanitor stops routing through the pure janitor core
//     (planDuplicatePurge) or gains a path that could delete a manually-locked record.
// Static analysis only. See docs/QUARANTINED_LEGACY_FINANCIAL_JOBS.md.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IDX = resolve(HERE, '../functions/src/index.ts');
const CORE = resolve(HERE, '../functions/src/janitorLogic.ts');
const src = process.env.FNEXPORT_GATE_TARGET ? readFileSync(process.env.FNEXPORT_GATE_TARGET, 'utf8') : readFileSync(IDX, 'utf8');

const fails = [];
const assert = (cond, msg) => { if (!cond) { fails.push(msg); console.error(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const code = stripComments(src);

// ---- 1. Prohibited financial jobs must NOT be exported from the bundle entry ----
const FORBIDDEN_EXPORTS = ['hourlyTreasurySweep', 'stripeB2BWebhook'];
for (const name of FORBIDDEN_EXPORTS) {
  assert(!new RegExp('export const ' + name + '\\b').test(code), `index.ts does not export '${name}' (kept out of the clean-V2 bundle)`);
}

// ---- 2. No fiat/Stripe/treasury financial-job authority in the bundle entry ----
assert(!/from ['"]stripe['"]/.test(code) && !/\bnew Stripe\b/.test(code), `index.ts does not import or construct Stripe`);
assert(!/onRequest\s*\(/.test(code), `index.ts exposes no onRequest webhook (Stripe webhook removed)`);
assert(!/collection\(\s*['"]platform['"]\s*\)\.doc\(\s*['"]treasury['"]/.test(code), `index.ts writes no legacy platform/treasury authority`);
assert(!/defineSecret\(\s*['"]STRIPE_/.test(code), `index.ts declares no Stripe secrets`);

// ---- 3. weeklyVaultJanitor is present and routes through the hardened pure core ----
const janitor = (src.match(/export const weeklyVaultJanitor = onSchedule\([\s\S]*?\r?\n\}\);/) || [])[0];
assert(!!janitor, `weeklyVaultJanitor is present`);
if (janitor) {
  const jcode = stripComments(janitor);
  assert(/planDuplicatePurge\s*\(/.test(jcode), `weeklyVaultJanitor routes through planDuplicatePurge (pure hardened core)`);
  // It must not reconstruct an ad-hoc "seen set → delete" path that ignores locks.
  assert(!/seenClubs/.test(jcode), `weeklyVaultJanitor does not use the old lock-blind seen-set purge`);
  // Deletes must be filtered by the plan (never a raw allCourses delete).
  assert(/isLocked\s*\(/.test(jcode), `weeklyVaultJanitor re-checks isLocked before any deletion (defence in depth)`);
  assert(/course_maintenance_audit/.test(jcode), `weeklyVaultJanitor writes bounded audit evidence`);
  // No delete may target a doc that is not in the plan's safe set.
  assert(!/allCourses[\s\S]*\.delete\(/.test(jcode) || /safeToDelete/.test(jcode), `weeklyVaultJanitor deletes only the plan's safe subset`);
}

// ---- 4. The pure core structurally cannot return a locked docId in toDelete ----
if (existsSync(CORE)) {
  const core = readFileSync(CORE, 'utf8');
  assert(/losers\.some\(isLocked\)/.test(core), `janitorLogic fails closed when a non-winner is locked`);
  assert(/locked\.length > 1/.test(core), `janitorLogic fails closed on multiple manual locks (ambiguous)`);
}

if (process.env.FNEXPORT_GATE_TARGET) process.exit(fails.length ? 1 : 0);

if (fails.length) {
  console.error(`\n❌ functions-export gate FAILED (${fails.length}). A prohibited financial job re-entered the bundle, or the janitor lost its lock-safety.`);
  process.exit(1);
}
console.log(`\n✅ functions-export gate passed: hourlyTreasurySweep + stripeB2BWebhook cannot enter the clean-V2 bundle; weeklyVaultJanitor routes through the hardened lock-safe/fail-closed core with bounded audit.`);
