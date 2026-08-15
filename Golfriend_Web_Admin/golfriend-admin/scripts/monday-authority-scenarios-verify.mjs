// ==========================================
// FILE: scripts/monday-authority-scenarios-verify.mjs
// Run: node scripts/monday-authority-scenarios-verify.mjs
//
// Executes the Monday Test World authority fixtures against the REAL modules: the shared
// predicate, the client journey, the migration classifier, the App Check port, the intent
// ledger, and the compiled Portal callables.
//
// The fixtures carry their own expected verdicts. That is the point — if the expectations
// were derived from the implementation, the world would agree with whatever the code
// happens to do, which is how several controls in this lane previously passed while inert.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');
const nodeRequire = createRequire(resolve(FUNCTIONS, 'lib/index.js'));
const ts = createRequire(import.meta.url)('typescript');

let checks = 0;
let assertions = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((c) => existsSync(c));
assert.ok(tsc, 'no local typescript compiler found');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

const worldModule = await import(`file://${resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs')}`);
const world = worldModule.seed();
const SCENARIOS_DECLARED = world.scenarios.length;

const authorityMod = await import(`file://${resolve(FUNCTIONS, 'lib/authority.js')}`);
const authority = authorityMod.default ?? authorityMod;
const journey = await import(`file://${resolve(ROOT, 'src/auth/roleJourney.js')}`);
const appCheckMod = await import(`file://${resolve(FUNCTIONS, 'lib/appCheckCommissioning.js')}`);
const appCheck = appCheckMod.default ?? appCheckMod;

