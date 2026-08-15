// ==========================================
// FILE: scripts/coverage-honesty-verify.mjs
// Run: node scripts/coverage-honesty-verify.mjs
//
// Fails if any scenario group claimed as EXECUTED has no resolvable module or assertion
// target, and reports executed-versus-specification counts.
//
// This exists because a previous commit claimed "205 scenarios across 13 privileged
// surfaces, executed against the REAL modules" when 169 of them ran against nothing. The
// claim was not caught by any gate, because no gate asked what a scenario executes
// against. This one does, and it refuses a claim it cannot resolve.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((c) => existsSync(c));
assert.ok(tsc, 'no local typescript compiler found');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

const world = (await import(`file://${resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs')}`)).seed();

/**
 * The coverage ledger. Every scenario group in the world declares whether it is EXECUTED,
 * and if so against which module export — a target that must resolve, or the claim is
 * refused. `specification` groups are honest declarations of work not yet wired.
 */
const LEDGER = [
  {
    group: 'identities',
    count: world.identities.length,
    status: 'executed',
    targets: [
      { module: 'functions/lib/authority.js', exports: ['isActiveStaff', 'isActiveDirector'] },
      { module: 'src/auth/roleJourney.js', exports: ['isActiveAdminDoc', 'resolvePortalAccess'] },
    ],
    runner: 'scripts/monday-authority-scenarios-verify.mjs',
  },
  {
    group: 'legacyStatusRecords',
    count: world.legacyStatusRecords.length,
    status: 'executed',
    targets: [{ module: 'scripts/admin-status-migration-dryrun.mjs', exports: ['classify', 'classifyRole', 'wouldAuthorize', 'analyze', 'activationDecision'] }],
    runner: 'scripts/monday-authority-scenarios-verify.mjs',
  },
  {
    group: 'appCheckEvidence',
    count: world.appCheckEvidence.length,
    status: 'executed',
    targets: [{ module: 'functions/lib/appCheckCommissioning.js', exports: ['decideAppCheck', 'createReplayMemory', 'commissioningReadiness'] }],
    runner: 'scripts/monday-authority-scenarios-verify.mjs',
  },
  {
    group: 'lifecycleScenarios',
    count: world.lifecycleScenarios.length,
    status: 'executed',
    targets: [{ module: 'src/components/admin/v2/outreachIntent.ts', exports: ['createIntentLedger', 'shouldDisposeCache', 'isAuthoritativeOutcome'] }],
    runner: 'scripts/monday-authority-scenarios-verify.mjs',
  },
  {
    group: 'organizationScenarios',
    count: world.organizationScenarios.length,
    executedCount: world.organizationScenarios.filter((x) => ['create_representative', 'mint_principal'].includes(x.action)).length,
    status: 'partially_executed',
    targets: [{ module: 'functions/lib/partnerActivationRuntime.js', exports: ['managePartnerStaff'] }],
    runner: 'scripts/monday-authority-scenarios-verify.mjs',
  },
  {
    group: 'scenarios',
    count: world.scenarios.length,
    status: 'specification',
    reason: 'No surface-name-to-call-site mapping exists. These name the 13 privileged surfaces and the identity matrix each must eventually be tested against. The Portal call sites are covered separately and behaviourally by verify:portal-authority-callsites.',
    runner: null,
  },
];

