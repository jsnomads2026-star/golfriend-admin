// ==========================================
// FILE: scripts/enterprise-staff-contract-verify.mjs
// Run: node scripts/enterprise-staff-contract-verify.mjs
//
// Hostile behavioural tests for manageEnterpriseStaff, driven against the REAL
// compiled callable with Firebase stubbed — plus caller compatibility, so the screen
// that calls it cannot drift back to a payload the server refuses.
//
// The scenario ledger at the bottom is what scripts/coverage-honesty-verify.mjs reads:
// every group declared EXECUTED here must resolve to a real assertion target.
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

let checks = 0;
let assertions = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((c) => existsSync(c));
assert.ok(tsc, 'no local typescript compiler found');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

// ---- THE STUBBED WORLD ---------------------------------------------------------------
class StubHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const REGISTRY_VERSION = '2026-08-15.v1';
let DOCS = new Map();
let AUTH_USERS = new Map();
const created = [];
let membershipFailure = null;
let membershipPadding = 0;

const snap = (path) => ({ exists: DOCS.has(path), id: path.split('/').pop(), data: () => DOCS.get(path) });
const merge = (path, value, doMerge) => DOCS.set(path, doMerge ? { ...(DOCS.get(path) || {}), ...value } : value);
const collection = (name) => ({
  doc: (id) => ({
    id, path: `${name}/${id}`,
    get: async () => snap(`${name}/${id}`),
    // MERGE IS HONOURED: replacing documents wholesale made a tombstone come out
    // missing its own identity fields, which the handler relies on being kept.
    set: async (v, o) => merge(`${name}/${id}`, v, o?.merge === true),
    update: async (v) => merge(`${name}/${id}`, v, true),
    delete: async () => DOCS.delete(`${name}/${id}`),
    create: async (v) => {
      if (DOCS.has(`${name}/${id}`)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
      DOCS.set(`${name}/${id}`, v); created.push(`${name}/${id}`);
    },
    collection: (sub) => collection(`${name}/${id}/${sub}`),
  }),
});
// A collection-group query matches a subcollection NAME wherever it lives, so the stub
// returns every `/members/` document regardless of its root — the exact ambiguity the
// path-qualified check must survive. Each carries its real ref.path.
const membershipDocs = (limit) => {
  if (membershipFailure) throw membershipFailure;
  const real = [...DOCS.entries()].filter(([k]) => k.includes('/members/')).map(([k, v]) => ({ ref: { path: k }, data: () => v }));
  const padded = real.concat(Array.from({ length: membershipPadding }, (_, i) => ({
    ref: { path: `enterprise_staff/pad-${i}/members/target-uid` },
    data: () => ({ staffUid: 'target-uid', status: 'removed', enterpriseUid: `pad-${i}`, organizationId: 'org-pad', registryVersion: REGISTRY_VERSION }),
  })));
  const docs = padded.slice(0, limit ?? padded.length);
  return { docs, size: docs.length };
};
const fakeDb = {
  collection,
  collectionGroup: () => ({
    where: () => { const q = (limit) => ({ limit: (n) => q(n), get: async () => membershipDocs(limit) }); return q(undefined); },
  }),
  // A FAITHFUL transaction: writes buffer and apply only on commit, and create()
  // collides exactly as Firestore's does. A stub that discards writes cannot fail an
  // atomicity claim no matter what the handler does.
  runTransaction: async (fn) => {
    const buffered = [];
    const tx = {
      get: async (r) => snap(r.path),
      set: (r, v, o) => buffered.push({ kind: 'set', path: r.path, value: v, merge: o?.merge === true }),
      update: (r, v) => buffered.push({ kind: 'set', path: r.path, value: v, merge: true }),
      create: (r, v) => buffered.push({ kind: 'create', path: r.path, value: v }),
    };
    const result = await fn(tx);
    for (const w of buffered) {
      if (w.kind === 'create' && DOCS.has(w.path)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
    }
    for (const w of buffered) { merge(w.path, w.value, w.merge); if (w.kind === 'create') created.push(w.path); }
    return result;
  },
};
const FieldValue = { serverTimestamp: () => 'TS', increment: (n) => n, arrayUnion: (...v) => v, delete: () => null };
const inject = (spec, exportsValue) => {
  let resolved; try { resolved = nodeRequire.resolve(spec); } catch { resolved = spec; }
  nodeRequire.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
};
inject('firebase-admin', {
  apps: [{}], initializeApp: () => undefined,
  firestore: Object.assign(() => fakeDb, { FieldValue }),
  auth: () => ({ getUserByEmail: async (e) => { if (!AUTH_USERS.has(e)) throw new Error('not found'); return AUTH_USERS.get(e); } }),
  storage: () => ({ bucket: () => ({}) }),
});
inject('firebase-functions/v2/https', { HttpsError: StubHttpsError, onCall: (o, h) => (typeof o === 'function' ? o : h), onRequest: (h) => h });
inject('firebase-functions/v2/scheduler', { onSchedule: (o, h) => h });
inject('firebase-functions/logger', { info: () => undefined, warn: () => undefined, error: () => undefined });
inject('firebase-functions/params', { defineSecret: () => ({ value: () => '' }), defineString: () => ({ value: () => '' }) });
inject('firebase-admin/firestore', { FieldValue });
inject('@google-cloud/vision', { default: { ImageAnnotatorClient: class {} }, ImageAnnotatorClient: class {} });

const index = nodeRequire(resolve(FUNCTIONS, 'lib/index.js'));
const manage = index.manageEnterpriseStaff;
assert.ok(typeof manage === 'function', 'manageEnterpriseStaff is not exported');
const registryModule = nodeRequire(resolve(FUNCTIONS, 'lib/enterpriseMembershipRegistry.js'));
assert.equal(REGISTRY_VERSION, registryModule.MEMBERSHIP_REGISTRY_VERSION, 'the harness pins a stale registry version');

const INVITER = 'ent-inviter';
const MEMBER_PATH = `enterprise_staff/${INVITER}/members/target-uid`;
const REGISTRY_PATH = 'enterprise_staff_memberships/target-uid';
const setup = () => {
  DOCS = new Map(); AUTH_USERS = new Map(); created.length = 0;
  membershipFailure = null; membershipPadding = 0;
  DOCS.set(`b2b_partners/${INVITER}`, { status: 'active_partner', tier: 'enterprise', organizationId: 'org-1' });
};
const auth = { uid: INVITER, token: { email: 'inviter@example.test', email_verified: true } };
const call = async (data) => {
  try { return { ok: true, value: await manage({ auth, data }) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
};
const invite = (over = {}) => call({ action: 'invite', email: 'target@example.test', role: 'manager', ...over });
const remove = (over = {}) => call({ action: 'remove', staffUid: 'target-uid', reason: 'access_review', commandId: 'cmd-remove01', ...over });
const grantThen = async () => {
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  const g = await invite();
  assert.equal(g.ok, true, g.message || 'setup grant failed');
  created.length = 0;
};

// ---- 1. IDENTITY AND ROLE ------------------------------------------------------------
setup();
AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: false });
const unverified = await invite();
assert.equal(unverified.ok, false, 'a role grant was made to an UNVERIFIED target address');
assert.equal(DOCS.has(MEMBER_PATH), false, 'a membership was written for an unverified target');
assertions += 2;

await grantThen();
assert.equal(DOCS.get(MEMBER_PATH).status, 'active');
assert.equal(DOCS.get(REGISTRY_PATH).status, 'active', 'the registry was not written on grant');
assertions += 2;

// An unrecognized role is REFUSED, never coerced to venue_staff.
for (const role of ['Director', 'superuser', 'MANAGER', '', undefined, 42]) {
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  const coerced = await invite({ role });
  assert.equal(coerced.ok, false, `role ${String(role)} was accepted`);
  assert.equal(coerced.code, 'invalid-argument', String(role));
  assertions += 2;
}
// An unauthorized caller is refused.
for (const partner of [null, { status: 'suspended', tier: 'enterprise' }, { status: 'active_partner', tier: 'small_business' }]) {
  setup();
  if (partner) DOCS.set(`b2b_partners/${INVITER}`, partner); else DOCS.delete(`b2b_partners/${INVITER}`);
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  const denied = await invite();
  assert.equal(denied.ok, false, `caller ${JSON.stringify(partner)} was allowed to grant a role`);
  assert.equal(denied.code, 'permission-denied');
  assertions += 2;
}
ok('identity and role: unverified target refused, registry written on grant, 6 role coercions refused, 3 unauthorized callers refused');

// ---- 2. PATH-QUALIFIED MEMBERSHIP ADMISSION -----------------------------------------
// Same-named foreign subcollections must NOT block a legitimate grant.
for (const path of ['partner_organizations/org-9/members/target-uid', 'clubs/club-4/members/target-uid', 'tournaments/t-1/teams/a/members/target-uid']) {
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  DOCS.set(path, { staffUid: 'target-uid', status: 'active', enterpriseUid: 'someone-else' });
  const unaffected = await invite();
  assert.equal(unaffected.ok, true, `a foreign ${path} blocked a legitimate grant`);
  assertions += 1;
}
// A real enterprise path that is cross-enterprise, legacy or malformed fails closed.
for (const [label, doc] of [
  ['cross-enterprise', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent', organizationId: 'org-other', registryVersion: REGISTRY_VERSION, role: 'manager', grantSeq: 1 }],
  ['pre-registry legacy', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent', organizationId: 'org-other' }],
  ['surplus field', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent', organizationId: 'org-other', registryVersion: REGISTRY_VERSION, isAdmin: true }],
  ['path/field disagreement', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'ent-forged', organizationId: 'org-other', registryVersion: REGISTRY_VERSION }],
]) {
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  DOCS.set('enterprise_staff/other-ent/members/target-uid', doc);
  const failClosed = await invite();
  assert.equal(failClosed.ok, false, `a ${label} record at a real enterprise path did not fail closed`);
  assertions += 1;
}
// PAGINATION BEYOND TEN: the blocking record sits past the first ten results.
setup();
AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
for (let i = 0; i < 14; i += 1) {
  DOCS.set(`enterprise_staff/quiet-${i}/members/target-uid`, { staffUid: 'target-uid', status: 'removed', enterpriseUid: `quiet-${i}`, organizationId: 'org-q', registryVersion: REGISTRY_VERSION });
}
DOCS.set('enterprise_staff/zz-live/members/target-uid', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'zz-live', organizationId: 'org-live', registryVersion: REGISTRY_VERSION });
const deepPage = await invite();
assert.equal(deepPage.ok, false, 'a foreign membership past the first ten results was not seen');
assertions += 1;
// A saturated page, and an absent collection-group index, both fail closed.
setup();
AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
membershipPadding = 60;
const saturated = await invite();
assert.equal(saturated.ok, false, 'a saturated page was treated as proof of no foreign enterprise');
assert.equal(saturated.code, 'unavailable');
assertions += 2;
setup();
AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
membershipFailure = Object.assign(new Error('FAILED_PRECONDITION: index required'), { code: 9 });
const noIndex = await invite();
assert.equal(noIndex.ok, false, 'a grant proceeded while the membership check was unavailable');
assert.equal(DOCS.has(MEMBER_PATH), false, 'a membership was written without a membership check');
assertions += 2;
ok('admission: 3 foreign subcollections ignored, 4 real-path anomalies fail closed, 15-deep pagination catches the conflict, saturated page and absent index refuse');

// ---- 3. THE REMOVAL PATH -------------------------------------------------------------
await grantThen();
const removed = await remove();
assert.equal(removed.ok, true, removed.message || '');
assert.ok(DOCS.has(MEMBER_PATH), 'THE MEMBERSHIP WAS HARD-DELETED: no tombstone survives');
const tomb = DOCS.get(MEMBER_PATH);
assert.equal(tomb.status, 'removed');
assert.equal(tomb.previousRole, 'manager', 'the tombstone did not preserve the revoked role');
assert.equal(tomb.removedBy, INVITER);
assert.equal(tomb.removalReason, 'access_review');
assert.equal(tomb.removalCommandId, 'cmd-remove01');
assert.ok(tomb.removedAt, 'the tombstone carries no timestamp');
const removalAudits = created.filter((p) => p.startsWith('enterprise_staff_removal_audits/'));
assert.equal(removalAudits.length, 1, 'the removal produced no immutable evidence');
const audit = DOCS.get(removalAudits[0]);
assert.equal(audit.actorUid, INVITER, 'the evidence does not name the actor');
assert.equal(audit.organizationId, 'org-1', 'the evidence carries no organization binding');
assert.equal(audit.commandId, 'cmd-remove01', 'the evidence carries no command identity');
assert.equal(audit.reason, 'access_review');
assert.equal(audit.removedRole, 'manager');
assert.equal(DOCS.get(REGISTRY_PATH).status, 'removed', 'the registry still shows the principal as active staff');
assertions += 14;

// EXACT REPLAY is idempotent; ALTERED REPLAY is refused.
const replay = await remove();
assert.equal(replay.ok, true, replay.message || '');
assert.equal(replay.value.replayed, true, 'an exact removal replay was not recognized');
assert.equal(created.filter((p) => p.startsWith('enterprise_staff_removal_audits/')).length, 1, 'an exact replay wrote a second evidence record');
assertions += 3;
for (const altered of [{ reason: 'security_concern' }, { staffUid: 'someone-else' }]) {
  const bad = await remove(altered);
  assert.equal(bad.ok, false, `an ALTERED replay was accepted: ${JSON.stringify(altered)}`);
  assertions += 1;
}

// EVIDENCE FAILURE PREVENTS THE STATE CHANGE — no partial write survives.
await grantThen();
DOCS.set(`enterprise_staff_removal_audits/${INVITER}__target-uid__cmd-block01`, { fingerprint: 'a-different-command' });
const blocked = await remove({ commandId: 'cmd-block01' });
assert.equal(blocked.ok, false, 'a removal proceeded despite unwritable evidence');
assert.equal(DOCS.get(MEMBER_PATH).status, 'active', 'PARTIAL WRITE: the membership changed although the evidence failed');
assert.equal(DOCS.get(REGISTRY_PATH).status, 'active', 'PARTIAL WRITE: the registry changed although the evidence failed');
assertions += 3;

// REMOVAL THEN RE-GRANT produces its own fresh evidence.
await grantThen();
await remove();
const regranted = await invite();
assert.equal(regranted.ok, true, regranted.message || 're-granting after a tombstoned removal failed');
assert.equal(regranted.value.replayed, false, 'a re-grant after removal was mistaken for a replay');
assert.equal(DOCS.get(MEMBER_PATH).status, 'active', 'the tombstone was not reactivated');
assert.equal(created.filter((p) => p.startsWith('enterprise_staff_grant_audits/')).length, 1, 'the re-grant produced no new grant evidence');
assertions += 4;

// STALE AUTHORITY: a membership since re-bound elsewhere is not this caller's to revoke.
for (const [label, over] of [['another enterprise', { enterpriseUid: 'other-ent' }], ['another organization', { organizationId: 'org-9' }]]) {
  await grantThen();
  DOCS.set(MEMBER_PATH, { ...DOCS.get(MEMBER_PATH), ...over });
  const stale = await remove();
  assert.equal(stale.ok, false, `a removal succeeded against a membership bound to ${label}`);
  assert.equal(stale.code, 'permission-denied', label);
  assertions += 2;
}

// MALFORMED AND SURPLUS INPUT is refused rather than partially understood.
await grantThen();
for (const bad of [
  { reason: 'because I said so' }, { reason: '' }, { reason: undefined },
  { commandId: 'short' }, { commandId: 'has space' }, { commandId: undefined },
  { staffUid: '' }, { staffUid: 42 },
  { role: 'Director' }, { enterpriseUid: INVITER }, { status: 'active' },
]) {
  const refused = await remove(bad);
  assert.equal(refused.ok, false, `removal accepted malformed/surplus input: ${JSON.stringify(bad)}`);
  assert.equal(refused.code, 'invalid-argument', JSON.stringify(bad));
  assertions += 2;
}
ok('removal: tombstone with actor/org/command/reason/timestamp, immutable evidence, exact replay idempotent, 2 altered replays refused, evidence failure leaves no partial write, re-grant evidenced, 2 stale-authority refusals, 11 malformed/surplus inputs refused');

// ---- 4. CALLER COMPATIBILITY ---------------------------------------------------------
// The screen that calls this must send what the server requires. A caller drifting back
// to the obsolete payload is a live outage on the Remove button, not a test failure.
const caller = readFileSync(resolve(ROOT, 'src/components/B2B/enterprise/StaffRoles.tsx'), 'utf8');
const removeCall = caller.slice(caller.indexOf("action: 'remove'"));
assert.ok(caller.includes("action: 'remove'"), 'the caller no longer performs a removal');
for (const field of ['staffUid', 'reason', 'commandId']) {
  assert.ok(new RegExp(`\\b${field}\\b`).test(removeCall.slice(0, 200)), `the remove payload omits ${field}`);
}
// The reason vocabulary must MATCH the server's, exactly and completely.
const serverReasons = [...registryModule.REMOVAL_REASONS];
for (const reason of serverReasons) {
  assert.ok(caller.includes(`'${reason}'`), `the caller cannot offer the server reason ${reason}`);
}
// The command id must be persisted, not regenerated per render.
assert.ok(/localStorage/.test(caller), 'the command id is not persisted, so a retry after a reload would remove twice');
assert.ok(/COMMAND_STORE_KEY|persistentCommandId/.test(caller), 'no persistent command-id derivation exists');
// Eight-locale messaging, from the canonical source.
const dict = readFileSync(resolve(ROOT, 'src/i18n/partner/enterpriseStaff.ts'), 'utf8');
const localeCodes = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/locales.ts'), 'utf8')
  .match(/LOCALE_CODES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
assert.equal(localeCodes.length, 8, 'the canonical locale set is not eight');
for (const code of localeCodes) {
  assert.ok(new RegExp(`^  ${code}: \\{`, 'm').test(dict), `the enterprise staff dictionary has no ${code} block`);
}
for (const reason of serverReasons) {
  assert.ok(dict.includes(`reason_${reason}:`), `no localized label for reason ${reason}`);
}
assert.ok(/err_invalid_argument|err_unavailable/.test(dict), 'refusal codes are not localized');
assert.equal(/window\.confirm/.test(caller), false, 'removal still uses a bare confirm with no reason');
assertions += 8 + serverReasons.length * 2 + localeCodes.length;
ok(`caller compatibility: remove sends staffUid+reason+commandId, ${serverReasons.length} reasons match the server, command id persisted, ${localeCodes.length} locales present`);

// ---- THE SCENARIO LEDGER -------------------------------------------------------------
// Read by scripts/coverage-honesty-verify.mjs. Every EXECUTED group names the module
// and export its assertions actually drive.
export const SCENARIO_LEDGER = [
  { group: 'identityAndRole', status: 'executed', module: 'functions/lib/index.js', exports: ['manageEnterpriseStaff'] },
  { group: 'membershipAdmission', status: 'executed', module: 'functions/lib/enterpriseMembershipRegistry.js', exports: ['evaluateMembershipCandidate', 'decideMembershipAdmission'] },
  { group: 'removalPath', status: 'executed', module: 'functions/lib/enterpriseMembershipRegistry.js', exports: ['removalFingerprint', 'isRemovalReason', 'isValidCommandId'] },
  { group: 'callerCompatibility', status: 'executed', module: 'src/components/B2B/enterprise/StaffRoles.tsx', exports: [] },
];

console.log(`\nEnterprise staff contract PASS: ${checks} checks, ${assertions} hostile assertions against the real compiled callable.`);
