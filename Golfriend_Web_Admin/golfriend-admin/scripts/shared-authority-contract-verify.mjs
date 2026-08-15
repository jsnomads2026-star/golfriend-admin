// ==========================================
// FILE: scripts/shared-authority-contract-verify.mjs
// Run: node scripts/shared-authority-contract-verify.mjs
//
// Executes docs/SHARED_AUTHORITY_CONTRACT.json against EVERY listed implementation and
// fails on any semantic drift.
//
// The point of a contract-plus-vectors design, rather than a shared runtime import: the
// Admin and Portal surfaces must AGREE without being COUPLED. A cross-lane import would
// make one lane's refactor silently change the other lane's authorization, and would tie
// their deploy artifacts together. Here each surface keeps its own copy and the vectors
// prove the copies still mean the same thing.
//
// Drift is detected in three directions: implementation vs contract, implementation vs
// implementation, and accepted-status-list vs contract.
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

const contract = JSON.parse(readFileSync(resolve(ROOT, 'docs/SHARED_AUTHORITY_CONTRACT.json'), 'utf8'));
assert.equal(contract.status, 'active', 'the shared authority contract is not active');
assert.ok(contract.conformanceVectors.cases.length >= 30, 'the contract carries too few vectors to detect drift');

// The compiled server predicate is what the callables actually run.
const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((candidate) => existsSync(candidate));
assert.ok(tsc, 'no local typescript compiler found for functions/');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

const serverModule = await import(`file://${resolve(FUNCTIONS, 'lib/authority.js')}`);
const server = serverModule.default ?? serverModule;
const client = await import(`file://${resolve(ROOT, 'src/auth/roleJourney.js')}`);

/** Each implementation adapted to one shape, so the same vectors drive all of them. */
const IMPLEMENTATIONS = [
  {
    id: 'server',
    staff: (doc) => server.isActiveStaff(doc),
    director: (doc) => server.isActiveDirector(doc),
    normalize: (value) => server.normalizeStaffStatus(value),
    accepted: [...server.ACTIVE_STAFF_STATUSES],
  },
  {
    id: 'client',
    staff: (doc) => client.isActiveAdminDoc(doc),
    director: (doc) => client.isActiveDirectorDoc(doc),
    normalize: (value) => client.normalizeStaffStatus(value),
    accepted: [...client.ACTIVE_ADMIN_STATUSES],
  },
];

// ---- 0. EVERY DECLARED IMPLEMENTATION EXISTS AND IS WIRED --------------------------
for (const declared of contract.implementations) {
  const full = resolve(ROOT, declared.path);
  assert.ok(existsSync(full), `the contract lists ${declared.path} but it does not exist`);
  const source = readFileSync(full, 'utf8');
  for (const name of declared.exports) {
    assert.ok(
      new RegExp(`export (function|const) ${name}\\b`).test(source),
      `${declared.path} does not export ${name}, which the contract requires`,
    );
  }
  assert.ok(
    IMPLEMENTATIONS.some((impl) => impl.id === declared.id),
    `the contract declares implementation '${declared.id}' but this verifier does not exercise it`,
  );
}
assert.equal(IMPLEMENTATIONS.length, contract.implementations.length, 'an implementation is exercised that the contract does not declare, or vice versa');
ok(`${contract.implementations.length} declared implementations exist, export the required surface, and are exercised`);

// ---- 1. EVERY IMPLEMENTATION MATCHES THE CONTRACT ----------------------------------
const violations = [];
for (const vector of contract.conformanceVectors.cases) {
  for (const impl of IMPLEMENTATIONS) {
    const staff = impl.staff(vector.doc);
    const director = impl.director(vector.doc);
    if (staff !== vector.staff) {
      violations.push(`${vector.id} [${impl.id}] staff: contract says ${vector.staff}, implementation says ${staff} for ${JSON.stringify(vector.doc)}`);
    }
    if (director !== vector.director) {
      violations.push(`${vector.id} [${impl.id}] director: contract says ${vector.director}, implementation says ${director} for ${JSON.stringify(vector.doc)}`);
    }
  }
}
assert.deepEqual(violations, [], `CONTRACT VIOLATIONS:\n  ${violations.join('\n  ')}`);
ok(`${contract.conformanceVectors.cases.length} vectors × ${IMPLEMENTATIONS.length} implementations = ${contract.conformanceVectors.cases.length * IMPLEMENTATIONS.length * 2} verdicts, all matching the contract`);

// ---- 2. THE VECTORS ARE DISCRIMINATING ---------------------------------------------
// A vector set that is all-false would "pass" against a predicate that denies everything.
const positives = contract.conformanceVectors.cases.filter((v) => v.staff).length;
const negatives = contract.conformanceVectors.cases.length - positives;
assert.ok(positives >= 5, `only ${positives} authorizing vectors — the set cannot detect a lockout`);
assert.ok(negatives >= 15, `only ${negatives} refusing vectors — the set cannot detect a bypass`);
const directorPositives = contract.conformanceVectors.cases.filter((v) => v.director).length;
assert.ok(directorPositives >= 2 && directorPositives < positives, 'the vectors do not separate Director from ordinary staff');
ok(`vectors are discriminating: ${positives} authorizing, ${negatives} refusing, ${directorPositives} Director-tier`);