async function loadTs(relativePath) {
  const source = readFileSync(resolve(ROOT, relativePath), 'utf8').replace(/^import type .*$/gm, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
}
const intent = await loadTs('src/components/admin/v2/outreachIntent.ts');
const migration = await import(`file://${resolve(ROOT, 'scripts/admin-status-migration-dryrun.mjs')}`);

// ---- 1. EVERY IDENTITY'S PREDICATE VERDICT MATCHES THE FIXTURE ----------------------
const identityFailures = [];
for (const identity of world.identities) {
  const staff = authority.isActiveStaff(identity.adminDoc);
  const director = authority.isActiveDirector(identity.adminDoc);
  assertions += 2;
  if (staff !== identity.expect.staff) {
    identityFailures.push(`${identity.principalId} (${identity.label}): staff expected ${identity.expect.staff}, got ${staff}`);
  }
  if (director !== identity.expect.director) {
    identityFailures.push(`${identity.principalId}: director expected ${identity.expect.director}, got ${director}`);
  }
  // The CLIENT journey must reach the same verdict for admin principals.
  if (identity.adminDoc !== null) {
    const resolved = journey.resolvePortalAccess({ mode: 'admin', user: { uid: identity.principalId }, adminDoc: identity.adminDoc });
    assertions += 1;
    const clientAuthorized = resolved.state === 'authorized';
    if (clientAuthorized !== staff) {
      identityFailures.push(`${identity.principalId}: server says ${staff}, client journey says ${resolved.state}`);
    }
  }
}
assert.deepEqual(identityFailures, [], `IDENTITY VERDICT MISMATCHES:\n  ${identityFailures.join('\n  ')}`);
// The client's own PREDICATE, not only its journey. These three were claimed by the
// coverage ledger and never actually invoked — the invocation check in
// verify:coverage-honesty caught it, which is what that gate is for.
for (const identity of world.identities) {
  if (identity.adminDoc === null) continue;
  const clientPredicate = journey.isActiveAdminDoc(identity.adminDoc);
  assertions += 1;
  if (clientPredicate !== identity.expect.staff) {
    identityFailures.push(`${identity.principalId}: client isActiveAdminDoc says ${clientPredicate}, fixture expects ${identity.expect.staff}`);
  }
}
assert.deepEqual(identityFailures, [], `CLIENT PREDICATE MISMATCHES:\n  ${identityFailures.join('\n  ')}`);
ok(`${world.identities.length} identities: server predicate, client predicate and client journey all match the fixture verdicts`);

// ---- 2. EMAIL IS NEVER AUTHORITATIVE -------------------------------------------------
// The collision group shares one address across distinct principals with different
// authority. If any surface bound on the address, they would be indistinguishable.
const collisionAddress = 'mtw-collision@example.test';
const collisionGroup = world.identities.filter((i) => i.contactEmail === collisionAddress);
assert.ok(collisionGroup.length >= 3, 'the collision group is too small to prove the point');
const verdicts = collisionGroup.map((i) => authority.isActiveStaff(i.adminDoc));
assert.equal(new Set(collisionGroup.map((i) => i.principalId)).size, collisionGroup.length);
assert.ok(verdicts.every((v) => v === false), 'a collision-group principal gained staff authority');
// And the predicate's only input is the document — there is no address parameter at all.
assert.equal(authority.isActiveStaff.length, 1, 'the predicate takes more than the document');
ok(`${collisionGroup.length} principals share one address with distinct authority; the predicate has no address input`);

// ---- 3. LEGACY MIGRATION OUTCOMES ----------------------------------------------------
const migrationFailures = [];
for (const record of world.legacyStatusRecords) {
  const classification = migration.classify(record.data);
  // Role classification too: after the registry closed the vocabulary, a record can have a
  // perfect status and still lose access because of its ROLE, and the repair differs.
  const roleVerdict = migration.classifyRole(record.data);
  if (record.authorizes && roleVerdict !== 'canonical_role') {
    migrationFailures.push(record.principalId + ": authorizes but role classifies as " + roleVerdict);
  }
  const authorizes = migration.wouldAuthorize(record.data);
  assertions += 2;
  if (classification !== record.classification) {
    migrationFailures.push(`${record.principalId}: expected ${record.classification}, got ${classification}`);
  }
  if (authorizes !== record.authorizes) {
    migrationFailures.push(`${record.principalId}: wouldAuthorize expected ${record.authorizes}, got ${authorizes}`);
  }
}
assert.deepEqual(migrationFailures, [], `MIGRATION CLASSIFICATION MISMATCHES:\n  ${migrationFailures.join('\n  ')}`);

const mixed = migration.analyze(world.legacyStatusRecords.map((r) => ({ uid: r.principalId, data: r.data })));
const mixedDecision = migration.activationDecision(mixed);
assert.equal(mixedDecision.activate, false, 'activation was permitted on a population with non-conforming privileged records');
assert.ok(mixedDecision.blockers.length >= 1);

const noDirector = migration.analyze(world.legacyNoSurvivingDirector.map((r) => ({ uid: r.principalId, data: r.data })));
const noDirectorDecision = migration.activationDecision(noDirector);
assert.equal(noDirectorDecision.activate, false, 'activation was permitted with no surviving active Director');
assert.ok(
  noDirectorDecision.blockers.some((b) => /no Director/.test(b)),
  'the no-surviving-Director population was refused, but not for that reason',
);

const conforming = migration.analyze(world.legacyConforming.map((r) => ({ uid: r.principalId, data: r.data })));
assert.equal(migration.activationDecision(conforming).activate, true, 'a wholly conforming population was refused — the check is a stub');

// No identity may appear in the analysis output.
const serialized = JSON.stringify({ mixed, noDirector, conforming });
for (const record of world.legacyStatusRecords) {
  assert.equal(serialized.includes(record.principalId), false, `the analysis leaked ${record.principalId}`);
}
for (const repair of mixed.repairs) assert.match(repair.ref, /^rec-[0-9a-f]{12}$/);
ok(`${world.legacyStatusRecords.length} legacy records classified as specified; activation refused for the mixed and no-Director populations, permitted for the conforming one; no identity in the output`);

// ---- 4. APP CHECK EVIDENCE ------------------------------------------------------------
const NOW = 1_800_000_000;
const appCheckFailures = [];
for (const evidenceCase of world.appCheckEvidence) {
  const stage = evidenceCase.stage === '__CURRENT__' ? appCheck.COMMISSIONING_STAGE : evidenceCase.stage;
  const memory = appCheck.createReplayMemory();
  let evidence = evidenceCase.evidence;
  if (evidence) {
    evidence = {
      ...evidence,
      projectId: evidence.projectId === '__EXPECTED__' ? appCheck.EXPECTED_PROJECT_ID : evidence.projectId,
      issuedAt: NOW + evidence.issuedAt,
      expiresAt: NOW + evidence.expiresAt,
    };
  }
  // A replay case must be seen once before it is replayed.
  if (evidenceCase.replayOf) memory.remember(evidenceCase.replayOf);
  const decision = appCheck.decideAppCheck(evidence, stage, memory, NOW);
  assertions += 1;
  if (decision.code !== evidenceCase.expect) {
    appCheckFailures.push(`${evidenceCase.id}: expected ${evidenceCase.expect}, got ${decision.code}`);
  }
  // Nothing that is not fully verified may be reported as attested.
  if (decision.code !== 'allowed') assert.equal(decision.unattested, true, evidenceCase.id);
}
assert.deepEqual(appCheckFailures, [], `APP CHECK MISMATCHES:\n  ${appCheckFailures.join('\n  ')}`);
// The production default refuses regardless of evidence quality.
assert.equal(appCheck.REQUIRED_IN_PRODUCTION, true);
assert.equal(appCheck.commissioningReadiness().ready, false);
ok(`${world.appCheckEvidence.length} App Check evidence cases produce the specified decisions; the production default refuses regardless of evidence`);

// ---- 5. LIFECYCLE: DISPOSAL PRESERVES IN-FLIGHT IDENTITY, DISPOSES CONTENT ----------
const makeStore = () => {
  const map = new Map();
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    size: () => map.size,
  };
  Object.defineProperty(store, 'length', { get: () => map.size });
  store.key = (i) => [...map.keys()][i] ?? null;
  return store;
};
const INTENT = { draftId: 'dev_mock_mtw_draft_01', requestedState: 'approved', expectedVersion: 3, contentRef: 'subject|body' };
const lifecycleFailures = [];
/**
 * Each event is modelled EXPLICITLY rather than derived from a formula. An earlier version
 * computed the expectation from a predicate that disagreed with how the event was set up,
 * so two scenarios "failed" because of the harness rather than the product.
 *
 *   inFlight  — is a request awaiting a response when the privacy event fires?
 *   altered   — does the retry describe a DIFFERENT intent (new content/version)?
 */
