// ==========================================
// FILE: scripts/outreach-production-binding-verify.mjs
// Run: node scripts/outreach-production-binding-verify.mjs
//
// Verifies the PRODUCTION persistence binding end to end:
//   1. the Functions bundle compiles;
//   2. the adversarial authority + store suites pass;
//   3. the server canonical/digest implementation agrees BYTE FOR BYTE with the client
//      one over shared vectors — the property the whole approval chain rests on;
//   4. the callables in index.ts carry the authorization, server-clock and
//      no-transmission properties, checked statically against the source.
//
// No emulator, no network, no deploy, no production project.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync, readdirSync, readFileSync as read } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

// ---- 1. The Functions bundle compiles -------------------------------------------
// tsc is invoked through node directly rather than through npx: spawning a .cmd shim on
// Windows needs a shell, and running a verifier through a shell is how quoting bugs get in.
const tsc = [
  resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'),
  resolve(ROOT, 'node_modules/typescript/bin/tsc'),
].find((candidate) => existsSync(candidate));
assert.ok(tsc, 'no local typescript compiler found for functions/');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });
void read;
ok('functions/ compiles (tsc)');

// ---- 2. The adversarial server suites pass ---------------------------------------
for (const suite of ['outreachAuthority.test.js', 'outreachStore.test.js']) {
  const out = execFileSync(process.execPath, [`lib/${suite}`], { cwd: FUNCTIONS, encoding: 'utf8' });
  assert.match(out, /adversarial blocks passed/, `${suite} did not report a pass`);
  ok(`${suite}: ${out.trim().split('\n').pop().slice(0, 90)}…`);
}

// ---- 3. Client and server canonical forms must be IDENTICAL ----------------------
// Two implementations of one canonical form is a real risk: if they ever diverge, content
// approved against one digest can be persisted under another. So the equality is asserted
// over shared vectors rather than assumed from the fact that both files look similar.
const client = await import(`file://${resolve(ROOT, 'src/components/admin/v2/outreachDigest.mjs')}`);
const serverModule = await import(`file://${resolve(FUNCTIONS, 'lib/outreachCanonical.js')}`);
const server = serverModule.default ?? serverModule;

const BASE = {
  draftType: 'introduction', locale: 'th', templateVersion: '2026-08-15.v1',
  jurisdiction: 'TH', jurisdictionApprovalVersion: null,
  prospectRef: 'prospect-a1', contactRef: 'contact-b2',
  recipientRole: null, recipientRef: null, contactPreferenceVersion: 'cp-1',
  consentVersion: 'cv-1', doNotContactVersion: 'dnc-1', purpose: 'course_partnership',
  evidenceVersion: null, subject: 'Golfriend', body: 'Preview only.',
};

const VECTORS = [
  BASE,
  { ...BASE, subject: 'สวัสดีค่ะ', body: 'ทดสอบ\nบรรทัดที่สอง' },
  { ...BASE, subject: '골프렌드', body: '안녕하세요' },
  { ...BASE, subject: 'ゴルフレンド', body: 'テスト' },
  { ...BASE, subject: '高爾夫', body: '測試' },
  { ...BASE, subject: 'Grüße', body: 'Über\tTab' },
  { ...BASE, subject: 'a'.repeat(8192), body: '' },
  { ...BASE, recipientRole: 'general_manager', recipientRef: 'rcpt-1', evidenceVersion: 'ev-9', jurisdictionApprovalVersion: 'j-1' },
  // A value containing the field delimiter — the case a delimiter-joined form would break on.
  { ...BASE, subject: 'x\nbody:1:y', body: '' },
  { ...BASE, subject: '', body: '' },
];

for (const [index, vector] of VECTORS.entries()) {
  const a = client.canonicalizeOutreachContent(vector);
  const b = server.canonicalizeOutreachContent(vector);
  assert.equal(a.ok, b.ok, `vector ${index}: ok flags diverge`);
  assert.equal(a.canonical, b.canonical, `vector ${index}: canonical strings diverge`);
  assert.equal(
    client.outreachContentDigest(vector).digest,
    server.outreachContentDigest(vector).digest,
    `vector ${index}: DIGESTS DIVERGE — an approval recorded on one side would not verify on the other`,
  );
}
ok(`client/server canonical form and digest agree over ${VECTORS.length} vectors`);

