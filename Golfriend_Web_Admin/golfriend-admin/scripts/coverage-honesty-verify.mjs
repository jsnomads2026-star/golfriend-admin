// ==========================================
// FILE: scripts/coverage-honesty-verify.mjs
// Run: node scripts/coverage-honesty-verify.mjs
//
// Fails if any scenario group claimed as EXECUTED has no resolvable module or
// assertion target, and reports executed-versus-declared counts.
//
// This exists because a coverage claim is the easiest thing in a security package to
// get wrong in the flattering direction: a suite can report a large number of
// "scenarios" while most of them execute against nothing. No ordinary gate asks what a
// scenario executes AGAINST. This one does, and it refuses a claim it cannot resolve.
//
// Group discovery is DERIVED from the contract suite's own exported ledger, never a
// hard-coded list here — a hard-coded list makes a NEW group invisible to the very
// reconciliation that is supposed to notice it.
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

// ---- 1. GROUPS ARE DISCOVERED, NOT DECLARED HERE ------------------------------------
const CONTRACT = 'scripts/enterprise-staff-contract-verify.mjs';
const contractPath = resolve(ROOT, CONTRACT);
assert.ok(existsSync(contractPath), `${CONTRACT} does not exist`);
const contractModule = await import(`file://${contractPath}`);
const LEDGER = contractModule.SCENARIO_LEDGER;
assert.ok(Array.isArray(LEDGER) && LEDGER.length > 0, `${CONTRACT} exports no SCENARIO_LEDGER`);

const contractSource = readFileSync(contractPath, 'utf8');
// Every `ok(...)` reported by the suite is a group it claims to have covered. If the
// suite grows a block and forgets the ledger, the counts disagree and this fails.
const reportedBlocks = (contractSource.match(/^ok\(/gm) || []).length;
assert.equal(
  LEDGER.length, reportedBlocks,
  `the ledger declares ${LEDGER.length} groups but the suite reports ${reportedBlocks} blocks; a group is uncounted`,
);
ok(`${LEDGER.length} groups DISCOVERED from the suite's own ledger (not hard-coded here), matching its ${reportedBlocks} reported blocks`);

// ---- 2. EVERY "EXECUTED" CLAIM RESOLVES TO A REAL TARGET ----------------------------
const unresolved = [];
for (const entry of LEDGER) {
  if (entry.status === 'specification') {
    assert.ok(entry.reason && entry.reason.length > 40, `${entry.group} is specification-only but gives no reason`);
    continue;
  }
  assert.equal(entry.status, 'executed', `${entry.group} has an unknown status: ${entry.status}`);
  const full = resolve(ROOT, entry.module);
  if (!existsSync(full)) { unresolved.push(`${entry.group} → ${entry.module} does not exist`); continue; }
  const source = readFileSync(full, 'utf8');
  for (const name of entry.exports) {
    // The named export must actually be there — a renamed export would leave the claim
    // pointing at a module that no longer provides what the scenarios drive.
    const present = new RegExp(`(export (async )?function ${name}\\b|export const ${name}\\b|exports\\.${name}\\s*=)`).test(source);
    if (!present) { unresolved.push(`${entry.group} → ${entry.module} does not export ${name}`); continue; }
    // RESOLVABLE IS NOT EXECUTED. Confirming the export exists and stopping there means
    // a group can be relabelled 'executed' by pointing it at any real module. The name
    // must appear in the suite that claims to drive it.
    if (!contractSource.includes(name)) {
      unresolved.push(`${entry.group} claims ${entry.module}.${name} but ${CONTRACT} never mentions it`);
    }
  }
}
assert.deepEqual(unresolved, [], `EXECUTED CLAIMS WITH NO RESOLVABLE TARGET:\n  ${unresolved.join('\n  ')}`);
ok(`every executed claim resolves: ${LEDGER.filter((e) => e.status === 'executed').length} groups, all modules and exports present and referenced`);

// ---- 3. THE SUITE REPORTS WHAT IT ACTUALLY RAN --------------------------------------
// The claim in the summary line must be produced from a counter the assertions
// increment, not typed as a literal — a hard-coded total is exactly the failure mode
// this gate exists to catch.
assert.match(contractSource, /assertions \+= /, 'the contract suite does not accumulate an assertion count');
assert.match(contractSource, /\$\{assertions\}/, 'the contract suite reports a literal total rather than its counter');
assert.equal(
  /\d+ hostile assertions against/.test(contractSource), false,
  'the contract suite hard-codes its assertion total in the summary line',
);
ok('the contract suite reports a counted total, not a literal');

// ---- 4. THE SUITE ACTUALLY PASSES, AND ITS COUNT IS REPRODUCIBLE --------------------
const output = execFileSync(process.execPath, [contractPath], { cwd: ROOT, encoding: 'utf8' });
const match = output.match(/(\d+) checks, (\d+) hostile assertions/);
assert.ok(match, `could not read the contract suite's own report:\n${output.slice(-400)}`);
const [, reportedChecks, reportedAssertions] = match;
assert.equal(Number(reportedChecks), LEDGER.length, `the suite ran ${reportedChecks} checks but the ledger declares ${LEDGER.length}`);
assert.ok(Number(reportedAssertions) > 0, 'the suite reports zero assertions');
ok(`the suite runs green and self-reports ${reportedChecks} checks / ${reportedAssertions} assertions, matching the ledger`);

console.log(`\nCoverage honesty PASS: ${checks} checks. ${LEDGER.length} groups, all executed against real modules, ${reportedAssertions} assertions — and no executed claim lacks a resolvable target.`);