const LIFECYCLE_MODEL = {
  offline_before_reserve:  { inFlight: false, altered: false },
  transport_failure:       { inFlight: false, altered: false },
  restart:                 { inFlight: true,  altered: false },
  retry_same:              { inFlight: true,  altered: false },
  retry_altered:           { inFlight: true,  altered: true  },
  logout:                  { inFlight: false, altered: false },
  member_switch:           { inFlight: false, altered: false },
  role_change:             { inFlight: false, altered: false },
  suspension:              { inFlight: false, altered: false },
  deactivation:            { inFlight: false, altered: false },
  appcheck_failure:        { inFlight: false, altered: false },
  offline_while_in_flight: { inFlight: true,  altered: false },
  late_completion:         { inFlight: true,  altered: false },
};
for (const scenario of world.lifecycleScenarios) {
  const model = LIFECYCLE_MODEL[scenario.event];
  assert.ok(model, `no execution model for lifecycle event ${scenario.event}`);
  const store = makeStore();
  let seq = 0;
  const ledger = intent.createIntentLedger(store, 'fp-active', () => `id${(seq += 1)}`);
  const reserved = ledger.reserve(INTENT);
  if (model.inFlight) ledger.markInFlight(INTENT);

  if (scenario.expectContentDisposed) ledger.disposeAll();

  // An altered retry describes a different intent, so it must NOT reuse the id.
  const retryIntent = model.altered ? { ...INTENT, contentRef: 'subject|EDITED BODY' } : INTENT;
  const after = ledger.reserve(retryIntent);
  const idPreserved = after.commandId === reserved.commandId;
  assertions += 1;

  // The required outcome, stated per event:
  //  - an ALTERED retry never reuses an id, whatever else happened;
  //  - an IN-FLIGHT id survives disposal (otherwise the retry double-applies);
  //  - a settled/never-started id is disposable.
  const expectPreserved = model.altered
    ? false
    : (model.inFlight || !scenario.expectContentDisposed);
  if (idPreserved !== expectPreserved) {
    lifecycleFailures.push(`${scenario.id} (${scenario.event}): id preserved=${idPreserved}, expected ${expectPreserved}`);
  }
  // And the fixture's own expectation must agree with the model, or the fixture is stale.
  if (scenario.expectIdPreserved !== expectPreserved) {
    lifecycleFailures.push(`${scenario.id}: fixture expects idPreserved=${scenario.expectIdPreserved} but the modelled outcome is ${expectPreserved}`);
  }
}
assert.deepEqual(lifecycleFailures, [], `LIFECYCLE MISMATCHES:\n  ${lifecycleFailures.join('\n  ')}`);

