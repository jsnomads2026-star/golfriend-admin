import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(ROOT, 'scripts/lanec-seed-conformance-verify.mjs');
const protectedFiles = [
  resolve(ROOT, 'SEED_CONFORMANCE_EVIDENCE.json'),
  resolve(ROOT, 'SEED_CONFORMANCE_EVIDENCE.md'),
];
const digest = () => protectedFiles.map((path) => createHash('sha256').update(readFileSync(path)).digest('hex'));
const verify = (...args) => execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });

const before = digest();
assert.match(verify(), /verification made no changes/);
assert.deepEqual(digest(), before, 'first verification must not change protected evidence bytes');
assert.match(verify(), /verification made no changes/);
assert.deepEqual(digest(), before, 'repeated verification must not change protected evidence bytes');

const temp = mkdtempSync(resolve(tmpdir(), 'golfriend-seed-evidence-'));
try {
  assert.match(verify('--update-evidence', `--evidence-dir=${temp}`), /regenerated explicitly/);
  assert.match(verify(`--evidence-dir=${temp}`), /verification made no changes/);
  writeFileSync(resolve(temp, 'SEED_CONFORMANCE_EVIDENCE.md'), 'stale evidence\n');
  const stale = spawnSync(process.execPath, [SCRIPT, `--evidence-dir=${temp}`], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(stale.status, 0, 'stale evidence must fail closed');
  assert.match(`${stale.stdout}\n${stale.stderr}`, /evidence is stale or missing/);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /update:seed-evidence/);
  writeFileSync(resolve(temp, 'SEED_CONFORMANCE_EVIDENCE.json'), '{malformed');
  const malformed = spawnSync(process.execPath, [SCRIPT, `--evidence-dir=${temp}`], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(malformed.status, 0, 'malformed evidence must fail closed');
  assert.match(`${malformed.stdout}\n${malformed.stderr}`, /evidence is stale or missing/);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('seed evidence gate: repeated verification is byte-stable; stale evidence fails closed');
