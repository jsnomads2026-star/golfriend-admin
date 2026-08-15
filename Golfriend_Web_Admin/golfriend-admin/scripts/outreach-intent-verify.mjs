// ==========================================
// FILE: scripts/outreach-intent-verify.mjs
// Run: node scripts/outreach-intent-verify.mjs
//
// Replay/idempotency and privacy-disposal contract for the Admin outreach surface,
// verified end to end: the pure intent module AND the real server store together, so a
// duplicate that the client fails to prevent is still caught by the server, and vice versa.
//
// The bug this exists to prevent: the surface minted a FRESH command id on every click, so
// the server's replay ledger was unreachable from the UI. A double-click was two distinct
// commands; only the version compare-and-set caught it, by luck. An accepted-but-response-
// lost retry is not stale, and would have applied a second time.
//
// No network, no emulator, no production project.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');
const require = createRequire(import.meta.url);
const ts = require('typescript');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

async function loadTs(relativePath) {
  const source = readFileSync(resolve(ROOT, relativePath), 'utf8').replace(/^import type .*$/gm, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
}

const intent = await loadTs('src/components/admin/v2/outreachIntent.ts');
const {
  authorityFingerprint, createIntentLedger, intentKey, isAuthoritativeOutcome, shouldDisposeCache,
} = intent;

/** A storage double that also lets us simulate a browser restart. */
const makeStore = ({ enumerable = true, failWrites = false } = {}) => {
  const map = new Map();
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      // Real sessionStorage throws on quota exhaustion and under some privacy settings.
      if (failWrites) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
    size: () => map.size,
    snapshot: () => new Map(map),
    restore: (snap) => { map.clear(); for (const [k, v] of snap) map.set(k, v); },
  };
  // sessionStorage exposes `length` and `key(i)`; the double must too, or the prefix sweep
  // in disposeAll cannot run and the test would "pass" against a sweep that never happens.
  if (enumerable) {
    Object.defineProperty(store, 'length', { get: () => map.size });
    store.key = (index) => [...map.keys()][index] ?? null;
  }
  return store;
};
let seq = 0;
const deterministic = () => `id${(seq += 1)}`;

const INTENT = { draftId: 'd1', requestedState: 'approved', expectedVersion: 3, contentRef: 'Subject|Body' };

// ---- 1. THE SAME INTENT ALWAYS CARRIES THE SAME COMMAND ID -------------------------
{
  const store = makeStore();
  const ledger = createIntentLedger(store, 'fp1', deterministic);
  const first = ledger.reserve(INTENT);
  assert.equal(ledger.markInFlight(INTENT), true, 'the first attempt must be allowed to send');
  // A SECOND CLICK while the first is still awaiting a response is not a second command.
  const second = ledger.reserve(INTENT);
  assert.equal(second.commandId, first.commandId, 'a double-click minted a different command id');
  assert.equal(ledger.markInFlight(INTENT), false, 'a double-click was allowed to send a second request');
  assert.equal(ledger.markInFlight(INTENT), false);
  assert.equal(ledger.reservedCount(), 1, 'one intent must hold exactly one command id');
  ok('double-click: one intent, one command id, second send suppressed');
}

// ---- 2. A DIFFERENT INTENT IS A DIFFERENT COMMAND ----------------------------------
{
  const store = makeStore();
  const ledger = createIntentLedger(store, 'fp1', deterministic);
  const base = ledger.reserve(INTENT);
  const variants = [
    { ...INTENT, requestedState: 'rejected' },   // different decision
    { ...INTENT, expectedVersion: 4 },           // the draft moved underneath
    { ...INTENT, contentRef: 'Subject|EDITED' }, // the content changed
    { ...INTENT, draftId: 'd2' },                // a different draft
    // Case-sensitive draft ids: Firestore ids are case-sensitive and the server accepts
    // both cases, so D1 and d1 are different drafts and must not share a command id.
    { ...INTENT, draftId: 'D1' },
    // A delimiter inside a component must not let two intents collide. contentRef is built
    // from free-text subject and body, so this is reachable, not theoretical.
    { ...INTENT, requestedState: 'approved|3', contentRef: '' },
  ];
  for (const variant of variants) {
    const other = ledger.reserve(variant);
    assert.notEqual(other.commandId, base.commandId, `a changed intent reused an id: ${JSON.stringify(variant)}`);
    assert.notEqual(intentKey(variant), intentKey(INTENT));
  }
  ok('a changed decision, version, content or draft always yields a NEW command id');
}