// THE COMPOSED CASE, spelled out: offline while a command is in flight must dispose the
// private content and KEEP the command identity. Losing the id means the retry mints a new
// one and the server applies an accepted-but-response-lost command a second time.
{
  const store = makeStore();
  let seq = 0;
  const ledger = intent.createIntentLedger(store, 'fp-active', () => `id${(seq += 1)}`);
  const reserved = ledger.reserve(INTENT);
  ledger.markInFlight(INTENT);
  const settledIntent = { ...INTENT, draftId: 'dev_mock_mtw_draft_02' };
  ledger.reserve(settledIntent);           // reserved but NOT in flight — private, disposable
  assert.equal(store.size(), 2);
  ledger.disposeAll();
  assert.equal(ledger.reserve(INTENT).commandId, reserved.commandId,
    'OFFLINE DISPOSAL DESTROYED THE IN-FLIGHT COMMAND ID — the retry would double-apply');
  assert.equal(store.size(), 1, 'the settled intent was not disposed, so disposal is a no-op');
  // Content disposal is the component's `setRows([])`; the ledger's part is the id, and the
  // fingerprint check is what tells the component to drop the rows.
  assert.equal(intent.shouldDisposeCache(
    { uid: 'a', role: 'Manager', status: 'Active', online: true },
    { uid: 'a', role: 'Manager', status: 'Active', online: false },
  ), true, 'going offline does not trigger content disposal');
  assertions += 4;
}
  // Intent retirement: only an AUTHORITATIVE outcome retires an id. A transport failure
  // must not, or the retry mints a new id and the command applies twice.
  assert.equal(intent.isAuthoritativeOutcome({ applied: true, code: null }), true);
  assert.equal(intent.isAuthoritativeOutcome({ applied: false, code: 'separation_of_duties' }), true);
  assert.equal(intent.isAuthoritativeOutcome({ applied: false, code: 'internal_error' }), false);
  assert.equal(intent.isAuthoritativeOutcome(null), false);
  assertions += 4;
ok(`${world.lifecycleScenarios.length} lifecycle scenarios; offline-while-in-flight disposes private content AND preserves the command identity`);

// ---- 6. ORGANIZATION SCENARIOS AGAINST THE REAL PORTAL RUNTIME ----------------------
// Stubbed infrastructure, real compiled callable, fixture-driven documents.
class StubHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
let DOCS = new Map();
const snap = (path) => ({ exists: DOCS.has(path), id: path.split('/').pop(), data: () => DOCS.get(path) });
const query = () => ({ where: () => query(), orderBy: () => query(), limit: () => query(), get: async () => ({ docs: [], empty: true, forEach: () => undefined }) });
const collection = (name) => ({
  doc: (id) => ({ id, path: `${name}/${id}`, get: async () => snap(`${name}/${id}`), set: async () => undefined, update: async () => undefined, create: async () => undefined, collection: (sub) => collection(`${name}/${id}/${sub}`) }),
  where: () => query(), orderBy: () => query(), limit: () => query(), get: async () => ({ docs: [], empty: true, forEach: () => undefined }), add: async () => ({ id: 'x' }),
});
const fakeDb = {
  collection,
  runTransaction: async (fn) => fn({ get: async (ref) => (ref?.path ? snap(ref.path) : { exists: false, data: () => undefined }), set: () => undefined, update: () => undefined, create: () => undefined }),
};
const FieldValue = { serverTimestamp: () => 'TS', increment: (n) => n, arrayUnion: (...v) => v, delete: () => null };
const inject = (spec, exportsValue) => {
  let resolved; try { resolved = nodeRequire.resolve(spec); } catch { resolved = spec; }
  nodeRequire.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
};
inject('firebase-admin', { apps: [{}], initializeApp: () => undefined, firestore: Object.assign(() => fakeDb, { FieldValue }), auth: () => ({}), storage: () => ({ bucket: () => ({}) }) });
inject('firebase-functions/v2/https', { HttpsError: StubHttpsError, onCall: (o, h) => { const w = (r) => (typeof o === 'function' ? o : h)(r); w.__options = typeof o === 'function' ? {} : o; return w; }, onRequest: (h) => h });
inject('firebase-functions/v2/scheduler', { onSchedule: (o, h) => h });
inject('firebase-functions/logger', { info: () => undefined, warn: () => undefined, error: () => undefined });
inject('firebase-functions/params', { defineSecret: () => ({ value: () => '' }), defineString: () => ({ value: () => '' }) });
inject('firebase-admin/firestore', { FieldValue });

