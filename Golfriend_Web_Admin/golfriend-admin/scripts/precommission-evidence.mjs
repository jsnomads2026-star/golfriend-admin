// ==========================================
// FILE: scripts/precommission-evidence.mjs  (run: `npm run precommission`)
// C Phase 3 item 3/4 — exact-SHA precommission evidence. Runs every AUTOMATED
// Lane C control (the 9 node gates) and emits PRECOMMISSION_EVIDENCE.json + .md.
// Manual/provider controls are listed with autoApproval:false (never run here).
// No provider mutation, deploy, emulator, or secret. Automated controls only.
// ==========================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const HEAD = (process.env.CANDIDATE_HEAD || '').trim() || 'unknown';

const AUTOMATED = [
  ['gate:authority', 'scripts/authority-gate.mjs', 'no client authoritative writes (12 collections)'],
  ['gate:dead-route', 'scripts/dead-route-gate.mjs', 'quarantined components unrouted/guarded; no superseded financial booking'],
  ['gate:v2', 'scripts/v2-mode-gate.mjs', 'v2-preview fail-closed; zero-V1'],
  ['gate:a11y', 'scripts/portal-a11y-gate.mjs', 'portal state screens accessible; no God-Mode/TV-bypass/raw error'],
  ['gate:fnauth', 'scripts/functions-authority-gate.mjs', 'syncCoursesFromProvider authorizes via server-owned staff; no email God-Mode/env bypass'],
  ['gate:godmode', 'scripts/functions-godmode-gate.mjs', 'repository-wide: no admin@golfriend.co/caller-email/env God-Mode; retained callables use server-owned authority; quarantined callables fail-closed'],
  ['gate:clientcallable', 'scripts/client-callable-gate.mjs', 'no reachable client surface invokes any quarantined/unresolved callable; prohibited consoles unreachable'],
  ['gate:fnexport', 'scripts/functions-export-gate.mjs', 'hourlyTreasurySweep + stripeB2BWebhook cannot enter the clean-V2 bundle; weeklyVaultJanitor is lock-safe/fail-closed via the pure core'],
  ['verify:nav', 'scripts/nav-reachability-verify.mjs', 'quarantined console tabs render PolicyUnavailable; approved journeys remain mounted'],
  ['verify:booking', 'scripts/booking-journey-verify.mjs', 'non-financial booking journey'],
  ['verify:v2', 'scripts/v2-synthetic-verify.mjs', 'synthetic V2 non-financial journey; zero V1'],
  ['verify:roles', 'scripts/role-journey-verify.mjs', 'cross-role journey matrix; server-owned derivation'],
  ['verify:guards', 'scripts/route-guard-verify.mjs', 'every privileged route behind the resolver'],
  ['verify:courseops', 'scripts/course-ops-journey-verify.mjs', 'course-ops commissioning journey under synthetic V2'],
  ['verify:seed', 'scripts/lanec-seed-conformance-verify.mjs', 'clean-V2 course/role/portal seed & journey conformance; zero-V1; non-financial'],
];

// Externally-run controls this commit (npm build/test + optional Lane B check).
const EXTERNAL_AUTOMATED = [
  ['build:web', 'npm run build', 'tsc -b && vite build'],
  ['build:functions', 'npm --prefix functions run build', 'functions tsc'],
  ['test:functions', 'npm --prefix functions test', 'courseSync + bookingLogic (22/22)'],
  ['check:laneb', 'LANEB_DIR=<checkout> npm run check:laneb', 'Lane B v2-preview rules/index match published contract (skips without LANEB_DIR)'],
];

const MANUAL = [
  ['seed-first-director', 'human/infra', 'write admin_users/{uid} Director out-of-band (server-owned admin; no email God-Mode)'],
  ['firestore-rules-deploy', 'Lane B I1-B + deploy approval', 'author + deploy rules from the published contract'],
  ['v2-provider-appcheck', 'issue #21 / infra', 'V2 project, App Check, provider identities'],
  ['emulator-auth-and-runs', 'infra/founder', 'emulator authorization + runs'],
  ['deploy-hosting-functions', 'founder/infra', 'production deployment'],
  ['ci-status', 'CI', 'workflow runs (none currently reported)'],
];