// ---- 3. IMPLEMENTATION-VS-IMPLEMENTATION DRIFT --------------------------------------
// Even beyond the vectors: the normalizers must agree on every input shape, and the
// accepted lists must be identical. This is what catches a change made to one copy only.
const drift = [];
const NORMALIZER_INPUTS = [
  ...contract.conformanceVectors.cases.map((v) => (v.doc ? v.doc.status : undefined)),
  null, undefined, 42, true, false, {}, [], 'Active', 'ACTIVE', ' Active ',
  'Actıve', 'ＡＣＴＩＶＥ', 'active​', '﻿Active',
];
for (const value of NORMALIZER_INPUTS) {
  const results = IMPLEMENTATIONS.map((impl) => `${impl.id}=${JSON.stringify(impl.normalize(value))}`);
  const distinct = new Set(results.map((r) => r.split('=')[1]));
  if (distinct.size > 1) drift.push(`normalize(${JSON.stringify(value)}): ${results.join(' ')}`);
}
assert.deepEqual(drift, [], `NORMALIZER DRIFT BETWEEN IMPLEMENTATIONS:\n  ${drift.join('\n  ')}`);

const contractAccepted = [...contract.acceptedStatuses.values].sort();
for (const impl of IMPLEMENTATIONS) {
  assert.deepEqual([...impl.accepted].sort(), contractAccepted,
    `implementation '${impl.id}' accepts ${JSON.stringify(impl.accepted)} but the contract accepts ${JSON.stringify(contractAccepted)}`);
}
assert.equal(contractAccepted.length, 1, 'the contract accepts more than one status — widening is a reviewed change');
assert.equal(contractAccepted[0], 'active');
ok(`no drift: ${NORMALIZER_INPUTS.length} normalizer inputs agree across implementations; every accepted list is exactly ["active"]`);

// ---- 4. ROLE COMPARISON IS EXACT IN EVERY IMPLEMENTATION ---------------------------
// Declared in the contract as `exact`, so it is verified as exact rather than trusted.
assert.equal(contract.roleComparison.mode, 'exact');
assert.equal(contract.roleComparison.caseFold, false);
for (const impl of IMPLEMENTATIONS) {
  for (const role of ['director', 'DIRECTOR', 'Director ', ' Director', 'DiReCtOr']) {
    assert.equal(impl.director({ role, status: 'Active' }), false,
      `implementation '${impl.id}' case-folded the role '${role}' — hardening must not widen authority`);
  }
  assert.equal(impl.director({ role: 'Director', status: 'Active' }), true, impl.id);
}
// The role REGISTRY must be identical in both implementations, and must not overlap the
// partner vocabulary — a foreign role satisfying an Admin gate is a principal-class error.
assert.deepEqual([...server.CANONICAL_ADMIN_ROLES], contract.roleComparison.canonicalRoles, 'the server role registry has drifted from the contract');
assert.deepEqual([...client.CANONICAL_ADMIN_ROLES], contract.roleComparison.canonicalRoles, 'the client role registry has drifted from the contract');
assert.equal(server.ADMIN_ROLE_REGISTRY_VERSION, contract.roleComparison.registryVersion, 'the server registry version has drifted');
assert.equal(client.ADMIN_ROLE_REGISTRY_VERSION, contract.roleComparison.registryVersion, 'the client registry version has drifted');
for (const foreign of contract.roleComparison.foreignVocabularies.partner_memberships) {
  assert.equal(server.CANONICAL_ADMIN_ROLES.includes(foreign), false, foreign + ' is a partner role in the admin registry');
  assert.equal(server.isActiveStaff({ role: foreign, status: 'Active' }), false, foreign);
  assert.equal(client.isActiveAdminDoc({ role: foreign, status: 'Active' }), false, foreign);
}
for (const obsolete of server.OBSOLETE_ADMIN_ROLES) {
  assert.equal(server.CANONICAL_ADMIN_ROLES.includes(obsolete), false, obsolete + ' is both canonical and obsolete');
}
// The registry must be CLOSED: a role outside it cannot authorize, in either implementation.
for (const invented of ['intern', 'admin', 'root', 'Analyst', 'Ops', 'Directors']) {
  assert.equal(server.isActiveStaff({ role: invented, status: 'Active' }), false, invented);
  assert.equal(client.isActiveAdminDoc({ role: invented, status: 'Active' }), false, invented);
}
ok(`role comparison is exact; both registries are ${contract.roleComparison.registryVersion} with ${contract.roleComparison.canonicalRoles.length} canonical roles, no partner-vocabulary overlap, and no invented role authorizes`);

// ---- 5. PRINCIPAL BINDING PROHIBITIONS ARE HONOURED ---------------------------------
// The contract forbids reading identity or authorization from client input. Checked against
// the sources rather than assumed.
const serverSource = readFileSync(resolve(FUNCTIONS, 'src/authority.ts'), 'utf8');
assert.doesNotMatch(serverSource, /request\.data|process\.env/, 'the server predicate reads client input or the environment');
assert.doesNotMatch(serverSource, /@golfriend\.co|godmode|god_mode/i, 'a God-Mode literal is present in the authority core');
// Status must be evaluated before role: the status guards appear first in the function body.
const staffBody = serverSource.slice(serverSource.indexOf('export function isActiveStaff'));
const statusAt = staffBody.indexOf('normalizeStaffStatus(adminDoc.status)');
const roleAt = staffBody.indexOf('adminDoc.role !== \'string\'');
assert.ok(statusAt > 0 && roleAt > 0 && statusAt < roleAt,
  'role is evaluated before status — a valid role could rescue an inactive account');
ok('principal binding honoured: no client input, no environment bypass, no God-Mode literal, status evaluated before role');

console.log(`\nShared authority contract verification PASS: ${checks} checks (contract ${contract.contractId} v${contract.version}, ${contract.conformanceVectors.cases.length} vectors, ${IMPLEMENTATIONS.length} implementations, drift detection across ${NORMALIZER_INPUTS.length} normalizer inputs).`);
