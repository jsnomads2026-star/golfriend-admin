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
  let DOCS = new Map();
  let AUTH_USERS = new Map();
  const created = [];
  const snap = (path) => ({ exists: DOCS.has(path), id: path.split('/').pop(), data: () => DOCS.get(path) });
  const collection = (name) => ({
    doc: (id) => ({
      id, path: `${name}/${id}`,
      get: async () => snap(`${name}/${id}`),
      set: async (v) => DOCS.set(`${name}/${id}`, v),
      update: async () => undefined,
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
    const real = [...DOCS.entries()].filter(([k]) => k.includes('/members/')).map(([, v]) => ({ data: () => v }));
    const padded = real.concat(
      Array.from({ length: membershipPadding }, (_, i) => ({ data: () => ({ staffUid: 'target-uid', status: 'inactive', enterpriseUid: `pad-${i}` }) })),
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
        set: (r, v) => buffered.push({ kind: 'set', path: r.path, value: v }),
        update: (r, v) => buffered.push({ kind: 'set', path: r.path, value: v }),
        create: (r, v) => buffered.push({ kind: 'create', path: r.path, value: v }),
      };
      const result = await fn(tx);
      for (const write of buffered) {
        if (write.kind === 'create' && DOCS.has(write.path)) {
          const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e;
        }
      }
      for (const write of buffered) {
        DOCS.set(write.path, write.value);
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
  DOCS.set('enterprise_staff/other-ent/members/target-uid', { staffUid: 'target-uid', status: 'active', enterpriseUid: 'other-ent' });
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
  await manage({ auth: { uid: INVITER, token: { email: 'inviter@example.test', email_verified: true } }, data: { action: 'remove', staffUid: 'target-uid' } });
  const regrant = await invite();
  assert.equal(regrant.ok, true, regrant.message || 're-granting after removal failed');
  const allAudits = created.filter((p) => p.startsWith('enterprise_staff_grant_audits/'));
  assert.equal(firstAudits, 1, 'the first grant produced no evidence');
  assert.equal(allAudits.length, 2, 'RE-GRANTING AFTER REMOVAL PRODUCED NO NEW EVIDENCE');
  assert.equal(DOCS.get(allAudits[1]).grantSeq, 2, 'the re-grant did not receive its own sequence');
  assert.equal(DOCS.get(allAudits[1]).previousRole, null, 'the re-grant recorded a stale previous role');
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

console.log(`\nAdmin security regression PASS: ${checks} checks, ${assertions} hostile assertions across all five repaired paths.`);
