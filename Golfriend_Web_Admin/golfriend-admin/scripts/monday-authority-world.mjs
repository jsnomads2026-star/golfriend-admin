// ==========================================
// FILE: scripts/monday-authority-world.mjs
// Run: node scripts/monday-authority-world.mjs [seed|reset|verify|digest|manifest]
//      (no argument runs `verify`, which is what the gate invokes)
//
// Tooling for the Admin/Partner-Portal authority section of the Monday Test World.
//
// LOCAL AND TEST-ONLY BY CONSTRUCTION. There is no Firestore client, no credential, no
// network call and no runtime seeding anywhere in this path — `seed()` returns an
// in-memory object. That is asserted here rather than promised: the fixture source is
// scanned for any transport or credential import, and the check fails if one appears.
//
// The determinism claim is likewise executed, not asserted in prose: the world is built
// several times, from a fresh module instance as well as a warm one, and the digests must
// be identical.
// ==========================================
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXTURE = resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs');

const world = await import(`file://${FIXTURE}`);
const {
  canonicalJson, reset, seed, IDENTITIES, ORGANIZATIONS, LEGACY_STATUS_RECORDS,
  SCENARIOS, ORGANIZATION_SCENARIOS, LIFECYCLE_SCENARIOS, APP_CHECK_EVIDENCE,
  SCENARIO_COUNT, WORLD_ID, WORLD_VERSION, WORLD_SEED,
} = world;

export function digestOf(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

const command = process.argv[2] || 'verify';
let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

// ---------------------------------------------------------------------- commands ------
if (command === 'seed') {
  const built = seed();
  console.log(JSON.stringify({
    worldId: built.worldId, worldVersion: built.worldVersion, seed: built.seed,
    identities: built.identities.length, organizations: built.organizations.length,
    scenarios: SCENARIO_COUNT, digest: digestOf(built),
  }, null, 2));
  console.log('\nThe world is in memory. Nothing was written and no service was contacted.');
  process.exit(0);
}

if (command === 'reset') {
  console.log(JSON.stringify(reset(), null, 2));
  process.exit(0);
}

if (command === 'digest') {
  console.log(digestOf(seed()));
  process.exit(0);
}

if (command === 'manifest') {
  const built = seed();
  const manifest = {
    worldId: WORLD_ID,
    worldVersion: WORLD_VERSION,
    seed: WORLD_SEED,
    digest: digestOf(built),
    counts: {
      identities: built.identities.length,
      organizations: built.organizations.length,
      legacyStatusRecords: built.legacyStatusRecords.length,
      appCheckEvidence: built.appCheckEvidence.length,
      surfaceScenarios: SCENARIOS.length,
      organizationScenarios: ORGANIZATION_SCENARIOS.length,
      lifecycleScenarios: LIFECYCLE_SCENARIOS.length,
      totalScenarios: SCENARIO_COUNT,
    },
    identities: built.identities.map((identity) => ({
      principalId: identity.principalId,
      label: identity.label,
      // The ADDRESS is deliberately included so a reader can see the collisions — it is a
      // fixture contact detail on a .test domain, never an authority input.
      contactEmail: identity.contactEmail,
      emailVerified: identity.emailVerified,
      expect: identity.expect,
    })),
    organizations: built.organizations.map((o) => ({ organizationId: o.organizationId, status: o.status, version: o.version })),
    surfaces: [...new Set(SCENARIOS.map((x) => x.surface))],
  };
  const out = resolve(ROOT, 'docs/MONDAY_AUTHORITY_WORLD_MANIFEST.json');
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`manifest written: ${out}`);
  console.log(`digest: ${manifest.digest}`);
  process.exit(0);
}

// ----------------------------------------------------------------------- verify -------
assert.equal(command, 'verify', `unknown command '${command}' (expected seed|reset|verify|digest|manifest)`);

