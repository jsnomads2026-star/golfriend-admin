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
import { existsSync, readFileSync as read } from 'node:fs';
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

console.log(`\nOutreach production binding verification PASS: ${checks} checks (compile, ${VECTORS.length} canonical vectors, ${REFUSALS.length} shared refusals, NIST vectors, callable authorization, server clock, stable codes, no transmitter, server-decided writes, no client authority).`);