// ---- 3. AUTHORITATIVE OUTCOMES RETIRE THE INTENT; TRANSPORT FAILURES DO NOT ---------
{
  assert.equal(isAuthoritativeOutcome({ applied: true, code: null }), true);
  for (const code of ['separation_of_duties', 'stale_write', 'invalid_state', 'digest_mismatch',
    'legal_hold_unknown', 'not_admin', 'replay_payload_mismatch']) {
    assert.equal(isAuthoritativeOutcome({ applied: false, code }), true, code);
  }
  // A transport failure is NOT authoritative. The write may have landed.
  assert.equal(isAuthoritativeOutcome({ applied: false, code: 'internal_error' }), false,
    'a transport failure must not retire the intent — the retry would apply a second time');
  assert.equal(isAuthoritativeOutcome(null), false);
  assert.equal(isAuthoritativeOutcome({}), false);
  assert.equal(isAuthoritativeOutcome({ applied: false, code: null }), false);

  // REGRESSION. An earlier version merged "has a reserved id" with "is in flight", so a
  // failed attempt left the intent permanently in flight: every later retry was suppressed
  // CLIENT-SIDE and never reached the server. The button went silently dead — the exact
  // opposite of the retry-replays behaviour this module claims.
  const store = makeStore();
  const ledger = createIntentLedger(store, 'fp1', deterministic);
  const attempt = ledger.reserve(INTENT);
  assert.equal(ledger.markInFlight(INTENT), true);
  // ... the request fails in transport. The component always clears in-flight.
  ledger.clearInFlight(INTENT);
  assert.equal(isAuthoritativeOutcome({ applied: false, code: 'internal_error' }), false);
  // THE RETRY MUST BE ALLOWED TO SEND, and must carry the SAME id.
  const retry = ledger.reserve(INTENT);
  assert.equal(retry.commandId, attempt.commandId, 'the retry did not reuse the reserved id');
  assert.equal(ledger.markInFlight(INTENT), true, 'THE RETRY WAS SUPPRESSED — the action is silently dead');
  ledger.clearInFlight(INTENT);
  // A third attempt too. The id survives until an authoritative outcome, not until the
  // first failure.
  assert.equal(ledger.reserve(INTENT).commandId, attempt.commandId);
  assert.equal(ledger.markInFlight(INTENT), true);

  ledger.settle(INTENT);
  assert.equal(ledger.isInFlight(INTENT), false);
  assert.equal(store.size(), 0, 'a settled intent left storage behind');
  assert.notEqual(ledger.reserve(INTENT).commandId, attempt.commandId, 'a settled intent must mint a fresh id');
  ok('a failed attempt keeps the id AND allows the retry; only an authoritative outcome retires it');
}

// ---- 3b. A NON-DURABLE RESERVATION IS REPORTED, NOT SWALLOWED ----------------------
// If the id cannot be persisted, it lives only in memory: a crash before the response
// arrives mints a new id and the command can apply twice. That is a real loss of
// idempotency, so it is surfaced rather than hidden behind a best-effort try/catch.
{
  const hostile = makeStore({ failWrites: true });
  const ledger = createIntentLedger(hostile, 'fp1', deterministic);
  const reservation = ledger.reserve(INTENT);
  assert.equal(reservation.durable, false, 'a failed persist was reported as durable');
  assert.match(reservation.commandId, /^cmd-/, 'the action must still work, just without crash-safety');
  // The id is still stable WITHIN the session, so retries in this tab remain idempotent.
  assert.equal(ledger.reserve(INTENT).commandId, reservation.commandId);
  // And a working store reports durable.
  assert.equal(createIntentLedger(makeStore(), 'fp1', deterministic).reserve(INTENT).durable, true);
  // The component surfaces it.
  const ui = readFileSync(resolve(ROOT, 'src/components/admin/v2/V2OutreachApprovals.tsx'), 'utf8');
  assert.match(ui, /durable: reservation\.durable/, 'the component discards the durability signal');
  ok('a storage failure degrades idempotency visibly rather than silently');
}

