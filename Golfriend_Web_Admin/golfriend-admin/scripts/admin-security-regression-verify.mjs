// ==========================================
// FILE: scripts/admin-security-regression-verify.mjs
// Run: node scripts/admin-security-regression-verify.mjs
//
// Hostile regression tests for the five bounded Admin security repairs. Each block ATTACKS
// the repaired path; none asserts that a function was called.
//
//   1. identity-binding analysis is structural, and catches dead/indirect gates
//   2. manageEnterpriseStaff requires a verified target, current membership and evidence
//   3. no unconditional-allow evasion survives the ruleset evaluator
//   4. coverage groups are discovered, so a new fixture group cannot hide
//   5. HRManagement classifies through the canonical registry and fails closed
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

// ---- 1. IDENTITY BINDING: the five demonstrated bypasses stay caught -----------------
{
  // The verifier's own probe set is re-run here as a REGRESSION, so weakening the analyser
  // fails this suite too — not only the verifier that owns it.
  const verifierSource = readFileSync(resolve(ROOT, 'scripts/identity-binding-verify.mjs'), 'utf8');
  // Comments are stripped first. The header explains the heuristic it REPLACED, so matching
  // raw text flagged the explanation as the defect — a check that cannot tell a description
  // from an implementation.
  const verifierCode = verifierSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(verifierCode, /createSourceFile/, 'the identity verifier no longer parses an AST');
  assert.equal(/slice\(Math\.max\(0, index - \d+\)/.test(verifierCode), false,
    'the proximity heuristic is back in code; a dead-variable gate would pass again');
  for (const required of ['isObjectBindingPattern', 'ElementAccessExpression', 'usedInGuard', 'tokenAliases']) {
    assert.match(verifierSource, new RegExp(required), `the analyser lost its ${required} handling`);
  }
  // And it must still run clean against the real tree.
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/identity-binding-verify.mjs')], { stdio: 'pipe' });
  assertions += 6;
  ok('identity binding is structural: AST-based, no proximity heuristic, handles aliases, brackets, destructuring and dead gates');
}

// ---- 2. manageEnterpriseStaff -------------------------------------------------------
{
  class StubHttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const REGISTRY_VERSION = '2026-08-15.v1';
  let DOCS = new Map();
  let AUTH_USERS = new Map();
  const created = [];
  const snap = (path) => ({ exists: DOCS.has(path), id: path.split('/').pop(), data: () => DOCS.get(path) });
  const collection = (name) => ({
    doc: (id) => ({
      id, path: `${name}/${id}`,
      get: async () => snap(`${name}/${id}`),
      // MERGE IS HONOURED. The stub replaced documents wholesale, so a { merge: true }
      // write in the handler silently dropped every field it did not restate — a tombstone
      // came out missing its own identity. The handler relies on real merge semantics.
      set: async (v, options) => DOCS.set(`${name}/${id}`, options?.merge ? { ...(DOCS.get(`${name}/${id}`) || {}), ...v } : v),
      update: async (v) => DOCS.set(`${name}/${id}`, { ...(DOCS.get(`${name}/${id}`) || {}), ...v }),
      delete: async () => DOCS.delete(`${name}/${id}`),
      create: async (v) => {
        if (DOCS.has(`${name}/${id}`)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
        DOCS.set(`${name}/${id}`, v); created.push(`${name}/${id}`);
      },
      collection: (sub) => collection(`${name}/${id}/${sub}`),
    }),
    where: () => collection(name),
    limit: () => collection(name),
    get: async () => ({ docs: [...DOCS.entries()].filter(([k]) => k.includes('/members/')).map(([, v]) => ({ data: () => v })) }),
  });
  // The membership query is CONTROLLABLE so the index-absent and full-page paths can be
  // driven, and it honours the caller's limit instead of always returning everything.
  let membershipFailure = null;
  let membershipPadding = 0;
  const membershipDocs = (limit) => {
    if (membershipFailure) throw membershipFailure;
    // A collection-group query matches a subcollection NAME wherever it lives, so the stub
    // returns every `/members/` document in the world regardless of its root — which is
    // precisely the ambiguity the path-qualified check has to survive. Each document
    // carries its real ref.path, because that path is now the evidence.
    const real = [...DOCS.entries()].filter(([k]) => k.includes('/members/')).map(([k, v]) => ({ ref: { path: k }, data: () => v }));
    const padded = real.concat(
      Array.from({ length: membershipPadding }, (_, i) => ({
        ref: { path: `enterprise_staff/pad-${i}/members/target-uid` },
        data: () => ({ staffUid: 'target-uid', status: 'removed', enterpriseUid: `pad-${i}`, organizationId: 'org-pad', registryVersion: REGISTRY_VERSION }),
      })),
    );
    const docs = padded.slice(0, limit ?? padded.length);
    return { docs, size: docs.length };
  };
  const fakeDb = {
    collection,
    collectionGroup: () => ({
      where: () => {
        const q = (limit) => ({ limit: (n) => q(n), get: async () => membershipDocs(limit) });
        return q(undefined);
      },
    }),
    // A FAITHFUL transaction: writes are buffered and applied only on commit, and create()
    // collides exactly as Firestore's does. The previous stub discarded every write, so an
    // atomicity claim could not have failed here no matter what the handler did.
    runTransaction: async (fn) => {
      const buffered = [];
      const tx = {
        get: async (r) => snap(r.path),
        set: (r, v, options) => buffered.push({ kind: 'set', path: r.path, value: v, merge: options?.merge === true }),
        update: (r, v) => buffered.push({ kind: 'set', path: r.path, value: v, merge: true }),
        create: (r, v) => buffered.push({ kind: 'create', path: r.path, value: v }),
      };
      const result = await fn(tx);
      for (const write of buffered) {
        if (write.kind === 'create' && DOCS.has(write.path)) {
          const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e;
        }
      }
      for (const write of buffered) {
        DOCS.set(write.path, write.merge ? { ...(DOCS.get(write.path) || {}), ...write.value } : write.value);
        if (write.kind === 'create') created.push(write.path);
      }
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
  inject('firebase-functions/v2/https', { HttpsError: StubHttpsError, onCall: (o, h) => { const w = (r) => (typeof o === 'function' ? o : h)(r); w.__options = typeof o === 'function' ? {} : o; return w; }, onRequest: (h) => h });
  inject('firebase-functions/v2/scheduler', { onSchedule: (o, h) => h });
  inject('firebase-functions/logger', { info: () => undefined, warn: () => undefined, error: () => undefined });
  inject('firebase-functions/params', { defineSecret: () => ({ value: () => '' }), defineString: () => ({ value: () => '' }) });
  inject('firebase-admin/firestore', { FieldValue });
  inject('@google-cloud/vision', { default: { ImageAnnotatorClient: class {} }, ImageAnnotatorClient: class {} });

  const index = nodeRequire(resolve(FUNCTIONS, 'lib/index.js'));
  const manage = index.manageEnterpriseStaff;
  assert.ok(typeof manage === 'function', 'manageEnterpriseStaff is not exported');
  // The registry vocabulary comes from the REAL module, so a version bump cannot leave
  // these fixtures quietly describing a shape the handler no longer accepts.
  const registryModule = nodeRequire(resolve(FUNCTIONS, 'lib/enterpriseMembershipRegistry.js'));
  assert.equal(REGISTRY_VERSION, registryModule.MEMBERSHIP_REGISTRY_VERSION, 'the harness pins a stale registry version');

  const INVITER = 'ent-inviter';
  const setup = () => {
    DOCS = new Map();
    AUTH_USERS = new Map();
    created.length = 0;
    membershipFailure = null;
    membershipPadding = 0;
    DOCS.set(`b2b_partners/${INVITER}`, { status: 'active_partner', tier: 'enterprise', organizationId: 'org-1' });
  };
  const invite = async (over = {}) => {
    const request = {
      auth: { uid: INVITER, token: { email: 'inviter@example.test', email_verified: true } },
      data: { action: 'invite', email: 'target@example.test', role: 'manager', ...over },
    };
    try { return { ok: true, value: await manage(request) }; }
    catch (error) { return { ok: false, code: error.code, message: error.message }; }
  };

  // (a) THE TARGET'S ADDRESS MUST BE VERIFIED. getUserByEmail resolves whoever registered
  // it first, and Firebase does not require verification to register.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: false });
  const unverified = await invite();
  assert.equal(unverified.ok, false, 'a role grant was made to an UNVERIFIED target address');
  assert.match(unverified.message, /verified/i);
  assert.equal(DOCS.has(`enterprise_staff/${INVITER}/members/target-uid`), false, 'a membership was written for an unverified target');
  assertions += 3;

  // (b) A VERIFIED target succeeds, so (a) is a control and not a blanket denial.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  const verified = await invite();
  assert.equal(verified.ok, true, verified.message || '');
  assert.equal(verified.value.staffUid, 'target-uid');
  assertions += 2;

  // (c) FAIL-CLOSED EVIDENCE is written with create(), and carries how the inviter resolved.
  const auditPath = created.find((path) => path.startsWith('enterprise_staff_grant_audits/'));
  assert.ok(auditPath, 'no grant evidence was recorded');
  const audit = DOCS.get(auditPath);
  assert.equal(audit.staffUid, 'target-uid');
  assert.equal(audit.inviterResolvedBy, 'uid');
  assert.equal(audit.targetAddressVerified, true);
  // The ADDRESS is not stored — the uid is the identity; the address was only a lookup.
  assert.equal(JSON.stringify(audit).includes('target@example.test'), false, 'the grant evidence stores the address');
  assertions += 5;

  // (d) CURRENT ORGANIZATION MEMBERSHIP: another enterprise's active staff may not be
  // silently re-homed.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  DOCS.set('enterprise_staff/other-ent/members/target-uid', {
    staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent',
    organizationId: 'org-other', registryVersion: REGISTRY_VERSION, role: 'manager', grantSeq: 1,
  });
  const foreign = await invite();
  assert.equal(foreign.ok, false, "another enterprise's active staff was re-homed");
  assert.match(foreign.message, /another enterprise/i);
  assertions += 2;

  // (e) An UNRECOGNIZED role is REFUSED, not silently coerced to venue_staff.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  for (const role of ['Director', 'superuser', '', undefined, 42, 'MANAGER']) {
    const coerced = await invite({ role });
    assert.equal(coerced.ok, false, `role ${String(role)} was accepted`);
    assert.equal(coerced.code, 'invalid-argument', String(role));
    assertions += 2;
  }

  // (f) An UNAUTHORIZED inviter is refused: no partner record, or not enterprise tier.
  for (const partner of [null, { status: 'suspended', tier: 'enterprise' }, { status: 'active_partner', tier: 'small_business' }]) {
    setup();
    if (partner) DOCS.set(`b2b_partners/${INVITER}`, partner); else DOCS.delete(`b2b_partners/${INVITER}`);
    AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
    const denied = await invite();
    assert.equal(denied.ok, false, `inviter ${JSON.stringify(partner)} was allowed to grant a role`);
    assert.equal(denied.code, 'permission-denied');
    assertions += 2;
  }
  // ---- The following five cases are the RE-REVIEW findings against the repair itself. ----

  // (g) ATOMICITY. The membership write used to run BEFORE the evidence write, so a failed
  // audit threw "No change was made" over a grant that had already persisted. Colliding the
  // audit must now abort the whole transaction and leave no membership behind.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  DOCS.set(`enterprise_staff_grant_audits/${INVITER}__target-uid__manager__1`, { preexisting: true });
  const auditBlocked = await invite();
  assert.equal(auditBlocked.ok, false, 'a grant succeeded even though its evidence could not be written');
  assert.equal(
    DOCS.has(`enterprise_staff/${INVITER}/members/target-uid`), false,
    'THE GRANT PERSISTED WITHOUT EVIDENCE: the membership survived a failed audit write',
  );
  assertions += 2;

  // (h) RE-GRANT AFTER REMOVAL PRODUCES NEW EVIDENCE. Keying the audit on
  // enterprise+staff+role alone made the second genuine grant collide with the first and be
  // swallowed as a replay, so re-granting revoked authority left no record at all.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  await invite();
  const firstAudits = created.filter((p) => p.startsWith('enterprise_staff_grant_audits/')).length;
  await manage({
    auth: { uid: INVITER, token: { email: 'inviter@example.test', email_verified: true } },
    data: { action: 'remove', staffUid: 'target-uid', reason: 'access_review', commandId: 'cmd-regrant1' },
  });
  const regrant = await invite();
  assert.equal(regrant.ok, true, regrant.message || 're-granting after removal failed');
  const allAudits = created.filter((p) => p.startsWith('enterprise_staff_grant_audits/'));
  assert.equal(firstAudits, 1, 'the first grant produced no evidence');
  assert.equal(allAudits.length, 2, 'RE-GRANTING AFTER REMOVAL PRODUCED NO NEW EVIDENCE');
  assert.equal(DOCS.get(allAudits[1]).grantSeq, 2, 'the re-grant did not receive its own sequence');
  // Now that removal tombstones instead of deleting, the re-grant can say what it replaced.
  // This asserted null when the old path destroyed the record and the answer was unknowable.
  assert.equal(DOCS.get(allAudits[1]).previousRole, 'manager', 'the re-grant did not record the role it replaced');
  assertions += 5;

  // (i) A TRUE REPLAY writes no new evidence. (h) must not have been bought by making every
  // duplicate click a fresh grant record.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  await invite();
  const replay = await invite();
  assert.equal(replay.ok, true, replay.message || '');
  assert.equal(replay.value.replayed, true, 'an identical repeat grant was not recognized as a replay');
  assert.equal(
    created.filter((p) => p.startsWith('enterprise_staff_grant_audits/')).length, 1,
    'an identical repeat grant wrote a second evidence record',
  );
  assertions += 3;

  // (j) A FULL MEMBERSHIP PAGE FAILS CLOSED. A bare limit(10) answered "no foreign
  // membership" for anyone whose eleventh document was the foreign one.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  membershipPadding = 60;
  const saturated = await invite();
  assert.equal(saturated.ok, false, 'a saturated membership page was treated as proof of no foreign enterprise');
  assert.equal(saturated.code, 'unavailable');
  assert.equal(DOCS.has(`enterprise_staff/${INVITER}/members/target-uid`), false, 'a membership was written despite an unevaluable page');
  assertions += 3;

  // (k) INDEX ABSENT (FAILED_PRECONDITION) REFUSES. Recorded in
  // docs/ENTERPRISE_STAFF_INDEX_REQUIREMENT.json: without the collection-group index the
  // query throws, and the only safe answer is to refuse rather than assume unattached.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  membershipFailure = Object.assign(new Error('FAILED_PRECONDITION: index required'), { code: 9 });
  const noIndex = await invite();
  assert.equal(noIndex.ok, false, 'a grant proceeded while the membership check was unavailable');
  assert.equal(noIndex.code, 'unavailable');
  assert.equal(DOCS.has(`enterprise_staff/${INVITER}/members/target-uid`), false, 'a membership was written without a membership check');
  assertions += 3;

  ok(`manageEnterpriseStaff: unverified target refused, verified target succeeds, evidence recorded without the address, cross-enterprise re-homing refused, ${6} role coercions refused, ${3} unauthorized inviters refused, grant+evidence atomic, re-grant evidenced, replay not double-recorded, saturated page and absent index both fail closed`);

  // ---- 2b. THE REMOVAL PATH -----------------------------------------------------------
  // Removal used to be `membersCol.doc(staffUid).delete()`: the grant vanished, the audit
  // trail lost its subject, and nothing recorded who removed whom, when, or why.
  const MEMBER_PATH = `enterprise_staff/${INVITER}/members/target-uid`;
  const REGISTRY_PATH = 'enterprise_staff_memberships/target-uid';
  const remove = async (over = {}) => {
    const request = {
      auth: { uid: INVITER, token: { email: 'inviter@example.test', email_verified: true } },
      data: { action: 'remove', staffUid: 'target-uid', reason: 'access_review', commandId: 'cmd-remove01', ...over },
    };
    try { return { ok: true, value: await manage(request) }; }
    catch (error) { return { ok: false, code: error.code, message: error.message }; }
  };
  const grantThen = async () => {
    setup();
    AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
    const granted = await invite();
    assert.equal(granted.ok, true, granted.message || 'setup grant failed');
    created.length = 0;
  };

  // (l) A REMOVAL TOMBSTONES AND LEAVES IMMUTABLE EVIDENCE. The membership must still
  // exist, marked removed, carrying actor, organization, command, reason and timestamp.
  await grantThen();
  const removed = await remove();
  assert.equal(removed.ok, true, removed.message || '');
  assert.ok(DOCS.has(MEMBER_PATH), 'THE MEMBERSHIP WAS HARD-DELETED: no tombstone survives the removal');
  const tombstone = DOCS.get(MEMBER_PATH);
  assert.equal(tombstone.status, 'removed');
  assert.equal(tombstone.previousRole, 'manager', 'the tombstone did not preserve the revoked role');
  assert.equal(tombstone.removedBy, INVITER);
  assert.equal(tombstone.removalReason, 'access_review');
  assert.equal(tombstone.removalCommandId, 'cmd-remove01');
  assert.ok(tombstone.removedAt, 'the tombstone carries no timestamp');
  const removalAudits = created.filter((p) => p.startsWith('enterprise_staff_removal_audits/'));
  assert.equal(removalAudits.length, 1, 'the removal produced no immutable evidence');
  const removalAudit = DOCS.get(removalAudits[0]);
  assert.equal(removalAudit.actorUid, INVITER, 'the evidence does not name the actor');
  assert.equal(removalAudit.organizationId, 'org-1', 'the evidence carries no organization binding');
  assert.equal(removalAudit.commandId, 'cmd-remove01', 'the evidence carries no command identity');
  assert.equal(removalAudit.reason, 'access_review');
  assert.equal(removalAudit.removedRole, 'manager');
  assert.ok(removalAudit.removedAt, 'the evidence carries no timestamp');
  assert.equal(DOCS.get(REGISTRY_PATH).status, 'removed', 'the registry still shows the principal as active staff');
  assertions += 15;

  // (m) EXACT REPLAY is idempotent: same command, same content, no second evidence record.
  const exactReplay = await remove();
  assert.equal(exactReplay.ok, true, exactReplay.message || '');
  assert.equal(exactReplay.value.replayed, true, 'an exact removal replay was not recognized');
  assert.equal(
    created.filter((p) => p.startsWith('enterprise_staff_removal_audits/')).length, 1,
    'an exact removal replay wrote a second evidence record',
  );
  assertions += 3;

  // (n) ALTERED REPLAY is refused. Same command id, different content, means the caller
  // reused an identifier for a different action; acting on either reading is a guess.
  for (const altered of [{ reason: 'security_concern' }, { staffUid: 'someone-else' }]) {
    const bad = await remove(altered);
    assert.equal(bad.ok, false, `an ALTERED replay was accepted: ${JSON.stringify(altered)}`);
    assertions += 1;
  }

  // (o) EVIDENCE FAILURE PREVENTS THE STATE CHANGE, and no partial write survives.
  await grantThen();
  DOCS.set(`enterprise_staff_removal_audits/${INVITER}__target-uid__cmd-block01`, { fingerprint: 'a-different-command' });
  const blocked = await remove({ commandId: 'cmd-block01' });
  assert.equal(blocked.ok, false, 'a removal proceeded despite an unwritable evidence record');
  assert.equal(DOCS.get(MEMBER_PATH).status, 'active', 'PARTIAL WRITE: the membership changed although the evidence failed');
  assert.equal(DOCS.get(REGISTRY_PATH).status, 'active', 'PARTIAL WRITE: the registry changed although the evidence failed');
  assertions += 3;

  // (p) REMOVAL FOLLOWED BY RE-GRANT works, and produces its own fresh evidence rather
  // than colliding with the original grant record.
  await grantThen();
  await remove();
  const regranted = await invite();
  assert.equal(regranted.ok, true, regranted.message || 're-granting after a tombstoned removal failed');
  assert.equal(regranted.value.replayed, false, 'a re-grant after removal was mistaken for a replay');
  assert.equal(DOCS.get(MEMBER_PATH).status, 'active', 'the tombstone was not reactivated');
  assert.equal(DOCS.get(REGISTRY_PATH).status, 'active', 'the registry was not restored on re-grant');
  assert.equal(
    created.filter((p) => p.startsWith('enterprise_staff_grant_audits/')).length, 1,
    'the re-grant after removal produced no new grant evidence',
  );
  assertions += 5;

  // (q) STALE AUTHORITY. A membership that has since been re-bound elsewhere is not this
  // caller's to revoke, and neither is one bound to a different organization.
  for (const [label, over] of [
    ['re-bound to another enterprise', { enterpriseUid: 'other-ent' }],
    ['bound to another organization', { organizationId: 'org-9' }],
  ]) {
    await grantThen();
    DOCS.set(MEMBER_PATH, { ...DOCS.get(MEMBER_PATH), ...over });
    const stale = await remove();
    assert.equal(stale.ok, false, `a removal succeeded against a membership ${label}`);
    assert.equal(stale.code, 'permission-denied', label);
    assertions += 2;
  }

  // (r) MALFORMED AND SURPLUS INPUT is refused rather than partially understood.
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

  // (s) SAME-NAMED FOREIGN SUBCOLLECTIONS never influence a grant. Each of these is a
  // `members` document in another domain that the old collection-group check would have
  // read as an active enterprise membership and refused the grant over.
  const FOREIGN = [
    'partner_organizations/org-9/members/target-uid',
    'clubs/club-4/members/target-uid',
    'tournaments/t-1/teams/a/members/target-uid',
  ];
  for (const path of FOREIGN) {
    setup();
    AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
    DOCS.set(path, { staffUid: 'target-uid', status: 'active', enterpriseUid: 'someone-else' });
    const unaffected = await invite();
    assert.equal(unaffected.ok, true, `a foreign ${path} blocked a legitimate grant`);
    assertions += 1;
  }

  // (t) A LEGACY or MALFORMED membership at a REAL enterprise path still fails closed —
  // (s) must not have been bought by ignoring records that genuinely matter.
  for (const [label, doc] of [
    ['pre-registry legacy record', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent', organizationId: 'org-other' }],
    ['surplus field', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent', organizationId: 'org-other', registryVersion: REGISTRY_VERSION, isAdmin: true }],
    ['path/field disagreement', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'ent-forged', organizationId: 'org-other', registryVersion: REGISTRY_VERSION }],
  ]) {
    setup();
    AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
    DOCS.set('enterprise_staff/other-ent/members/target-uid', doc);
    const failClosed = await invite();
    assert.equal(failClosed.ok, false, `a ${label} at a real enterprise path did not fail closed`);
    assertions += 1;
  }

  // (u) PAGINATION BEYOND TEN. The blocking record sits past the first ten results; the
  // old limit(10) would have answered "no foreign membership" and granted.
  setup();
  AUTH_USERS.set('target@example.test', { uid: 'target-uid', emailVerified: true });
  for (let i = 0; i < 14; i += 1) {
    DOCS.set(`enterprise_staff/quiet-${i}/members/target-uid`, {
      staffUid: 'target-uid', status: 'removed', enterpriseUid: `quiet-${i}`,
      organizationId: 'org-q', registryVersion: REGISTRY_VERSION,
    });
  }
  DOCS.set('enterprise_staff/zz-live/members/target-uid', {
    staffUid: 'target-uid', status: 'active', enterpriseUid: 'zz-live',
    organizationId: 'org-live', registryVersion: REGISTRY_VERSION,
  });
  const deepPage = await invite();
  assert.equal(deepPage.ok, false, 'a foreign membership past the first ten results was not seen');
  assert.match(deepPage.message, /another enterprise/i);
  assertions += 2;

  ok(`removal path: tombstone with actor/org/command/reason/timestamp, immutable evidence, exact replay idempotent, 2 altered replays refused, evidence failure leaves no partial write, re-grant after removal evidenced, 2 stale-authority refusals, 11 malformed/surplus inputs refused, ${FOREIGN.length} foreign subcollections ignored while 3 real-path anomalies fail closed, 15-deep pagination still catches the conflict`);
}

// ---- 3. UNCONDITIONAL-ALLOW EVASIONS -------------------------------------------------
{
  const { evaluateRuleset, PROTECTED_COLLECTIONS } = await import(`file://${resolve(ROOT, 'scripts/rules-artifact-safety-verify.mjs')}`);
  const requirement = JSON.parse(readFileSync(resolve(ROOT, 'docs/ENTERPRISE_OUTREACH_FIRESTORE_RULES_REQUIREMENT.json'), 'utf8'));
  const adminOnly = requirement.collections.map((c) => c.path.split('/')[0]);
  const complete = [
    "rules_version = '2';",
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    ...PROTECTED_COLLECTIONS.map((c) => (adminOnly.includes(c)
      ? `    match /${c}/{id} { allow read, write: if false; }`
      : `    match /${c}/{id} { allow read: if request.auth != null; allow write: if false; }`)),
    '  }',
    '}',
  ].join('\n');
  assert.deepEqual(evaluateRuleset(complete), [], 'the baseline ruleset is rejected; every case below would pass for the wrong reason');

  const target = '    match /courses/{id} { allow read: if request.auth != null; allow write: if false; }';
  const EVASIONS = [
    ['if (true)', '    match /courses/{id} { allow read, write: if (true); }'],
    ['if ((true))', '    match /courses/{id} { allow read, write: if ((true)); }'],
    ['|| true', '    match /courses/{id} { allow read, write: if request.auth != null || true; }'],
    ['true ||', '    match /courses/{id} { allow read, write: if true || request.auth != null; }'],
    ['exists() as the whole condition', '    match /courses/{id} { allow read, write: if exists(/databases/$(database)/documents/users/$(request.auth.uid)); }'],
    ['get() as the whole condition', '    match /courses/{id} { allow read, write: if get(/databases/$(database)/documents/x/y).data.ok; }'],
    ['condition never mentions the caller', '    match /courses/{id} { allow read, write: if 1 == 1; }'],
  ];
  for (const [label, replacement] of EVASIONS) {
    const candidate = complete.replace(target, replacement);
    assert.notEqual(candidate, complete, `the ${label} fixture did not apply`);
    const reasons = evaluateRuleset(candidate);
    assert.ok(reasons.length > 0, `an unconditional allow via ${label} was ACCEPTED`);
    assertions += 2;
  }
  // A legitimate conditional rule is still accepted, so this is a filter and not a wall.
  const legitimate = complete.replace(target, '    match /courses/{id} { allow read: if request.auth != null && resource.data.published == true; allow write: if false; }');
  assert.deepEqual(evaluateRuleset(legitimate), [], 'a legitimate conditional rule was rejected');
  assertions += 1;
  ok(`${EVASIONS.length} unconditional-allow evasions rejected; a legitimate conditional rule still accepted`);
}

// ---- 4. GROUP DISCOVERY IS DERIVED --------------------------------------------------
{
  const source = readFileSync(resolve(ROOT, 'scripts/coverage-honesty-verify.mjs'), 'utf8');
  assert.match(source, /Object\.entries\(world\)/, 'coverage groups are no longer discovered from the world');
  assert.equal(/world\.identities\.length \+ world\.legacyStatusRecords\.length/.test(source), false,
    'the hard-coded total is back; a new fixture group would be invisible again');
  assert.match(source, /unaccounted/, 'the discovery check does not report unaccounted groups');
  assert.match(source, /stale/, 'the discovery check does not report stale ledger entries');
  // Per-group equality, so two errors cannot cancel out in a total.
  assert.match(source, /ledger says \$\{entry\.count\} for/, 'counts are only reconciled in aggregate');
  // And it runs clean.
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/coverage-honesty-verify.mjs')], { stdio: 'pipe' });
  assertions += 6;
  ok('coverage groups are discovered from the world, reconciled per group, with unaccounted and stale detection');
}

// ---- 5. HRManagement CLASSIFIES THROUGH THE REGISTRY --------------------------------
{
  const source = readFileSync(resolve(ROOT, 'src/components/admin/HRManagement.tsx'), 'utf8');
  assert.equal(/u\.role !== 'Partner'/.test(source), false,
    "the single-literal 'Partner' denylist is back; every other out-of-registry role would render as ordinary staff");
  assert.match(source, /isCanonicalAdminRole/, 'the roster does not consult the canonical registry');
  assert.match(source, /normalizeStaffStatus/, 'the roster does not normalize status');
  assert.match(source, /classifyStaffRecord/, 'the roster has no record classifier');

  // Execute the classifier itself against hostile records, transpiled from the real file.
  // Bounded by BRACE BALANCE, not by the next declaration: an unbounded slice ran past the
  // function into the component's JSX and would not parse.
  const helperStart = source.indexOf('function classifyStaffRecord');
  assert.ok(helperStart > 0, 'classifyStaffRecord not found; this block would prove nothing');
  let depth = 0;
  let helperEnd = helperStart;
  for (let i = source.indexOf('{', helperStart); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) { helperEnd = i + 1; break; } }
  }
  const helper = source.slice(helperStart, helperEnd)
    // The return type alias lives outside the slice; `any` is enough to execute it.
    .replace(/: StaffAuthority/g, ': any')
    .replace(/: any\b(?=\s*\{)/, '');
  const js = ts.transpileModule(
    `import { ACTIVE_ADMIN_STATUSES, CANONICAL_ADMIN_ROLES, isCanonicalAdminRole, normalizeStaffStatus } from ${JSON.stringify(`file://${resolve(ROOT, 'src/auth/roleJourney.js')}`)};\n`
    + helper.replace(/^function/, 'export function'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const { classifyStaffRecord } = await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);

  const CASES = [
    [{ role: 'Director', status: 'Active' }, 'active'],
    [{ role: 'Manager', status: 'active' }, 'active'],
    [{ role: 'Support', status: '  ACTIVE  ' }, 'active'],
    [{ role: 'Partner', status: 'Active' }, 'denied'],
    [{ role: 'intern', status: 'Active' }, 'denied'],
    [{ role: 'director', status: 'Active' }, 'denied'],
    [{ role: 'primary_owner', status: 'Active' }, 'denied'],
    [{ role: 'Directоr', status: 'Active' }, 'denied'],
    [{ role: 'Director', status: 'Suspended' }, 'denied'],
    [{ role: 'Director', status: 'Archived' }, 'denied'],
    [{ role: 'Director' }, 'denied'],
    [{ status: 'Active' }, 'denied'],
    [{ role: '', status: 'Active' }, 'denied'],
    [{ role: 42, status: 'Active' }, 'denied'],
    [null, 'denied'],
    ['Director', 'denied'],
  ];
  for (const [record, expected] of CASES) {
    const verdict = classifyStaffRecord(record);
    assert.equal(verdict.effective, expected, `HR classifier on ${JSON.stringify(record)}`);
    assert.ok(verdict.detail && verdict.detail.length > 0, 'a verdict carries no explanation for the operator');
    assertions += 2;
  }
  // The verdict must NAME the problem, so an operator can tell a status repair from a role
  // repair — they are different fixes.
  assert.equal(classifyStaffRecord({ role: 'intern', status: 'Active' }).reason, 'unknown_role');
  assert.equal(classifyStaffRecord({ role: 'Director', status: 'Suspended' }).reason, 'inactive_status');
  assert.equal(classifyStaffRecord({ role: 'Director' }).reason, 'missing_status');
  assert.equal(classifyStaffRecord({ status: 'Active' }).reason, 'missing_role');
  assertions += 4;
  ok(`HRManagement classifies through the registry: ${CASES.length} hostile records, every non-canonical one denied with a named reason`);
}

console.log(`\nAdmin security regression PASS: ${checks} checks, ${assertions} hostile assertions across all seven repaired paths.`);