// ---- 1. EVERY "EXECUTED" CLAIM RESOLVES TO A REAL TARGET ----------------------------
const unresolved = [];
for (const entry of LEDGER) {
  if (entry.status === 'specification') {
    assert.ok(entry.reason && entry.reason.length > 40, `${entry.group} is specification-only but gives no reason`);
    assert.equal(entry.runner, null, `${entry.group} is specification-only but names a runner`);
    continue;
  }
  assert.ok(entry.targets && entry.targets.length > 0, `${entry.group} claims execution with no target`);
  assert.ok(entry.runner && existsSync(resolve(ROOT, entry.runner)), `${entry.group} names a runner that does not exist`);
  for (const target of entry.targets) {
    const full = resolve(ROOT, target.module);
    if (!existsSync(full)) { unresolved.push(`${entry.group} → ${target.module} does not exist`); continue; }
    // The named exports must actually be there. A renamed export would otherwise leave a
    // claim pointing at a module that no longer provides what the scenarios drive.
    const source = readFileSync(full, 'utf8');
    for (const name of target.exports) {
      const present = new RegExp(`(export (async )?function ${name}\\b|export const ${name}\\b|exports\\.${name}\\s*=)`).test(source);
      if (!present) unresolved.push(`${entry.group} → ${target.module} does not export ${name}`);
    }
  }
}
assert.deepEqual(unresolved, [], `EXECUTED CLAIMS WITH NO RESOLVABLE TARGET:\n  ${unresolved.join('\n  ')}`);
ok(`every executed claim resolves: ${LEDGER.filter((e) => e.status !== 'specification').length} groups, all targets and exports present`);

// ---- 2. THE RUNNER REPORTS EXECUTED AND SPECIFICATION SEPARATELY --------------------
const runnerSource = readFileSync(resolve(ROOT, 'scripts/monday-authority-scenarios-verify.mjs'), 'utf8');
assert.match(runnerSource, /EXECUTED against real modules/, 'the runner does not report an executed count');
assert.match(runnerSource, /DECLARED ONLY/, 'the runner does not report a specification-only count');
// And it must NOT claim the specification scenarios as coverage.
assert.equal(
  /(\d+) scenarios across 13 privileged surfaces, executed/.test(runnerSource), false,
  'the runner still claims the specification-only surface scenarios as executed',
);
ok('the scenario runner reports executed and specification-only counts separately');

// ---- 3. THE WORLD FIXTURE LABELS ITS SPECIFICATION-ONLY BLOCK -----------------------
const fixtureSource = readFileSync(resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs'), 'utf8');
const specBlock = fixtureSource.slice(0, fixtureSource.indexOf('export const SCENARIOS'));
assert.match(specBlock, /DECLARED, NOT YET EXECUTED/, 'the surface scenarios are not labelled as a specification in the fixture');
ok('the fixture labels its specification-only scenarios as such');

// ---- 4. NO GROUP MAY SILENTLY BECOME UNCOUNTED --------------------------------------
const ledgerTotal = LEDGER.reduce((sum, entry) => sum + entry.count, 0);
const worldTotal = world.identities.length + world.legacyStatusRecords.length
  + world.appCheckEvidence.length + world.lifecycleScenarios.length
  + world.organizationScenarios.length + world.scenarios.length;
assert.equal(ledgerTotal, worldTotal,
  `the ledger accounts for ${ledgerTotal} scenarios but the world contains ${worldTotal} — a group is missing from the ledger`);
ok(`the ledger accounts for every one of the ${worldTotal} scenarios in the world`);

// ---- REPORT --------------------------------------------------------------------------
const executed = LEDGER.filter((e) => e.status === 'executed').reduce((s, e) => s + e.count, 0)
  + LEDGER.filter((e) => e.status === 'partially_executed').reduce((s, e) => s + (e.executedCount || 0), 0);
const partialRemainder = LEDGER.filter((e) => e.status === 'partially_executed')
  .reduce((s, e) => s + (e.count - (e.executedCount || 0)), 0);
const specification = LEDGER.filter((e) => e.status === 'specification').reduce((s, e) => s + e.count, 0);

console.log('\n--- EXECUTED vs SPECIFICATION ---');
for (const entry of LEDGER) {
  const label = entry.status === 'partially_executed'
    ? `${entry.executedCount}/${entry.count} executed`
    : `${entry.count} ${entry.status}`;
  console.log(`  ${entry.group.padEnd(22)} ${label}`);
}
console.log(`\n  EXECUTED against real modules : ${executed}`);
console.log(`  declared, not executed        : ${specification + partialRemainder}`);
console.log(`  total scenarios in the world  : ${worldTotal}`);

console.log(`\nCoverage honesty PASS: ${checks} checks. ${executed} executed, ${specification + partialRemainder} specification-only, ${worldTotal} total — and no executed claim lacks a resolvable target.`);