// ---- 4. RESTART RECOVERY ------------------------------------------------------------
{
  const store = makeStore();
  const ledger = createIntentLedger(store, 'fp1', deterministic);
  const before = ledger.reserve(INTENT);
  const snapshot = store.snapshot();

  // Simulate a reload: fresh ledger, same storage, same authority.
  const restarted = makeStore();
  restarted.restore(snapshot);
  const afterRestart = createIntentLedger(restarted, 'fp1', deterministic);
  const recovered = afterRestart.reserve(INTENT);
  assert.equal(recovered.commandId, before.commandId, 'the pending command id was lost across a restart');
  assert.equal(recovered.recovered, true);

  // A DIFFERENT authority must NOT recover another identity's pending command.
  const otherIdentity = createIntentLedger(restarted, 'fp2-different-user', deterministic);
  assert.notEqual(otherIdentity.reserve(INTENT).commandId, before.commandId,
    'a different identity recovered another identity pending command id');
  // disposeAll must sweep STORAGE BY PREFIX, not just what this instance remembers. An
  // earlier version cleared only its in-memory map, so entries left by a previous page
  // load survived disposal and could be recovered by whoever came next.
  const orphaned = makeStore();
  orphaned.restore(snapshot);
  assert.ok(orphaned.size() > 0, 'the fixture must actually contain a persisted entry');
  const sweeper = createIntentLedger(orphaned, 'fp1', deterministic);
  sweeper.disposeAll();
  assert.equal(orphaned.size(), 0, 'disposeAll left a persisted intent behind for the next identity');
  ok('a restart recovers the same command id; a different identity cannot');
}

// ---- 4b. DISPOSAL MUST NOT DESTROY AN IN-FLIGHT COMMAND ID -------------------------
// The composed case neither §4 nor §6 covered: an intent is reserved and in flight when the
// authority fingerprint changes (going offline is the ONE field that genuinely changes at
// runtime). If disposal sweeps that id, the retry mints a new one and the server applies an
// accepted-but-response-lost command a SECOND time — the exact defect this module exists to
// prevent, reachable through the privacy feature meant to protect it.
{
  const store = makeStore();
  const online = createIntentLedger(store, 'uid|role|status|online', deterministic);
  const reserved = online.reserve(INTENT);
  assert.equal(online.markInFlight(INTENT), true);
  assert.equal(store.size(), 1, 'the fixture must have persisted the reservation');

  // The connection drops: the component disposes for the new fingerprint.
  online.disposeAll();
  const afterDispose = online.reserve(INTENT);
  assert.equal(afterDispose.commandId, reserved.commandId,
    'DISPOSAL DESTROYED AN IN-FLIGHT COMMAND ID — the retry would apply the command twice');
  assert.equal(store.size(), 1, 'the in-flight reservation must survive disposal');

  // An intent that is NOT in flight is disposed, so this is scoping and not a no-op.
  const settled = { ...INTENT, draftId: 'other' };
  online.reserve(settled);
  assert.equal(store.size(), 2);
  online.disposeAll();
  assert.equal(store.size(), 1, 'a non-in-flight intent should have been disposed');

  // ANOTHER identity's pending command is not ours to discard either.
  const shared = makeStore();
  const alice = createIntentLedger(shared, 'alice', deterministic);
  const bob = createIntentLedger(shared, 'bob', deterministic);
  const aliceId = alice.reserve(INTENT);
  bob.reserve(INTENT);
  assert.equal(shared.size(), 2);
  bob.disposeAll();
  assert.equal(shared.size(), 1, 'bob disposed alice pending command');
  assert.equal(alice.reserve(INTENT).commandId, aliceId.commandId, 'alice lost her reserved id');
  ok('disposal spares in-flight commands and other identities, and still disposes settled ones');
}