const activation = nodeRequire(resolve(FUNCTIONS, 'lib/partnerActivationRuntime.js'));
const AUTH_REFUSALS = ['Approved partner required.', 'Active membership required.', 'Active organization required.', 'Owner or manager required.', 'Admin required.', 'Active Admin role required.'];

const orgFailures = [];
for (const scenario of world.organizationScenarios) {
  const identity = world.identities.find((i) => i.principalId === scenario.principalId);
  DOCS = new Map();
  // Seed exactly the fixture's world for this principal.
  if (identity.partner) {
    DOCS.set(`partner_identity_bindings/${identity.principalId}`, { organizationId: identity.partner.organizationId, verifiedAuthUid: identity.principalId });
    DOCS.set(`partner_memberships/${identity.partner.organizationId}_${identity.principalId}`, {
      organizationId: identity.partner.organizationId, uid: identity.principalId,
      role: identity.partner.role, status: identity.partner.membershipStatus, version: identity.partner.membershipVersion,
    });
  }
  for (const org of world.organizations) {
    DOCS.set(`partner_organizations/${org.organizationId}`, { status: org.status, version: org.version, primaryOwnerUid: org.primaryOwnerPrincipalId, authorizedCourseIds: org.authorizedCourseIds });
  }

  // managePartnerStaff/invite is the "create a representative / mint a principal" path.
  const request = {
    auth: { uid: identity.principalId, token: { email: identity.contactEmail, email_verified: identity.emailVerified } },
    app: { appId: 'stub' },
    data: { commandId: 'cmd-dev-mock-mtw', action: 'invite', email: 'mtw-new-rep@example.test', role: 'viewer', expectedVersion: 1, organizationId: scenario.organizationId },
  };
  let authorized;
  try {
    await activation.managePartnerStaff(request);
    authorized = true;
  } catch (error) {
    const isAuthRefusal = error instanceof StubHttpsError && error.code === 'permission-denied'
      && AUTH_REFUSALS.some((phrase) => error.message.includes(phrase));
    authorized = !isAuthRefusal;
  }
  assertions += 1;
  // Scenarios that model a client-side/lifecycle concern are asserted elsewhere; here we
  // check every scenario whose action the runtime actually implements.
  if (['create_representative', 'mint_principal'].includes(scenario.action) && authorized !== scenario.expectAuthorized) {
    orgFailures.push(`${scenario.id}: authorized=${authorized}, expected ${scenario.expectAuthorized}`);
  }
}
assert.deepEqual(orgFailures, [], `ORGANIZATION SCENARIO MISMATCHES:\n  ${orgFailures.join('\n  ')}`);
// CROSS-ORGANIZATION REDIRECTION IS IMPOSSIBLE BY CONSTRUCTION, not by a comparison: the
// runtime derives the organization from the caller's identity binding and never reads it
// from the request, so a payload organizationId cannot redirect the action. A check that
// merely compared two ids could be bypassed by omitting one; this cannot.
{
  const activationSource = readFileSync(resolve(FUNCTIONS, 'src/partnerActivationRuntime.ts'), 'utf8');
  const memberFn = activationSource.slice(
    activationSource.indexOf('async function member('),
    activationSource.indexOf('async function audit('),
  );
  assert.ok(memberFn.length > 50, 'could not locate member() — this check would pass vacuously');
  assert.match(memberFn, /partner_identity_bindings/, 'member() no longer derives the organization from the identity binding');
  assert.equal(/r\.data\??\.organizationId/.test(memberFn), false, 'member() reads organizationId from the request payload');
  assert.match(memberFn, /partner_organizations/, 'member() no longer checks that the organization is active');
  assertions += 4;
}
ok('cross-organization redirection is impossible: the organization comes from the identity binding, never the payload');
ok(`${world.organizationScenarios.filter((x) => ['create_representative', 'mint_principal'].includes(x.action)).length} organization-authority scenarios executed against the real partner runtime`);