// Refusals must agree too: a value the client rejects must not be silently accepted by the
// server, or content could be persisted that the reviewing surface would never render.
const REFUSALS = [
  { ...BASE, extra: 'x' },
  { ...BASE, subject: 'a‮b' },
  { ...BASE, subject: 'café' },
  { ...BASE, draftType: null },
  { ...BASE, subject: 'x'.repeat(8193) },
  { ...BASE, subject: 42 },
  null,
  [],
  'string',
];
for (const [index, vector] of REFUSALS.entries()) {
  const a = client.canonicalizeOutreachContent(vector);
  const b = server.canonicalizeOutreachContent(vector);
  assert.equal(a.ok, false, `refusal ${index}: the client accepted it`);
  assert.equal(b.ok, false, `refusal ${index}: the SERVER accepted what the client refused`);
  assert.equal(a.error, b.error, `refusal ${index}: refusal reasons diverge (${a.error} vs ${b.error})`);
}
ok(`client/server refuse identically over ${REFUSALS.length} hostile inputs`);

// A shared NIST vector, so neither side is merely self-consistent.
assert.equal(server.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(client.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(server.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
ok('both implementations match the NIST SHA-256 vectors');


// ---- 5. THE UI'S ACTUAL PAYLOAD MUST WORK ----------------------------------------
// The whole mounted feature once shipped inert: every button returned content_rejected,
// because the UI sent no `content` and the server demanded it. Every server test
// hand-wrote a payload no caller ever sent, and a source-level regex could not see it.
// So the payload is now EXTRACTED FROM THE COMPONENT and run through the real store.
const uiSource = readFileSync(resolve(ROOT, 'src/components/admin/v2/V2OutreachApprovals.tsx'), 'utf8');
const commandCall = uiSource.slice(uiSource.indexOf('transport.command({'), uiSource.indexOf('});', uiSource.indexOf('transport.command({')));
const uiKeys = [...commandCall.matchAll(/^\s*([a-zA-Z]+)[,:]/gm)].map((m) => m[1]);
assert.ok(uiKeys.includes('op') && uiKeys.includes('draftId') && uiKeys.includes('expectedVersion'), `could not parse the UI command payload: ${uiKeys.join(',')}`);

const storeModule = await import(`file://${resolve(FUNCTIONS, 'lib/outreachStore.js')}`);
const { createOutreachStore } = storeModule.default ?? storeModule;
const fake = {
  data: new Map(),
  collection(name) {
    const self = this;
    return {
      doc(id) { return { __path: `${name}/${id}`, __id: id, get: async () => ({ exists: self.data.has(`${name}/${id}`), id, data: () => self.data.get(`${name}/${id}`) }) }; },
      limit(n) { return { get: async () => ({ docs: [...self.data.entries()].filter(([k]) => k.startsWith(name + '/')).slice(0, n).map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }) }; },
    };
  },
  async runTransaction(fn) {
    const creates = []; const updates = [];
    const tx = {
      get: async (ref) => ({ exists: this.data.has(ref.__path), id: ref.__id, data: () => this.data.get(ref.__path) }),
      create: (ref, value) => { if (this.data.has(ref.__path)) throw new Error('ALREADY_EXISTS'); creates.push([ref.__path, value]); },
      update: (ref, patch) => updates.push([ref.__path, patch]),
    };
    const out = await fn(tx);
    for (const [p, val] of creates) this.data.set(p, val);
    for (const [p, patch] of updates) this.data.set(p, { ...this.data.get(p), ...patch });
    return out;
  },
};
fake.data.set('admin_users/author-x', { role: 'Support', status: 'Active' });
fake.data.set('admin_users/reviewer-x', { role: 'Support', status: 'Active' });
fake.data.set('enterprise_legal_holds/uid1', { active: false });
const boundStore = createOutreachStore(fake);
const ctx = (uid) => ({ uid, adminDoc: null, appCheckVerified: true });
const at = '2026-08-15T09:00:00.000Z';
const made = await boundStore.createDraft({ caller: ctx('author-x'), draftId: 'uid1', content: BASE, jurisdiction: 'TH', expiresAt: null, commandId: 'ui-a', now: at });
assert.equal(made.ok, true, `draft creation failed: ${made.code}`);
const assigned = await boundStore.assignReviewer({ caller: ctx('author-x'), draftId: 'uid1', expectedVersion: 1, reviewerUid: 'reviewer-x', commandId: 'ui-b', now: at });
assert.equal(assigned.ok, true, `assignment failed: ${assigned.code}`);

// EXACTLY the shape the component builds — nothing added, nothing helpfully filled in.
// The reviewer must PREVIEW first: the server graph has no reviewer_assigned -> approved
// edge, so this walks the UI's real sequence rather than a shortcut the component cannot
// take. If the UI ever loses its preview button, the approve step below stops succeeding.
const previewed = await boundStore.transition({ caller: ctx('reviewer-x'), draftId: 'uid1', expectedVersion: 2, requestedState: 'previewed', commandId: 'ui-pv', now: at });
assert.equal(previewed.ok, true, `the UI cannot preview: ${previewed.code}`);
assert.ok(uiSource.includes("send(row, 'previewed')"), 'the UI offers no preview action, so no reviewer could ever reach an approval');
const uiPayload = { op: 'transition', draftId: 'uid1', expectedVersion: 3, requestedState: 'approved', commandId: 'ui-c' };
assert.deepEqual([...uiKeys].sort(), Object.keys(uiPayload).sort(), 'the UI payload shape drifted from the shape this check exercises');
const approved = await boundStore.transition({ caller: ctx('reviewer-x'), draftId: uiPayload.draftId, expectedVersion: uiPayload.expectedVersion, requestedState: uiPayload.requestedState, commandId: uiPayload.commandId, now: at });
assert.equal(approved.ok, true, `THE MOUNTED UI CANNOT APPROVE: the component's own payload was refused with '${approved.code}'`);
assert.equal(approved.state, 'approved');
ok("the component's own command payload succeeds against the real store");

// The reviewer can also read what they are approving: an approval surface that cannot
// display the draft is not a human approval.
// The ASSIGNED REVIEWER must be able to read what they are approving.
const listed = await boundStore.listDrafts(ctx('reviewer-x'));
assert.equal(listed.ok, true);
assert.equal(listed.rows[0].subject, BASE.subject, 'the reviewer cannot read the subject they are approving');
assert.equal(listed.rows[0].body, BASE.body, 'the reviewer cannot read the body they are approving');
assert.equal(listed.rows[0].sendable, false);
// An UNRELATED staff member sees the row but NOT the free text. Persisting the content
// created that exposure; scoping it is what keeps the projection honest about carrying no
// one else's information.
fake.data.set('admin_users/reader-x', { role: 'Support', status: 'Active' });
const outsider = await boundStore.listDrafts(ctx('reader-x'));
assert.equal(outsider.rows[0].subject, null, 'an unrelated staff member received the draft subject');
assert.equal(outsider.rows[0].body, null, 'an unrelated staff member received the draft body');
assert.equal(outsider.rows[0].state, 'approved', 'the row itself must still be visible');
ok('draft content reaches the creator and assigned reviewer only, and nothing is sendable');

// ---- 4. The callable boundary, checked against the source -------------------------
const index = readFileSync(resolve(FUNCTIONS, 'src/index.ts'), 'utf8');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const start = index.indexOf('export const outreachDraftCommand');
assert.ok(start > 0, 'outreachDraftCommand is not exported from the bundle entry');
const callables = stripComments(index.slice(start));

assert.match(callables, /if \(!request\.auth \|\| !request\.auth\.uid\)/, 'the command callable does not require an authenticated caller');
assert.match(callables, /new HttpsError\('unauthenticated'/, 'an unauthenticated caller is not refused');
assert.ok(index.includes('export const listOutreachDrafts'), 'the listing callable is not exported');
ok('both callables refuse an unauthenticated caller');

// The caller context is assembled from VERIFIED runtime values. A role, uid or reviewer
// identity read out of request.data would be the whole authorization model undone.
const context = stripComments(index.slice(index.indexOf('function outreachCaller'), index.indexOf('export const outreachDraftCommand')));
assert.match(context, /request\.auth[\s\S]*uid/, 'the caller uid does not come from request.auth');
assert.match(context, /appCheckVerified:\s*!!request\.app/, 'App Check state does not come from request.app');
assert.doesNotMatch(context, /request\.data/, 'the caller context reads request.data — a client could forge its own identity');
assert.doesNotMatch(callables, /data\.(uid|role|adminDoc|isAdmin|claims|createdBy|actorRef|approved)\b/, 'a callable reads an identity or authorization field out of the client payload');
ok('caller identity, role and App Check state come only from verified runtime values');

// The clock is the server's. A caller-supplied timestamp could walk a draft past its expiry.
assert.match(callables, /const now = outreachNow\(\)/, 'the callable does not use the server clock');
assert.doesNotMatch(callables, /now:\s*data\./, 'a callable accepts a caller-supplied timestamp');
ok('transitions use the server clock, never a caller timestamp');

// Refusals return a code; the underlying error is logged, never returned.
assert.match(callables, /code:\s*'internal_error'/, 'the callable does not return a stable code on failure');
assert.doesNotMatch(callables, /(message|error\.message|String\(error\)|error\.stack)\s*[,}]/, 'a callable returns an internal error message to the client');
ok('failures return a stable code; internal messages stay server-side');

// No transmitter. This is the standing constraint, asserted rather than trusted.
const store = readFileSync(resolve(FUNCTIONS, 'src/outreachStore.ts'), 'utf8');
const authority = readFileSync(resolve(FUNCTIONS, 'src/outreachAuthority.ts'), 'utf8');
for (const [name, source] of [['outreachStore.ts', store], ['outreachAuthority.ts', authority], ['the callables', callables]]) {
  assert.doesNotMatch(stripComments(source), /nodemailer|sendgrid|sendMail|smtp|mailgun|postmark|axios\.post|fetch\(/i, `${name} contains an outbound transmission path`);
}
assert.match(authority, /export const TRANSMISSION_ENABLED = false/, 'TRANSMISSION_ENABLED is not declared false');
assert.match(stripComments(authority), /export const APP_CHECK_ENFORCED = false/, 'APP_CHECK_ENFORCED is not a single declared constant');
ok('no transmitter exists in the server binding; TRANSMISSION_ENABLED is false');

// The store never decides authority — every decision routes through the pure core.
assert.match(store, /decideTransition|decideAssignment/, 'the store does not route through the authority core');
assert.doesNotMatch(stripComments(store), /state:\s*requestedState/, 'the store writes a caller-supplied state directly');
assert.match(stripComments(store), /state: decision\.toState/, 'the store does not write the SERVER-decided state');
assert.match(stripComments(store), /version: decision\.toVersion/, 'the store does not write the SERVER-decided version');
ok('the store writes only server-decided state and version');

// Client Firestore rules must not be the only thing standing between a browser and these
// collections — the Admin UI reaches them exclusively through the callables.
const ui = readFileSync(resolve(ROOT, 'src/components/admin/v2/V2OutreachApprovals.tsx'), 'utf8');
const service = readFileSync(resolve(ROOT, 'src/components/admin/v2/outreachService.ts'), 'utf8');
assert.doesNotMatch(ui + service, /firebase\/firestore|setDoc\(|updateDoc\(|addDoc\(|deleteDoc\(|writeBatch\(/, 'the Admin surface writes Firestore directly instead of calling the authoritative service');
assert.match(service, /httpsCallable\(getFunctions\(\), 'outreachDraftCommand'\)/, 'the service does not call the command callable');
assert.match(service, /httpsCallable\(getFunctions\(\), 'listOutreachDrafts'\)/, 'the service does not call the listing callable');
ok('the Admin surface reaches this data only through the callables');

// Every UI action must go through the transport. A local state machine would be authority
// simulation — the exact thing this mission forbids.
assert.doesNotMatch(ui, /setRows\(\s*rows\.map|setRows\(\s*\(prev\)/, 'the UI patches rows locally instead of re-reading the server');
assert.match(ui, /await transport\.command\(/, 'a UI action does not call the authoritative service');
// Specifically: the result of the re-read is APPLIED. Matching a bare `await load()` would
// also pass against a component that fetched and then threw the answer away.
assert.match(ui, /applyList\(await load\(\)\)/, 'the UI does not re-read and apply server state after a command');
assert.doesNotMatch(ui, /setRows\(\[\s*\.\.\.rows/, 'the UI appends rows locally instead of re-reading');
ok('every UI action calls the service; state is re-read from the server');


// ---- 6. THE SERVER-OWNED COLLECTIONS ARE UNREACHABLE FROM ANY CLIENT ---------------
// This repository owns no canonical firestore.rules (firebase.json has no 'firestore'
// section; .emulator-local/firestore.rules is untracked scratch), so the rules themselves
// are a handoff. What CAN be proved here is the two claims that handoff makes: the server
// reaches these collections through the Admin SDK, and no client code touches them at all.
// Until the rules land, that second property is the only thing protecting them, so it is
// asserted on every gate run rather than assumed.
const SERVER_OWNED_COLLECTIONS = [
  'enterprise_outreach_drafts', 'enterprise_outreach_receipts', 'enterprise_outreach_commands',
  'enterprise_legal_holds', 'enterprise_jurisdiction_approvals',
  // The enterprise staff grant collections are server-owned on exactly the same terms: the
  // membership document IS the role grant, the audit is the evidence it happened, and the
  // counter is what stops a re-grant from overwriting that evidence.
  'enterprise_staff', 'enterprise_staff_grant_audits', 'enterprise_staff_grant_counters',
  'enterprise_staff_memberships', 'enterprise_staff_removal_audits',
];
const requirementPath = resolve(ROOT, 'docs/ENTERPRISE_OUTREACH_FIRESTORE_RULES_REQUIREMENT.json');
assert.ok(existsSync(requirementPath), 'the rules requirement handoff document is missing');
const requirement = JSON.parse(readFileSync(requirementPath, 'utf8'));
assert.deepEqual(
  requirement.collections.map((c) => c.path.split('/')[0]).sort(),
  [...SERVER_OWNED_COLLECTIONS].sort(),
  'the rules requirement does not cover exactly the collections this lane creates',
);
for (const collection of requirement.collections) {
  assert.equal(collection.clientRead, 'deny', collection.path);
  assert.equal(collection.clientWrite, 'deny', collection.path);
}
assert.ok(requirement.testContract.length >= 10, 'the rules test contract is too thin to hand over');
// Every declared server-owned collection must actually be reached by SERVER code, so the
// requirement cannot list a collection nothing creates — nor omit one that exists. The
// check used to name outreachStore.ts alone; the enterprise grant collections live in
// index.ts, and pinning it to one file would have meant either a false entry in the
// handoff or dropping those collections out of the rules owner's scope entirely.
const serverSources = [
  'functions/src/outreachStore.ts',
  'functions/src/index.ts',
  // The registry collection name is defined here as a constant, not written out at the
  // call site — a collection is no less real for being named once.
  'functions/src/enterpriseMembershipRegistry.ts',
].map((rel) => readFileSync(resolve(ROOT, rel), 'utf8')).join('\n');
for (const collection of SERVER_OWNED_COLLECTIONS) {
  assert.ok(serverSources.includes(collection), `no server module references ${collection}`);
}

// No CLIENT file may name these collections at all. src/ is the browser bundle; a single
// getDoc/collection() call there would be a direct path around the callables.
const clientFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) clientFiles.push(full);
  }
};
walk(resolve(ROOT, 'src'));
const clientOffenders = [];
for (const file of clientFiles) {
  const text = readFileSync(file, 'utf8');
  for (const collection of SERVER_OWNED_COLLECTIONS) {
    if (text.includes(collection)) clientOffenders.push(`${relative(ROOT, file).replace(/\\/g, '/')} names ${collection}`);
  }
}
assert.deepEqual(clientOffenders, [], `client code references a server-owned collection:\n  ${clientOffenders.join('\n  ')}`);

// And the server reaches them through the Admin SDK Firestore handle, never a client SDK.
assert.doesNotMatch(store, /from ['"]firebase\/firestore['"]/, 'the store imports the CLIENT Firestore SDK');
assert.match(store, /from ["']firebase-admin\/firestore["']/, 'the store does not use the Admin SDK Firestore types');
// ALIASES AND ALTERNATE PATHS. A deny rule on an exact path is bypassed by anything else
// that reaches the same data — a collection-group query, a nested copy, or a name the
// client assembles indirectly. The contract's alternate-path controls are enforced here
// for every part this repository can actually see.
assert.ok(requirement.aliasAndAlternatePathControls, 'the rules requirement declares no alternate-path controls');
assert.ok(requirement.aliasAndAlternatePathControls.forbiddenAlternatePaths.length >= 5, 'too few alternate-path controls to hand over');
for (const collection of requirement.collections) {
  assert.ok(Array.isArray(collection.permittedServerProjection), collection.path + ' declares no permitted projection');
  assert.ok(Array.isArray(collection.neverProjected) && collection.neverProjected.length > 0, collection.path + ' declares nothing as never-projected');
  // A collection with NO client-facing projection must SAY SO, rather than arriving here
  // with an empty allowlist that is indistinguishable from an omission.
  if (collection.permittedServerProjection.length === 0) {
    assert.equal(collection.serverProjection, 'none',
      collection.path + ' has an empty projection allowlist but does not declare serverProjection: "none"');
  }
  // The caller requirement must be RECORDED and specific. It was pinned to the literal
  // 'Active' — the Admin staff requirement — which the enterprise grant collections would
  // have had to state falsely, since those callables require an active enterprise partner
  // instead. An artifact the rules owner will act on must not be made to lie to pass a gate.
  assert.match(String(collection.requiredCallerStatus || ''), /^(Active|n\/a \(no client path\))$/,
    collection.path + ' does not record a specific caller requirement');
  assert.match(collection.writeAuthority, /^admin_sdk_only/, collection.path + ' permits a non-Admin-SDK write');
}

// No collection-group query anywhere may name a server-owned collection.
const groupPattern = (name) => new RegExp('collectionGroup\\s*\\(\\s*[\'"`]' + name);
const groupOffenders = [];
for (const file of clientFiles) {
  const text = readFileSync(file, 'utf8');
  for (const collection of SERVER_OWNED_COLLECTIONS) {
    if (groupPattern(collection).test(text)) groupOffenders.push(relative(ROOT, file).replace(/\\/g, '/') + ' → ' + collection);
  }
}
assert.deepEqual(groupOffenders, [], 'a collection-group query reaches a server-owned collection:\n  ' + groupOffenders.join('\n  '));

// Nor may client code assemble one of these names indirectly.
const indirect = [];
for (const file of clientFiles) {
  const text = readFileSync(file, 'utf8');
  // Catches 'enterprise_' + x, 'enterprise' + '_outreach…', template interpolation and
  // array joins. The previous single pattern caught only the first of those.
  const INDIRECT_PATTERNS = [
    /['"`]enterprise_?['"`]\s*\+/,
    /\+\s*['"`]_?outreach_[a-z]+['"`]/,
    /`enterprise_\$\{/,
    /\['"`]enterprise['"`]\s*,\s*['"`]outreach/,
  ];
  if (INDIRECT_PATTERNS.some((pattern) => pattern.test(text))) indirect.push(relative(ROOT, file).replace(/\\/g, '/'));
}
assert.deepEqual(indirect, [], 'client code assembles an enterprise_ collection name by concatenation: ' + indirect.join(', '));

// The DECLARED projection must match what listDrafts actually returns — a contract that
// drifts from the code it describes is worse than none, because it is trusted.
const draftContract = requirement.collections.find((c) => c.path.startsWith('enterprise_outreach_drafts'));
for (const field of ['subject', 'body', 'sendable', 'legalHold', 'jurisdictionApproved']) {
  assert.ok(draftContract.permittedServerProjection.includes(field), 'the declared projection omits ' + field + ', which listDrafts returns');
}
for (const forbidden of draftContract.neverProjected) {
  assert.equal(draftContract.permittedServerProjection.includes(forbidden), false, 'the contract both permits and forbids ' + forbidden);
  // indexOf returns -1 when the literal is reformatted, and slice(-1) yields a ONE-CHARACTER
  // string against which every assertion below passes vacuously. Anchor the slice explicitly.
  const projectionStart = store.indexOf('rows.push({');
  assert.ok(projectionStart > 0, 'could not locate the listDrafts projection — this check would pass vacuously');
  const projectionBody = store.slice(projectionStart);
  assert.ok(projectionBody.length > 200, 'the located projection body is implausibly short');
  assert.equal(new RegExp('^\\s+' + forbidden + ':', 'm').test(projectionBody), false, 'listDrafts projects ' + forbidden + ', which the contract forbids');
}
ok(`${SERVER_OWNED_COLLECTIONS.length} server-owned collections: rules requirement complete, no client code references them, Admin SDK only`);

console.log(`\nOutreach production binding verification PASS: ${checks} checks (compile, ${VECTORS.length} canonical vectors, ${REFUSALS.length} shared refusals, NIST vectors, callable authorization, server clock, stable codes, no transmitter, server-decided writes, no client authority).`);