// ---- 1. DETERMINISM ------------------------------------------------------------------
const first = seed();
const second = seed();
const third = seed({ seed: WORLD_SEED });
assert.equal(digestOf(first), digestOf(second), 'two seeds of the same world produced different digests');
assert.equal(digestOf(first), digestOf(third), 'naming the default seed explicitly changed the world');
assert.deepEqual(first, second, 'repeated seeding produced structurally different worlds');
// A FRESH module instance must agree too — otherwise the world depends on module state.
const freshModule = await import(`file://${FIXTURE}?fresh=${Date.now()}`);
assert.equal(digestOf(freshModule.seed()), digestOf(first), 'a freshly imported module produced a different world');
// A DIFFERENT seed must produce a different world, or the seed is decorative.
assert.notEqual(digestOf(seed({ seed: 'some-other-seed' })), digestOf(first), 'changing the seed changed nothing — the seed is not wired');
ok(`deterministic: repeated seeds, an explicit default seed and a fresh module all yield ${digestOf(first).slice(0, 23)}…`);

// ---- 2. RESET IS A NO-OP BECAUSE THERE IS NO PERSISTENT STATE ------------------------
const resetResult = reset();
assert.equal(resetResult.wrote, 0);
assert.equal(digestOf(seed()), digestOf(first), 'the world changed after a reset');
ok('reset writes nothing and reseeding after it reproduces the identical world');

// ---- 3. NO PRODUCTION REACH ----------------------------------------------------------
// Asserted against the fixture and this tool, not promised in a comment.
// Built from fragments so this list cannot match itself when this file is scanned.
const FORBIDDEN = [
  ['firebase', '-admin'], ['firebase/', 'firestore'], ['get', 'Firestore'],
  ['initialize', 'App'], ['application', 'Default'], ['service', 'Account'],
  ['http', '://'], ['fetch', '('], ['XML', 'HttpRequest'], ['credent', 'ial'],
].map((parts) => parts.join(''));
const SCAN_MARKER = '/* scan-exempt-start */';
for (const [label, file] of [['fixture', FIXTURE], ['tooling', resolve(HERE, 'monday-authority-world.mjs')]]) {
  let source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Excise this verifier's own machinery, which necessarily names what it forbids.
  const start = source.indexOf('const FORBIDDEN = [');
  if (start >= 0) source = source.slice(0, start) + source.slice(source.indexOf('console.log(`\\nMonday'));
  const hits = FORBIDDEN.filter((token) => source.includes(token));
  assert.deepEqual(hits, [], `${label} reaches outside the test world: ${hits.join(', ')}`);
}
void SCAN_MARKER;
ok('no transport, credential, Firebase client or environment reach in the fixture or the tooling');

// ---- 4. IDENTITY INTEGRITY -----------------------------------------------------------
const ids = IDENTITIES.map((i) => i.principalId);
assert.equal(new Set(ids).size, ids.length, 'duplicate principalId in the fixture');
for (const identity of IDENTITIES) {
  assert.match(identity.principalId, /^dev_mock_mtw_prn_[a-z0-9_]+$/, identity.principalId);
  assert.match(identity.contactEmail, /@example\.test$/, `${identity.principalId} uses a non-.test address`);
  assert.equal(typeof identity.emailVerified, 'boolean', identity.principalId);
  assert.ok(identity.expect && typeof identity.expect.staff === 'boolean', `${identity.principalId} declares no expected verdict`);
}
// THE DUPLICATE-ADDRESS REQUIREMENT: one address, several DISTINCT principals.
const byAddress = new Map();
for (const identity of IDENTITIES) {
  byAddress.set(identity.contactEmail, [...(byAddress.get(identity.contactEmail) || []), identity.principalId]);
}
const collisions = [...byAddress.entries()].filter(([, principals]) => principals.length > 1);
assert.ok(collisions.length >= 1, 'the world contains no duplicate-address identities, so email-as-identity cannot be tested');
for (const [, principals] of collisions) {
  assert.equal(new Set(principals).size, principals.length, 'a collision group reuses a principalId');
}
// At most one member of a collision group may hold authority — otherwise the fixture would
// not distinguish "same address" from "same principal".
for (const [address, principals] of collisions) {
  const authorised = principals
    .map((principalId) => IDENTITIES.find((i) => i.principalId === principalId))
    .filter((i) => i.expect.staff || i.expect.portal === 'partner_authorized');
  assert.ok(authorised.length <= 1, `address ${address} grants authority to ${authorised.length} principals`);
}
ok(`${ids.length} unique principals; ${collisions.length} address collision group(s), each binding authority to at most one principal`);