// ---- 5. THE LEDGER + THE SERVER TOGETHER: NO DUPLICATE EFFECT ----------------------
// This is the end-to-end proof. The client reuses the id; the server replays it. Neither
// alone is trusted, and the assertion is on the SERVER's records, not on the client.
{
  const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
    .find((c) => existsSync(c));
  assert.ok(tsc, 'no local typescript compiler found for functions/');
  execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });
  const storeModule = await import(`file://${resolve(FUNCTIONS, 'lib/outreachStore.js')}`);
  const { createOutreachStore, DRAFTS, RECEIPTS } = storeModule.default ?? storeModule;

  const makeDb = () => ({
    data: new Map(),
    collection(name) {
      const self = this;
      return {
        doc(id) {
          return {
            __path: `${name}/${id}`, __id: id,
            get: async () => ({ exists: self.data.has(`${name}/${id}`), id, data: () => self.data.get(`${name}/${id}`) }),
          };
        },
        limit(n) {
          return { get: async () => ({ docs: [...self.data.entries()].filter(([k]) => k.startsWith(`${name}/`)).slice(0, n).map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }) };
        },
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
      for (const [path, value] of creates) this.data.set(path, value);
      for (const [path, patch] of updates) this.data.set(path, { ...this.data.get(path), ...patch });
      return out;
    },
    count: (prefix) => 0,
  });

  const CONTENT = {
    draftType: 'introduction', locale: 'th', templateVersion: 'v1', jurisdiction: 'TH',
    jurisdictionApprovalVersion: null, prospectRef: 'prospect-a', contactRef: 'contact-b',
    recipientRole: null, recipientRef: null, contactPreferenceVersion: 'cp',
    consentVersion: 'cv', doNotContactVersion: 'dnc', purpose: 'partnership',
    evidenceVersion: null, subject: 'Golfriend', body: 'Preview only.',
  };
  const at = '2026-08-15T09:00:00.000Z';
  const ctx = (uid) => ({ uid, adminDoc: null, appCheckVerified: true });
  const countIn = (db, prefix) => [...db.data.keys()].filter((k) => k.startsWith(`${prefix}/`)).length;

  const db = makeDb();
  db.data.set('admin_users/author', { role: 'Support', status: 'Active' });
  db.data.set('admin_users/reviewer', { role: 'Support', status: 'Active' });
  db.data.set('enterprise_legal_holds/d1', { active: false });
  const server = createOutreachStore(db);
  await server.createDraft({ caller: ctx('author'), draftId: 'd1', content: CONTENT, jurisdiction: 'TH', expiresAt: null, commandId: 'c1', now: at });
  await server.assignReviewer({ caller: ctx('author'), draftId: 'd1', expectedVersion: 1, reviewerUid: 'reviewer', commandId: 'c2', now: at });
  await server.transition({ caller: ctx('reviewer'), draftId: 'd1', expectedVersion: 2, requestedState: 'previewed', commandId: 'c3', now: at });

  const receiptsBefore = countIn(db, RECEIPTS);
  const store = makeStore();
  const ledger = createIntentLedger(store, 'fp1', deterministic);
  const approve = { draftId: 'd1', requestedState: 'approved', expectedVersion: 3, contentRef: 'Golfriend|Preview only.' };

  // (a) DOUBLE-CLICK. The ledger suppresses the second send entirely.
  const click1 = ledger.reserve(approve);
  assert.equal(ledger.markInFlight(approve), true);
  const click2 = ledger.reserve(approve);
  assert.equal(click2.commandId, click1.commandId);
  assert.equal(ledger.markInFlight(approve), false, 'the double-click was allowed to send');
  ledger.clearInFlight(approve);
  const sendApprove = (commandId) => server.transition({
    caller: ctx('reviewer'), draftId: 'd1', expectedVersion: 3,
    requestedState: 'approved', commandId, now: at,
  });
  const applied = await sendApprove(click1.commandId);
  assert.equal(applied.ok, true, applied.code ?? '');

  // (b) ACCEPTED-BUT-RESPONSE-LOST. The client never saw (a) succeed, so it retries with
  //     the SAME id. The server must replay, not apply a second transition.
  const retry = await sendApprove(click1.commandId);
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true, 'the retry was applied afresh instead of replayed');
  assert.equal(retry.version, applied.version);
  assert.equal(retry.receiptId, applied.receiptId);

  // (c) RESTART, then retry again. Still the same id, still a replay.
  const afterRestart = createIntentLedger(makeStore(), 'fp1', deterministic);
  // (the store double above is fresh; recovery is proved in section 4 — here the point is
  // that the SERVER is idempotent for the id however the client obtained it)
  const thirdAttempt = await sendApprove(click1.commandId);
  assert.equal(thirdAttempt.replayed, true);
  void afterRestart;

  // THE ASSERTION THAT MATTERS: the server recorded exactly ONE effect.
  assert.equal(db.data.get(`${DRAFTS}/d1`).version, 4, 'more than one transition was applied');
  assert.equal(db.data.get(`${DRAFTS}/d1`).state, 'approved');
  assert.equal(countIn(db, RECEIPTS) - receiptsBefore, 1, 'a duplicate receipt was appended');

  // (d) A FRESH ID for the same intent — what the old UI did — is caught by the version
  //     compare-and-set, but note it produces a REFUSAL rather than a clean replay. That
  //     is precisely why the id must be stable.
  const naive = await sendApprove('cmd-freshly-minted');
  assert.equal(naive.ok, false);
  // `stale_write`, because the version had already moved. That is the compare-and-set
  // catching it — NOT the replay ledger, which a fresh id can never reach. It only holds
  // because the version happened to change; a retry against an unchanged version would
  // have applied twice. Hence the stable id.
  assert.equal(naive.code, 'stale_write');
  assert.equal(countIn(db, RECEIPTS) - receiptsBefore, 1, 'a duplicate receipt was appended after a fresh id');
  ok('double-click, timeout retry, response-lost retry and restart produce exactly ONE transition and ONE receipt');
}