const results = [];
for (const [name, script, proves] of AUTOMATED) {
  let status = 'pass', detail = '';
  try {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
    detail = (out.trim().split('\n').pop() || '').slice(0, 160);
  } catch (e) {
    status = 'fail';
    detail = (String(e.stdout || '') + String(e.stderr || '')).trim().split('\n').pop()?.slice(0, 160) || e.message;
  }
  results.push({ control: name, type: 'automated', status, proves, detail });
  console.log(`  ${status === 'pass' ? '✓' : '✗'} ${name}`);
}

const evidence = {
  lane: 'C',
  candidate_branch: 'feat/laneC-consolidated',
  candidate_head: HEAD,
  generated_at: new Date().toISOString(),
  automated_controls: results,
  externally_run_automated: EXTERNAL_AUTOMATED.map(([control, command, proves]) => ({ control, command, proves, type: 'automated', status: 'run-separately-this-commit' })),
  manual_provider_controls: MANUAL.map(([control, owner, note]) => ({ control, owner, note, autoApproval: false, status: 'BLOCKED' })),
  manifest_hashes_ref: existsSync('MANIFEST_HASHES.json') ? 'MANIFEST_HASHES.json' : null,
  ledger_ref: 'LANEC_LEDGER.json',
  summary: {
    automated_total: results.length,
    automated_pass: results.filter((r) => r.status === 'pass').length,
    automated_fail: results.filter((r) => r.status === 'fail').length,
    manual_blocked: MANUAL.length,
  },
};
writeFileSync('PRECOMMISSION_EVIDENCE.json', JSON.stringify(evidence, null, 2));

const md = [
  `# Precommission Evidence — Lane C`,
  ``,
  `- **Candidate:** \`feat/laneC-consolidated\` @ \`${HEAD}\``,
  `- **Generated:** ${evidence.generated_at}`,
  `- **Automated controls:** ${evidence.summary.automated_pass}/${evidence.summary.automated_total} pass, ${evidence.summary.automated_fail} fail`,
  `- **Manual/provider controls:** ${evidence.summary.manual_blocked} BLOCKED (autoApproval:false)`,
  ``,
  `## Automated controls (run by this tool)`,
  `| control | status | proves |`,
  `|---|---|---|`,
  ...results.map((r) => `| \`${r.control}\` | ${r.status === 'pass' ? '✅ pass' : '❌ fail'} | ${r.proves} |`),
  ``,
  `## Externally-run automated (this commit)`,
  `| control | command | proves |`,
  `|---|---|---|`,
  ...evidence.externally_run_automated.map((r) => `| \`${r.control}\` | \`${r.command}\` | ${r.proves} |`),
  ``,
  `## Manual / provider controls — BLOCKED (autoApproval:false)`,
  `| control | owner | note |`,
  `|---|---|---|`,
  ...evidence.manual_provider_controls.map((r) => `| \`${r.control}\` | ${r.owner} | ${r.note} |`),
  ``,
  `See \`MANIFEST_HASHES.json\`, \`LANEC_LEDGER.json\`, \`docs/PRECOMMISSION_CONTROLS.md\`, \`docs/PRECOMMISSION_SEED_AND_SMOKE.md\`.`,
  ``,
].join('\n');
writeFileSync('PRECOMMISSION_EVIDENCE.md', md);

console.log(`\nPrecommission evidence written for ${HEAD}: ${evidence.summary.automated_pass}/${evidence.summary.automated_total} automated pass, ${evidence.summary.manual_blocked} manual BLOCKED.`);
if (evidence.summary.automated_fail > 0) process.exit(1);