// ---- 7. A SUSPENDED ORGANIZATION DENIES EVEN ITS OWN ACTIVE MANAGER ------------------
// Called out separately because it is the finding a prior review reproduced: membership
// status alone was checked, so suspension was inert and a new principal could be minted
// inside a suspended organization.
{
  const manager = world.identities.find((i) => i.principalId === 'dev_mock_mtw_prn_partner_mgr_suspended_org');
  DOCS = new Map();
  DOCS.set(`partner_identity_bindings/${manager.principalId}`, { organizationId: manager.partner.organizationId });
  DOCS.set(`partner_memberships/${manager.partner.organizationId}_${manager.principalId}`, { organizationId: manager.partner.organizationId, role: 'manager', status: 'active', version: 2 });
  DOCS.set(`partner_organizations/${manager.partner.organizationId}`, { status: 'suspended', version: 7 });
  let refused = false;
  let reason = '';
  try {
    await activation.managePartnerStaff({
      auth: { uid: manager.principalId, token: { email: manager.contactEmail, email_verified: true } },
      app: { appId: 'stub' },
      data: { commandId: 'cmd-dev-mock-susp', action: 'invite', email: 'mtw-x@example.test', role: 'viewer' },
    });
  } catch (error) { refused = error.code === 'permission-denied'; reason = error.message; }
  assert.ok(refused, 'a manager inside a SUSPENDED organization was allowed to mint a new principal');
  assert.match(reason, /Active organization required/, `refused, but for the wrong reason: ${reason}`);
  assertions += 2;
  // The same manager in an ACTIVE organization is NOT refused, so this is the org check.
  DOCS.set(`partner_organizations/${manager.partner.organizationId}`, { status: 'active', version: 7 });
  let stillRefusedForOrg = false;
  try {
    await activation.managePartnerStaff({
      auth: { uid: manager.principalId, token: { email: manager.contactEmail, email_verified: true } },
      app: { appId: 'stub' },
      data: { commandId: 'cmd-dev-mock-act', action: 'invite', email: 'mtw-y@example.test', role: 'viewer' },
    });
  } catch (error) { stillRefusedForOrg = /Active organization required/.test(error.message); }
  assert.equal(stillRefusedForOrg, false, 'the organization check refuses even an ACTIVE organization — it is a blanket denial');
  assertions += 1;
}
ok('a suspended organization refuses principal minting by its own active manager, and an active one does not');

// EXECUTED vs DECLARED, reported separately. An earlier summary counted all 205 scenarios
// as executed; 169 of them are surface declarations with no call-site mapping, and reporting
// them as coverage was simply untrue.
const executedOrgScenarios = world.organizationScenarios
  .filter((x) => ['create_representative', 'mint_principal'].includes(x.action)).length;
console.log(`\nMonday authority scenarios PASS: ${checks} checks, ${assertions} assertions EXECUTED against real modules.`);
console.log(`  executed: ${world.identities.length} identities (predicate + client journey), ${world.legacyStatusRecords.length} legacy records, ${world.appCheckEvidence.length} attestation cases, ${world.lifecycleScenarios.length} lifecycle events, ${executedOrgScenarios}/${world.organizationScenarios.length} organization scenarios`);
console.log(`  DECLARED ONLY: ${world.scenarios.length} surface scenarios across 13 privileged surfaces — no surface-name-to-call-site mapping exists yet, so they are a specification, not coverage.`);
console.log('  The Portal call sites are covered separately by verify:portal-authority-callsites (20 sites, 380 real invocations).');