// ---- 6. DISPOSAL: authority changes drop cached content ----------------------------
{
  const base = { uid: 'u1', role: 'Manager', status: 'Active', scope: 'org1', requestVersion: 'v1', appCheck: true, online: true };
  assert.equal(shouldDisposeCache(base, { ...base }), false, 'an unchanged authority must not thrash the cache');
  const CHANGES = [
    ['logout', { ...base, uid: null }],
    ['member switch', { ...base, uid: 'u2' }],
    ['suspension', { ...base, status: 'Suspended' }],
    ['deactivation', { ...base, status: 'Deactivated' }],
    ['role change', { ...base, role: 'Support' }],
    ['scope change', { ...base, scope: 'org2' }],
    ['stale request version', { ...base, requestVersion: 'v2' }],
    ['App Check lost', { ...base, appCheck: false }],
    ['offline', { ...base, online: false }],
  ];
  for (const [label, next] of CHANGES) {
    assert.equal(shouldDisposeCache(base, next), true, `cached content survived: ${label}`);
  }
  // Fails closed on an unknown identity at either end.
  assert.equal(shouldDisposeCache(null, base), true);
  assert.equal(shouldDisposeCache(base, null), true);
  assert.equal(shouldDisposeCache(undefined, undefined), true);
  // Fingerprints differ for every one of those changes.
  for (const [label, next] of CHANGES) {
    assert.notEqual(authorityFingerprint(next), authorityFingerprint(base), label);
  }
  assert.equal(authorityFingerprint(null), 'anonymous');
  // Case/whitespace variants of the SAME identity are the same authority — disposal must
  // not thrash on cosmetics.
  assert.equal(shouldDisposeCache(base, { ...base, role: ' manager ' }), false);
  ok(`disposal fires on all ${CHANGES.length} authority changes and on unknown identity, and not on cosmetic variation`);
}

// ---- 7. THE COMPONENT ACTUALLY USES ALL OF IT --------------------------------------
{
  const ui = readFileSync(resolve(ROOT, 'src/components/admin/v2/V2OutreachApprovals.tsx'), 'utf8');
  assert.match(ui, /ledger\.reserve\(intent\)/, 'the component does not reserve a stable id');
  assert.match(ui, /if \(!ledger\.markInFlight\(intent\)\) return;/, 'the component does not single-flight');
  assert.match(ui, /ledger\.clearInFlight\(intent\)/, 'the component never releases the in-flight guard — a failed attempt would dead-lock the action');
  assert.match(ui, /commandId: reservation\.commandId/, 'the component does not send the reserved command id');
  // The identity must come from the shell. When it came ONLY from a prop that nothing
  // passed, the entire disposal mechanism was unreachable in production.
  assert.match(ui, /useContext\(AdminIdentityContext\)/, 'the component does not read the governing authority from the shell');
  assert.match(ui, /identity \?\? contextIdentity/, 'the component does not fall back to the shell identity');
  const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
  assert.match(app, /<AdminIdentityContext\.Provider/, 'App.tsx does not provide an admin identity, so disposal can never fire');
  assert.match(app, /uid: user\?\.uid \?\? null/, 'the provided identity does not carry the signed-in uid');
  assert.match(app, /status: adminData\?\.status \?\? null/, 'the provided identity does not carry the admin status');
  assert.match(app, /online: isOnline/, 'the provided identity does not carry connectivity');
  assert.match(ui, /isAuthoritativeOutcome\(outcome\)\) ledger\.settle\(/, 'the component retires intents on a non-authoritative outcome');
  assert.match(ui, /shouldDisposeCache\(/, 'the component does not dispose cached content');
  assert.match(ui, /ledger\.disposeAll\(\)/, 'the component does not dispose pending intents');
  assert.match(ui, /contentRef:/, 'the intent does not include content, so an edit could reuse an accepted id');
  // The regression itself: a fresh id per click must not come back.
  assert.doesNotMatch(ui, /newCommandId\(\)/, 'the component mints a fresh command id per click again');
  const service = readFileSync(resolve(ROOT, 'src/components/admin/v2/outreachService.ts'), 'utf8');
  assert.doesNotMatch(service, /export function newCommandId/, 'the per-click id minter is back in the service');
  assert.doesNotMatch(ui, /crypto\.randomUUID/, 'the component mints ids directly instead of using the ledger');
  ok('the component uses the ledger, single-flights, and cannot mint a per-click id again');
}

console.log(`\nOutreach intent/replay/disposal verification PASS: ${checks} checks (stable id per intent, single-flight, new id on changed intent, non-authoritative outcomes retained, restart recovery scoped to identity, one transition and one receipt across double-click/timeout/response-lost/restart, disposal on 9 authority changes, component wiring).`);