// ---- 5. ORGANIZATION AND SCENARIO INTEGRITY -----------------------------------------
const orgIds = new Set(ORGANIZATIONS.map((o) => o.organizationId));
assert.equal(orgIds.size, ORGANIZATIONS.length, 'duplicate organizationId');
for (const status of ['active', 'suspended', 'deactivated']) {
  assert.ok(ORGANIZATIONS.some((o) => o.status === status), `the world has no ${status} organization`);
}
for (const identity of IDENTITIES) {
  if (identity.partner) {
    assert.ok(orgIds.has(identity.partner.organizationId), `${identity.principalId} belongs to an unknown organization`);
    assert.equal(typeof identity.partner.membershipVersion, 'number', identity.principalId);
  }
}
const knownIds = new Set(ids);
for (const scenario of [...SCENARIOS, ...ORGANIZATION_SCENARIOS]) {
  assert.ok(knownIds.has(scenario.principalId), `scenario references unknown principal ${scenario.principalId}`);
  if (scenario.organizationId) assert.ok(orgIds.has(scenario.organizationId), scenario.organizationId);
}
// Every named privileged surface is covered, and each is exercised against BOTH an
// authorized and an unauthorized principal — a surface tested only negatively would pass
// against a call site that denies everyone.
const surfaces = [...new Set(SCENARIOS.map((x) => x.surface))];
assert.equal(surfaces.length, 13, `expected 13 privileged surfaces, found ${surfaces.length}`);
for (const surface of surfaces) {
  const forSurface = SCENARIOS.filter((x) => x.surface === surface);
  assert.ok(forSurface.some((x) => x.expect.authorized), `${surface} has no authorized case`);
  assert.ok(forSurface.filter((x) => !x.expect.authorized).length >= 8, `${surface} has too few refusal cases`);
}
ok(`${ORGANIZATIONS.length} organizations (active/suspended/deactivated), ${surfaces.length} privileged surfaces, every surface with both authorized and refused cases`);

// ---- 6. LIFECYCLE AND APP CHECK COVERAGE --------------------------------------------
for (const required of ['offline_before_reserve', 'transport_failure', 'restart', 'retry_same',
  'retry_altered', 'logout', 'member_switch', 'role_change', 'suspension', 'deactivation',
  'appcheck_failure', 'offline_while_in_flight', 'late_completion']) {
  assert.ok(LIFECYCLE_SCENARIOS.some((x) => x.event === required), `no lifecycle scenario for ${required}`);
}
// The composed case must exist and must demand BOTH properties at once.
const composed = LIFECYCLE_SCENARIOS.find((x) => x.event === 'offline_while_in_flight');
assert.equal(composed.expectIdPreserved, true);
assert.equal(composed.expectContentDisposed, true);
for (const required of ['ac_ready', 'ac_web_not_required', 'ac_missing', 'ac_unknown_stage',
  'ac_failed', 'ac_wrong_project', 'ac_replayed', 'ac_expired', 'ac_current', 'ac_production_default']) {
  assert.ok(APP_CHECK_EVIDENCE.some((x) => x.id === required), `no App Check evidence for ${required}`);
}
ok(`${LIFECYCLE_SCENARIOS.length} lifecycle scenarios incl. the composed offline-while-in-flight case; ${APP_CHECK_EVIDENCE.length} App Check evidence cases`);

// ---- 7. LEGACY DATASET COVERS EVERY CLASSIFICATION -----------------------------------
const classifications = new Set(LEGACY_STATUS_RECORDS.map((r) => r.classification));
for (const required of ['active', 'inactive_suspended', 'inactive_inactive', 'missing_status',
  'blank_status', 'malformed_status', 'unknown_status', 'malformed_record']) {
  assert.ok(classifications.has(required), `the legacy dataset has no ${required} record`);
}
ok(`${LEGACY_STATUS_RECORDS.length} legacy records covering ${classifications.size} classifications`);

console.log(`\nMonday authority world verification PASS: ${checks} checks (world ${WORLD_ID} v${WORLD_VERSION}, ${IDENTITIES.length} identities, ${SCENARIO_COUNT} scenarios, digest ${digestOf(first)}).`);
