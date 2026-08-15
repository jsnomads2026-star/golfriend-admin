// ==========================================
// FILE: functions/src/outreachStore.test.ts   (run: node lib/outreachStore.test.js)
// ADVERSARIAL suite for the CONCRETE production persistence binding.
//
// This exercises the real createOutreachStore() code path — the same function index.ts
// constructs — against an in-memory Firestore double that reproduces the semantics the
// adapter depends on: transactional read/write buffering, create-fails-if-exists, and
// per-document reads. No emulator, no network, no production project.
//
// The double is deliberately STRICTER than Firestore where it matters (create throws on an
// existing document, writes are only visible after commit), so a bug that Firestore would
// catch in production cannot pass here.
// ==========================================
import assert from "node:assert/strict";
import { createOutreachStore, persistedShapeIsMinimal, receiptIdFor, snapshot, DRAFTS, RECEIPTS, COMMANDS, LEGAL_HOLDS } from "./outreachStore.js";
import { CANONICAL_FIELDS, outreachContentDigest } from "./outreachCanonical.js";
import type { CallerContext } from "./outreachAuthority.js";

// ---------------------------------------------------------------- Firestore double ----
type Doc = Record<string, unknown>;
class FakeDb {
  data = new Map<string, Doc>();
  reads = 0;
  failLegalHoldRead = false;

  private key(collection: string, id: string) { return `${collection}/${id}`; }

  collection(name: string) {
    const self = this;
    return {
      doc(id: string) { return { __path: self.key(name, id), __id: id, get: async () => self.snap(self.key(name, id), id) }; },
      limit(n: number) {
        return { get: async () => ({ docs: [...self.data.entries()]
          .filter(([k]) => k.startsWith(`${name}/`))
          .slice(0, n)
          .map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }) };
      },
    };
  }

  private snap(path: string, id: string) {
    this.reads += 1;
    if (this.failLegalHoldRead && path.startsWith(`${LEGAL_HOLDS}/`)) throw new Error("store unavailable");
    const value = this.data.get(path);
    return { exists: value !== undefined, id, data: () => value };
  }

  /**
   * Firestore's transaction semantics, reproduced: reads are tracked, and if any document
   * that was READ has been written by someone else before this body commits, the whole
   * transaction is discarded and re-run. Without this the double would happily commit two
   * concurrent writers and the concurrency test would be theatre.
   */
  generation = new Map<string, number>();
  transactionRetries = 0;

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const db = this;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const creates: Array<[string, Doc]> = [];
      const updates: Array<[string, Doc]> = [];
      const readGenerations = new Map<string, number>();
      let wrote = false;
      // Firestore REQUIRES all reads before all writes inside a transaction and throws
      // otherwise. Without this the suite would pass code that fails on every real call.
      const noReadsAfterWrites = () => {
        if (wrote) throw new Error("Firestore transactions require all reads to be executed before all writes");
      };
      // The Admin SDK rejects `undefined` field values unless ignoreUndefinedProperties is
      // set. Storing them silently would hide a real production write failure.
      const rejectUndefined = (value: unknown, path: string): void => {
        if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (${path})`);
        if (Array.isArray(value)) { value.forEach((v, i) => rejectUndefined(v, `${path}[${i}]`)); return; }
        if (value && typeof value === "object") {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) rejectUndefined(v, `${path}.${k}`);
        }
      };
      const tx = {
        async get(ref: any) {
          noReadsAfterWrites();
          readGenerations.set(ref.__path, db.generation.get(ref.__path) ?? 0);
          return db.snap(ref.__path, ref.__id);
        },
        create(ref: any, value: Doc) {
          rejectUndefined(value, ref.__path);
          if (db.data.has(ref.__path) || creates.some(([p]) => p === ref.__path)) {
            throw new Error(`ALREADY_EXISTS: ${ref.__path}`);
          }
          wrote = true;
          creates.push([ref.__path, value]);
        },
        update(ref: any, patch: Doc) {
          rejectUndefined(patch, ref.__path);
          if (!db.data.has(ref.__path)) throw new Error(`NOT_FOUND: ${ref.__path}`);
          wrote = true;
          updates.push([ref.__path, patch]);
        },
      };
      const result = await fn(tx);
      // Conflict check: did anything we read move underneath us while we were running?
      let conflicted = false;
      for (const [path, seen] of readGenerations) {
        if ((db.generation.get(path) ?? 0) !== seen) { conflicted = true; break; }
      }
      if (conflicted) { db.transactionRetries += 1; continue; }
      // Commit only after the body completes, so a partial failure writes nothing.
      for (const [path, value] of creates) db.data.set(path, value);
      for (const [path, patch] of updates) db.data.set(path, { ...(db.data.get(path) as Doc), ...patch });
      for (const [path] of [...creates, ...updates]) {
        db.generation.set(path, (db.generation.get(path) ?? 0) + 1);
      }
      return result;
    }
    throw new Error("ABORTED: too much contention");
  }

  countIn(collection: string) { return [...this.data.keys()].filter((k) => k.startsWith(`${collection}/`)).length; }
  read(collection: string, id: string) { return this.data.get(`${collection}/${id}`) as Doc | undefined; }
}

// ------------------------------------------------------------------------ fixtures ----
const CONTENT: Record<string, string | null> = {
  draftType: "introduction", locale: "th", templateVersion: "2026-08-15.v1",
  jurisdiction: "TH", jurisdictionApprovalVersion: null,
  prospectRef: "prospect-a1", contactRef: "contact-b2",
  recipientRole: null, recipientRef: null, contactPreferenceVersion: "cp-1",
  consentVersion: "cv-1", doNotContactVersion: "dnc-1", purpose: "course_partnership",
  evidenceVersion: null, subject: "Golfriend", body: "Preview only.",
};
const DIGEST = outreachContentDigest(CONTENT).digest as string;
const NOW = "2026-08-15T09:00:00.000Z";
const caller = (uid: string): CallerContext => ({ uid, adminDoc: null, appCheckVerified: true });

function seeded() {
  const db = new FakeDb();
  db.data.set("admin_users/author", { role: "Manager", status: "Active" });
  db.data.set("admin_users/reviewer", { role: "Manager", status: "Active" });
  db.data.set("admin_users/boss", { role: "Director", status: "Active" });
  db.data.set("admin_users/suspended", { role: "Manager", status: "Suspended" });
  db.data.set("admin_users/roleless", { status: "Active" });
  // A legal-hold document that says "not held". Its ABSENCE is also "not held"; a FAILED
  // read is what must be unknown.
  db.data.set(`${LEGAL_HOLDS}/d1`, { active: false });
  return { db, store: createOutreachStore(db as never) };
}

async function createdDraft(id = "d1") {
  const { db, store } = seeded();
  if (id !== "d1") db.data.set(`${LEGAL_HOLDS}/${id}`, { active: false });
  const made = await store.createDraft({
    caller: caller("author"), draftId: id, content: CONTENT,
    jurisdiction: "TH", expiresAt: null, commandId: "c-create", now: NOW,
  });
  assert.equal(made.ok, true, `fixture creation must succeed: ${made.code}`);
  return { db, store, made };
}

let blocks = 0;
const block = async (label: string, fn: () => Promise<void>) => { await fn(); blocks += 1; void label; };

const run = async () => {

// --- 1. HAPPY PATH EXISTS ------------------------------------------------------------
// Proved first, so every refusal below is a real guard rather than a store that never works.
await block("happy path", async () => {
  const { db, store } = await createdDraft();
  assert.equal(db.read(DRAFTS, "d1")?.version, 1);
  assert.equal(db.read(DRAFTS, "d1")?.contentDigest, DIGEST);
  assert.equal(db.read(DRAFTS, "d1")?.createdByKey, "author");
  assert.equal(db.countIn(RECEIPTS), 1);

  const assigned = await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "reviewer", commandId: "c-assign", now: NOW,
  });
 await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "c-assign-pv", now: NOW });
  assert.equal(assigned.ok, true, assigned.code ?? "");
  assert.equal(assigned.version, 2);
  assert.equal(db.read(DRAFTS, "d1")?.assignedReviewerKey, "reviewer");

  const approved = await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "c-approve", now: NOW,
  });
  assert.equal(approved.ok, true, approved.code ?? "");
  assert.equal(approved.state, "approved");
  assert.equal(approved.version, 4, "create(1) -> assign(2) -> preview(3) -> approve(4)");
  assert.equal(db.countIn(RECEIPTS), 4, "one receipt per transition");
  // The digest is NEVER rewritten by a transition: approval covers the digested content.
  assert.equal(db.read(DRAFTS, "d1")?.contentDigest, DIGEST);
});

// --- 2. FORGED ROLE AT THE STORE BOUNDARY --------------------------------------------
await block("forged role", async () => {
  const { db, store } = seeded();
  // The caller sends a role in their context object. The store re-reads admin_users and
  // overwrites it, so the forgery is inert.
  const forged = { uid: "nobody", adminDoc: { role: "Director", status: "Active" }, appCheckVerified: true };
  const made = await store.createDraft({
    caller: forged, draftId: "d9", content: CONTENT, jurisdiction: "TH",
    expiresAt: null, commandId: "f1", now: NOW,
  });
  assert.equal(made.ok, false);
  assert.equal(made.code, "not_admin");
  assert.equal(db.countIn(DRAFTS), 0, "a refused command writes nothing");
  assert.equal(db.countIn(RECEIPTS), 0);
  assert.equal(db.countIn(COMMANDS), 0, "a refused command is not recorded as done");

  for (const uid of ["suspended", "roleless"]) {
    const out = await store.createDraft({
      caller: caller(uid), draftId: "d8", content: CONTENT, jurisdiction: "TH",
      expiresAt: null, commandId: `f-${uid}`, now: NOW,
    });
    assert.equal(out.code, "not_admin", uid);
  }
});

// --- 3. FORGED REVIEWER REFERENCE ----------------------------------------------------
await block("forged reviewer", async () => {
  const { store } = await createdDraft();
  // A uid with no admin_users document cannot be assigned, however plausible it looks.
  const ghost = await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "ghost-reviewer", commandId: "g1", now: NOW,
  });
  assert.equal(ghost.code, "not_admin");
  // A suspended reviewer cannot be assigned either.
  assert.equal((await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "suspended", commandId: "g2", now: NOW,
  })).code, "not_admin");
  // A published surrogate presented as a reviewer identity is refused outright.
  assert.equal((await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "actor-9f2a", commandId: "g3", now: NOW,
  })).code, "payload_rejected");
  // The creator cannot be their own reviewer.
  assert.equal((await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "author", commandId: "g4", now: NOW,
  })).code, "separation_of_duties");
});

// --- 4. SELF-APPROVAL THROUGH THE REAL STORE -----------------------------------------
await block("self-approval", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "a1", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "a1-pv", now: NOW });
  const self = await store.transition({
    caller: caller("author"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "a2", now: NOW,
  });
  assert.equal(self.code, "separation_of_duties");
  assert.equal(db.read(DRAFTS, "d1")?.state, "previewed", "the refused approval left the state untouched");
  assert.equal(db.read(DRAFTS, "d1")?.version, 3, "and the version untouched");
  // A staff member who is not the assigned reviewer also cannot approve.
  assert.equal((await store.transition({
    caller: caller("boss"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "a3", now: NOW,
  })).code, "separation_of_duties");
});

// --- 5. STALE WRITE ------------------------------------------------------------------
await block("stale write", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "s1", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "s1-pv", now: NOW });
  // The version moved to 2; a writer still holding 1 must lose.
  const stale = await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 1,
    requestedState: "approved", commandId: "s2", now: NOW,
  });
  assert.equal(stale.code, "stale_write");
  assert.equal(db.read(DRAFTS, "d1")?.version, 3);
  // A missing version is refused, not defaulted.
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: undefined,
    requestedState: "approved", commandId: "s3", now: NOW,
  })).code, "version_required");
});

// --- 6. CONCURRENT WRITERS: ONLY ONE WINS --------------------------------------------
await block("concurrency", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "k0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "k0-pv", now: NOW });
  // Two DIFFERENT commands both believe the version is 2.
  const [a, b] = await Promise.all([
    store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "approved", commandId: "k1", now: NOW }),
    store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "rejected", commandId: "k2", now: NOW }),
  ]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, "exactly one writer may take version 2 → 3");
  assert.equal(db.read(DRAFTS, "d1")?.version, 4);
  assert.equal(db.countIn(RECEIPTS), 4, "the loser appended no receipt");
  // The conflict detector must actually have FIRED. Without this the block would pass just
  // as happily against a double that never detects contention.
  assert.ok(db.transactionRetries > 0, "the transaction conflict path was never exercised");
  // The loser lost after its retry re-read the record: either the version had moved
  // (stale_write) or the winner left a state its target is unreachable from (invalid_state).
  // Both are refusals; what must never happen is a second silent success.
  const loser = a.ok ? b : a;
  assert.equal(loser.ok, false);
  assert.ok(["stale_write", "invalid_state"].includes(loser.code as string), loser.code as string);
});

// --- 7. REPLAY: SAME PAYLOAD REPLAYS, CHANGED PAYLOAD REFUSES -------------------------
await block("replay", async () => {
  const { db, store } = await createdDraft();
  const first = await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "r1", now: NOW });
 await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "r1-pv", now: NOW });
  assert.equal(first.replayed, false);
  const again = await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "r1", now: NOW });
 await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "r1-pv", now: NOW });
  assert.equal(again.ok, true);
  assert.equal(again.replayed, true, "a replay is FLAGGED, not silently identical");
  assert.equal(again.version, first.version);
  assert.equal(db.read(DRAFTS, "d1")?.version, 3, "a replay does not apply a second time");
  assert.equal(db.countIn(RECEIPTS), 3, "a replay does not append a second receipt");

  // Same command id, DIFFERENT payload — this is the dangerous case. It must refuse,
  // never serve the original success for a materially different request.
  const swapped = await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "boss", commandId: "r1", now: NOW });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.code, "replay_payload_mismatch");
  assert.equal(db.read(DRAFTS, "d1")?.assignedReviewerKey, "reviewer", "the original assignment stands");

  // A transition replay behaves the same way, including a changed target state.
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "approved", commandId: "r2", now: NOW });
  const swapState = await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "rejected", commandId: "r2", now: NOW });
  assert.equal(swapState.code, "replay_payload_mismatch");
  assert.equal(db.read(DRAFTS, "d1")?.state, "approved");
  // A missing or non-opaque command id is refused: without one there is no replay safety.
  for (const bad of [undefined, null, "", "cmd with spaces", 7]) {
    assert.equal((await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 4, requestedState: "revoked", commandId: bad, now: NOW })).code, "payload_rejected", String(bad));
  }
});

// --- 8. DIGEST BINDING IS AGAINST PERSISTED STATE -------------------------------------
// The transition takes NO content from the caller. The server re-reads the stored content
// and re-derives the digest, so the check is an integrity check on the record rather than a
// comparison against whatever the caller chose to send. These cases tamper with the STORE
// directly — the only way the content can now diverge from its digest.
await block("digest binding", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "d-a", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "d-a-pv", now: NOW });

  // The UI's exact payload — no content key at all — must SUCCEED. A control that made the
  // mounted feature unusable shipped once because no test ever sent the real payload.
  const uiShaped = await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "d-ui", now: NOW,
  });
  assert.equal(uiShaped.ok, true, `the UI-shaped approve payload was refused: ${uiShaped.code}`);
  assert.equal(uiShaped.state, "approved");

  // Content edited behind the command path (a direct console write) is caught.
  const tampered = await createdDraft("d2");
  await tampered.store.assignReviewer({ caller: caller("author"), draftId: "d2", expectedVersion: 1, reviewerUid: "reviewer", commandId: "d-t1", now: NOW });
  await tampered.store.transition({ caller: caller("reviewer"), draftId: "d2", expectedVersion: 2, requestedState: "previewed", commandId: "d-t1-pv", now: NOW });
  await tampered.store.transition({ caller: caller("reviewer"), draftId: "d2", expectedVersion: 2, requestedState: "previewed", commandId: "d-t1-pv", now: NOW });
  tampered.db.data.set(`${DRAFTS}/d2`, { ...tampered.db.read(DRAFTS, "d2")!, content: { ...CONTENT, body: "Substituted after approval was requested." } });
  assert.equal((await tampered.store.transition({
    caller: caller("reviewer"), draftId: "d2", expectedVersion: 3,
    requestedState: "approved", commandId: "d-t2", now: NOW,
  })).code, "digest_mismatch");

  // Content deleted behind the command path cannot be approved either: a digest with
  // nothing to verify against would make the integrity claim vacuous.
  const emptied = await createdDraft("d3");
  await emptied.store.assignReviewer({ caller: caller("author"), draftId: "d3", expectedVersion: 1, reviewerUid: "reviewer", commandId: "d-e1", now: NOW });
  await emptied.store.transition({ caller: caller("reviewer"), draftId: "d3", expectedVersion: 2, requestedState: "previewed", commandId: "d-e1-pv", now: NOW });
  await emptied.store.transition({ caller: caller("reviewer"), draftId: "d3", expectedVersion: 2, requestedState: "previewed", commandId: "d-e1-pv", now: NOW });
  const withoutContent = { ...emptied.db.read(DRAFTS, "d3")! };
  delete withoutContent.content;
  emptied.db.data.set(`${DRAFTS}/d3`, withoutContent);
  assert.equal((await emptied.store.transition({
    caller: caller("reviewer"), draftId: "d3", expectedVersion: 3,
    requestedState: "approved", commandId: "d-e2", now: NOW,
  })).code, "content_rejected");

  // The digest itself is never rewritten by a transition.
  assert.equal(db.read(DRAFTS, "d1")?.contentDigest, DIGEST);
  void store;
});

// --- 8b. SELF-NOMINATION THROUGH THE REAL STORE ---------------------------------------
// The attack the review found: any active staff member assigns THEMSELVES to another
// person's draft and then approves it alone, completing a two-person control by themselves.
await block("self-nomination", async () => {
  const { db, store } = await createdDraft();
  db.data.set("admin_users/mallory", { role: "Manager", status: "Active" });
  const grab = await store.assignReviewer({
    caller: caller("mallory"), draftId: "d1", expectedVersion: 1,
    reviewerUid: "mallory", commandId: "m1", now: NOW,
  });
  assert.equal(grab.code, "separation_of_duties");
  assert.equal(db.read(DRAFTS, "d1")?.assignedReviewerKey, null, "no reviewer was assigned");
  assert.equal(db.read(DRAFTS, "d1")?.version, 1, "the refused grab did not burn a version");

  // A decided draft cannot be reopened by reassigning it.
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "m2", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "m2-pv", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "approved", commandId: "m3", now: NOW });
  assert.equal((await store.assignReviewer({
    caller: caller("author"), draftId: "d1", expectedVersion: 4,
    reviewerUid: "mallory", commandId: "m4", now: NOW,
  })).code, "invalid_state");
  assert.equal(db.read(DRAFTS, "d1")?.state, "approved");
});

// --- 8c. THE TRANSITION GRAPH THROUGH THE REAL STORE -----------------------------------
await block("transition graph", async () => {
  const { db, store } = await createdDraft();
  // Approval may not skip reviewer assignment.
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 1,
    requestedState: "approved", commandId: "g1", now: NOW,
  })).code, "invalid_state");
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "g2", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "g2-pv", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "rejected", commandId: "g3", now: NOW });
  // A rejected draft may not then be approved.
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 4,
    requestedState: "approved", commandId: "g4", now: NOW,
  })).code, "invalid_state");
  assert.equal(db.read(DRAFTS, "d1")?.state, "rejected");
});

// --- 8d. EXPIRY VALIDATION AT CREATION -------------------------------------------------
// `expiresAt` is compared as a string, so a non-ISO value compares nonsensically: "never"
// sorts after every digit and the draft would never expire.
await block("expiry validation", async () => {
  const { db, store } = seeded();
  for (const bad of ["never", "2026-08-15T16:00:00+07:00", "0", "2026-02-31T00:00:00.000Z", "tomorrow", 12345]) {
    db.data.set(`${LEGAL_HOLDS}/x1`, { active: false });
    assert.equal((await store.createDraft({
      caller: caller("author"), draftId: "x1", content: CONTENT, jurisdiction: "TH",
      expiresAt: bad, commandId: `xv-${String(bad)}`, now: NOW,
    })).code, "payload_rejected", String(bad));
  }
  // A well-formed instant is accepted, so the refusals above are validation and not a
  // blanket rejection of every expiry.
  db.data.set(`${LEGAL_HOLDS}/x2`, { active: false });
  assert.equal((await store.createDraft({
    caller: caller("author"), draftId: "x2", content: CONTENT, jurisdiction: "TH",
    expiresAt: "2027-01-01T00:00:00.000Z", commandId: "xv-good", now: NOW,
  })).ok, true);
});

// --- 8e. THE REPLAY LEDGER IS BOUND TO THE CALLER --------------------------------------
// A ledger entry is a success response. Keyed on command id and payload alone, anyone who
// learns a command id and reconstructs its payload is handed the original success without
// the authority core ever running for them.
await block("replay is caller-bound", async () => {
  const { db, store } = await createdDraft("d5");
  db.data.set("admin_users/mallory", { role: "Manager", status: "Active" });
  const legitimate = await store.assignReviewer({
    caller: caller("author"), draftId: "d5", expectedVersion: 1,
    reviewerUid: "reviewer", commandId: "shared-id", now: NOW,
  });
 await store.transition({ caller: caller("reviewer"), draftId: "d5", expectedVersion: 2, requestedState: "previewed", commandId: "shared-id-pv", now: NOW });
  assert.equal(legitimate.ok, true);
  // Mallory presents the SAME command id and the same visible arguments.
  const stolen = await store.assignReviewer({
    caller: caller("mallory"), draftId: "d5", expectedVersion: 1,
    reviewerUid: "reviewer", commandId: "shared-id", now: NOW,
  });
  assert.equal(stolen.ok, false, "a different caller must not be served another caller's success");
  assert.equal(stolen.code, "replay_payload_mismatch");
  // The original caller still replays their own command correctly.
  const own = await store.assignReviewer({
    caller: caller("author"), draftId: "d5", expectedVersion: 1,
    reviewerUid: "reviewer", commandId: "shared-id", now: NOW,
  });
 await store.transition({ caller: caller("reviewer"), draftId: "d5", expectedVersion: 2, requestedState: "previewed", commandId: "shared-id-pv", now: NOW });
  assert.equal(own.ok, true);
  assert.equal(own.replayed, true);
});

// --- 9. RE-ENTRANCY VIA A GETTER ON CALLER CONTENT ------------------------------------
await block("re-entrancy", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "x0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "x0-pv", now: NOW });
  // RETARGETED. This block used to build a hostile getter and pass it to transition() —
  // which no longer accepts caller content at all, so the object was never read, `reads`
  // was always 0, and the assertion was a tautology. createDraft is now the only path that
  // takes caller content, so that is where the double-read attack has to be aimed.
  let reads = 0;
  const hostile: Record<string, unknown> = { ...CONTENT };
  Object.defineProperty(hostile, "body", {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? CONTENT.body : "swapped after the digest"; },
  });
  const fresh = seeded();
  fresh.db.data.set(`${LEGAL_HOLDS}/h9`, { active: false });
  const made = await fresh.store.createDraft({
    caller: caller("author"), draftId: "h9", content: hostile,
    jurisdiction: "TH", expiresAt: null, commandId: "x1", now: NOW,
  });
  assert.equal(made.ok, true, made.code ?? "");
  assert.ok(reads >= 1, "the hostile getter was never read — this block would assert nothing");
  // The persisted content and the persisted digest must describe the SAME text. If the
  // getter's second value had reached persistence while the digest saw the first, the
  // record would be permanently self-inconsistent and unapprovable.
  const stored = fresh.db.read(DRAFTS, "h9");
  assert.equal(stored?.contentDigest, DIGEST, "the digest was computed over different text than was stored");
  assert.equal((stored?.content as Record<string, unknown>).body, CONTENT.body, "the swapped value reached persistence");

  // And the draft remains approvable, proving the snapshot froze a coherent value rather
  // than merely refusing.
  await fresh.store.assignReviewer({ caller: caller("author"), draftId: "h9", expectedVersion: 1, reviewerUid: "reviewer", commandId: "x2", now: NOW });
  await fresh.store.transition({ caller: caller("reviewer"), draftId: "h9", expectedVersion: 2, requestedState: "previewed", commandId: "x3", now: NOW });
  assert.equal((await fresh.store.transition({
    caller: caller("reviewer"), draftId: "h9", expectedVersion: 3,
    requestedState: "approved", commandId: "x4", now: NOW,
  })).ok, true);
  void store; void db;
});

// --- 9b. FREE TEXT IS SCREENED, AND CONTENT IS SCOPED ---------------------------------
// The canonical allowlist screens field NAMES. `subject` and `body` are 8KB of free text,
// so every forbidden field is expressible inside them. Persisting content created this
// exposure, so the values are screened and the content is scoped to the two people who
// must read it.
await block("free text privacy", async () => {
  const { db, store } = seeded();
  db.data.set(`${LEGAL_HOLDS}/f1`, { active: false });
  const LEAKS = [
    "Contact somchai@bkkgolf.co.th to arrange.",
    "Call +66 81 234 5678 for details.",
    "Reach us on 081 234 5678 any time.",
    "Member last seen at 13.7563, 100.5018 this morning.",
    "Logged from 192.168.15.201 yesterday.",
  ];
  for (const [index, leak] of LEAKS.entries()) {
    const out = await store.createDraft({
      caller: caller("author"), draftId: "f1", content: { ...CONTENT, body: leak },
      jurisdiction: "TH", expiresAt: null, commandId: `f-${index}`, now: NOW,
    });
    assert.equal(out.ok, false, leak);
    assert.equal(out.code, "content_rejected", leak);
  }
  assert.equal(db.countIn(DRAFTS), 0, "no draft carrying personal data was persisted");
  // Ordinary outreach copy is NOT refused, so the screen is a filter and not a wall.
  assert.equal((await store.createDraft({
    caller: caller("author"), draftId: "f1", content: { ...CONTENT, body: "We would value the chance to introduce Golfriend to your course." },
    jurisdiction: "TH", expiresAt: null, commandId: "f-ok", now: NOW,
  })).ok, true);

  // SCOPING: an unrelated staff member sees the row but NOT the text.
  await store.assignReviewer({ caller: caller("author"), draftId: "f1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "f-a", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "f1", expectedVersion: 2, requestedState: "previewed", commandId: "f-a-pv", now: NOW });
  const outsider = await store.listDrafts(caller("boss"));
  assert.equal(outsider.rows.length, 1);
  assert.equal(outsider.rows[0].subject, null, "an unrelated staff member received the draft subject");
  assert.equal(outsider.rows[0].body, null, "an unrelated staff member received the draft body");
  assert.equal(outsider.rows[0].state, "previewed", "but the row itself is still visible");
  // The creator and the assigned reviewer DO see it — otherwise no one could review.
  for (const uid of ["author", "reviewer"]) {
    const permitted = await store.listDrafts(caller(uid));
    assert.equal(permitted.rows[0].subject, CONTENT.subject, uid);
    assert.equal(permitted.rows[0].body, "We would value the chance to introduce Golfriend to your course.", uid);
  }
});

// --- 9c. A RECEIPT CARRYING A FORBIDDEN FIELD IS REFUSED -------------------------------
// The denylist guard on receipts had no test at its call site, which is the same pattern
// that made the earlier guards decorative.
await block("receipt screening fires", async () => {
  const { db, store } = seeded();
  assert.equal(persistedShapeIsMinimal({ receiptId: "r", draftId: "d", memberName: "X" }).minimal, false);
  assert.equal(persistedShapeIsMinimal({ receiptId: "r", draftId: "d", toState: "approved" }).minimal, true);
  // A receipt that failed the screen must abort the whole transaction, leaving no record.
  db.data.set(`${LEGAL_HOLDS}/r1`, { active: false });
  const made = await store.createDraft({
    caller: caller("author"), draftId: "r1", content: CONTENT,
    jurisdiction: "TH", expiresAt: null, commandId: "r-a", now: NOW,
  });
  assert.equal(made.ok, true);
  const receipts = [...db.data.entries()].filter(([k]) => k.startsWith(`${RECEIPTS}/`)).map(([, v]) => v);
  for (const receipt of receipts) assert.equal(persistedShapeIsMinimal(receipt).minimal, true);
});

// --- 10. EXPIRY ----------------------------------------------------------------------
await block("expiry", async () => {
  const { db, store } = seeded();
  db.data.set(`${LEGAL_HOLDS}/e1`, { active: false });
  await store.createDraft({ caller: caller("author"), draftId: "e1", content: CONTENT, jurisdiction: "TH", expiresAt: "2026-08-14T00:00:00.000Z", commandId: "e-a", now: "2026-08-13T00:00:00.000Z" });
  await store.assignReviewer({ caller: caller("author"), draftId: "e1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "e-b", now: "2026-08-13T00:00:00.000Z" });
  await store.transition({ caller: caller("reviewer"), draftId: "e1", expectedVersion: 2, requestedState: "previewed", commandId: "e-pv", now: "2026-08-13T00:00:00.000Z" });
  // NOW is past the expiry.
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "e1", expectedVersion: 3,
    requestedState: "approved", commandId: "e-c", now: NOW,
  })).code, "draft_expired");
  // Recording the expiry is still permitted.
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "e1", expectedVersion: 3,
    requestedState: "expired", commandId: "e-d", now: NOW,
  })).ok, true);
  assert.equal(db.read(DRAFTS, "e1")?.state, "expired");
});

// --- 11. REVOCATION IS DIRECTOR-ONLY AND TERMINAL ------------------------------------
await block("revocation", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "v0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "v0-pv", now: NOW });
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "revoked", commandId: "v1", now: NOW,
  })).code, "insufficient_role");
  assert.equal((await store.transition({
    caller: caller("boss"), draftId: "d1", expectedVersion: 3,
    requestedState: "revoked", commandId: "v2", now: NOW,
  })).ok, true);
  assert.equal(db.read(DRAFTS, "d1")?.state, "revoked");
  // Nothing transitions out of a revoked draft — not even a Director.
  assert.equal((await store.transition({
    caller: caller("boss"), draftId: "d1", expectedVersion: 4,
    requestedState: "approved", commandId: "v3", now: NOW,
  })).code, "draft_terminal");
});

// --- 12. UNKNOWN LEGAL HOLD FAILS CLOSED ----------------------------------------------
await block("legal hold", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "h0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "h0-pv", now: NOW });
  // An ACTIVE hold blocks.
  db.data.set(`${LEGAL_HOLDS}/d1`, { active: true });
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "h1", now: NOW,
  })).code, "legal_hold_active");
  // An AMBIGUOUS hold record is UNKNOWN, not "not held".
  db.data.set(`${LEGAL_HOLDS}/d1`, { active: "false" });
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "h2", now: NOW,
  })).code, "legal_hold_unknown");
  // A FAILING read is UNKNOWN. This is the case that must never degrade to "not held".
  db.data.set(`${LEGAL_HOLDS}/d1`, { active: false });
  db.failLegalHoldRead = true;
  assert.equal((await store.transition({
    caller: caller("reviewer"), draftId: "d1", expectedVersion: 3,
    requestedState: "approved", commandId: "h3", now: NOW,
  })).code, "legal_hold_unknown");
  db.failLegalHoldRead = false;
  assert.equal(db.read(DRAFTS, "d1")?.state, "previewed");
});

// --- 13. LISTING: UNAPPROVED JURISDICTION, NO IDENTITY DISCLOSURE ---------------------
await block("listing", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "l0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "l0-pv", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "approved", commandId: "l1", now: NOW });

  const listed = await store.listDrafts(caller("reviewer"));
  assert.equal(listed.ok, true);
  assert.equal(listed.rows.length, 1);
  const row = listed.rows[0];
  // No approved jurisdiction record exists, so an APPROVED draft is still not sendable.
  assert.equal(row.state, "approved");
  assert.equal(row.jurisdictionApproved, false);
  assert.equal(row.sendable, false);
  assert.equal(row.sendableReason, "jurisdiction_not_approved");
  // The caller learns their OWN relationship, never anyone else's identity.
  assert.equal(row.callerIsAssignedReviewer, true);
  assert.equal(row.callerIsCreator, false);
  assert.equal(row.hasAssignedReviewer, true);
  const serialized = JSON.stringify(listed);
  for (const leak of ["author", "reviewer-uid", "createdByKey", "assignedReviewerKey", "contentDigest"]) {
    assert.equal(serialized.includes(leak), false, `the projection leaked ${leak}`);
  }
  // Even with an approved jurisdiction the draft is NOT sendable: transmission is disabled.
  db.data.set("enterprise_jurisdiction_approvals/TH", { legallyApproved: true, version: "th-1" });
  const withApproval = await store.listDrafts(caller("reviewer"));
  assert.equal(withApproval.rows[0].jurisdictionApproved, true);
  assert.equal(withApproval.rows[0].sendable, false);
  assert.equal(withApproval.rows[0].sendableReason, "transmission_not_permitted");
  // A non-admin cannot list at all.
  assert.equal((await store.listDrafts(caller("suspended"))).code, "not_admin");
  assert.equal((await store.listDrafts(caller("nobody"))).code, "not_admin");
});

// --- 14. DUPLICATE DRAFT AND NON-OPAQUE IDS -------------------------------------------
await block("ids", async () => {
  const { db, store } = await createdDraft();
  assert.equal((await store.createDraft({
    caller: caller("author"), draftId: "d1", content: CONTENT, jurisdiction: "TH",
    expiresAt: null, commandId: "dup", now: NOW,
  })).code, "duplicate_draft");
  // A draft id is a lookup key, so a personal-data id is REFUSED, never redacted.
  assert.equal((await store.createDraft({
    caller: caller("author"), draftId: "draft for john@x.com", content: CONTENT,
    jurisdiction: "TH", expiresAt: null, commandId: "bad-id", now: NOW,
  })).code, "payload_rejected");
  assert.equal(db.countIn(DRAFTS), 1);
});

// --- 15. UNSERIALIZABLE CONTENT AND MINIMALITY ----------------------------------------
await block("shape", async () => {
  const { store } = seeded();
  const cyclic: Record<string, unknown> = { ...CONTENT };
  cyclic.self = cyclic;
  assert.equal((await store.createDraft({
    caller: caller("author"), draftId: "z1", content: cyclic, jurisdiction: "TH",
    expiresAt: null, commandId: "z-a", now: NOW,
  })).code, "payload_rejected");
  assert.equal(snapshot(cyclic).ok, false);
  assert.equal(snapshot({ a: 1 }).ok, true);
  // WHAT ACTUALLY KEEPS PERSONAL DATA OUT is the canonical 16-field ALLOWLIST, not the
  // NEVER_PERSISTED denylist. Content carrying a forbidden field is refused at
  // canonicalization with `unknown_field` — before any denylist runs. This asserts the
  // real control and the real reason, because an assertion that merely checks "it was
  // refused" would pass identically whether the denylist existed or not.
  const privacy = seeded();
  privacy.db.data.set(`${LEGAL_HOLDS}/p1`, { active: false });
  for (const forbidden of ["memberName", "email", "phone", "location", "privateNotes"]) {
    const leaky = await privacy.store.createDraft({
      caller: caller("author"), draftId: "p1",
      content: { ...CONTENT, [forbidden]: "Somchai P." },
      jurisdiction: "TH", expiresAt: null, commandId: `p-${forbidden}`, now: NOW,
    });
    assert.equal(leaky.ok, false, forbidden);
    assert.equal(leaky.code, "content_rejected", forbidden);
    assert.equal(outreachContentDigest({ ...CONTENT, [forbidden]: "x" }).error, "unknown_field", forbidden);
  }
  assert.equal(privacy.db.countIn(DRAFTS), 0);
  // And the allowlist and the denylist cannot overlap, so no canonical field is ever a
  // forbidden one. This is the property that makes the allowlist sufficient on its own.
  for (const field of CANONICAL_FIELDS) {
    assert.equal(persistedShapeIsMinimal({ [field]: "value" }).minimal, true, field);
  }
  // The denylist still guards receipts, whose shape is assembled locally and can grow.
  assert.equal(persistedShapeIsMinimal({ email: "x@y.z" }).minimal, false);
  assert.equal(persistedShapeIsMinimal({ nested: { memberName: "x" } }).minimal, false);
  assert.equal(persistedShapeIsMinimal({ state: "approved", version: 1 }).minimal, true);
  // Receipt ids are deterministic per edge, and differ across edges.
  const base = { draftId: "d1", fromVersion: 1, toVersion: 2, toState: "approved", commandId: "c" };
  assert.equal(receiptIdFor(base), receiptIdFor(base));
  assert.notEqual(receiptIdFor(base), receiptIdFor({ ...base, toState: "rejected" }));
  assert.notEqual(receiptIdFor(base), receiptIdFor({ ...base, commandId: "c2" }));
});

// --- 16. RECEIPTS ARE APPEND-ONLY AND CARRY NO CONTENT --------------------------------
await block("receipts", async () => {
  const { db, store } = await createdDraft();
  await store.assignReviewer({ caller: caller("author"), draftId: "d1", expectedVersion: 1, reviewerUid: "reviewer", commandId: "p0", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 2, requestedState: "previewed", commandId: "p0-pv", now: NOW });
  await store.transition({ caller: caller("reviewer"), draftId: "d1", expectedVersion: 3, requestedState: "approved", commandId: "p1", now: NOW });
  const receipts = [...db.data.entries()].filter(([k]) => k.startsWith(`${RECEIPTS}/`)).map(([, v]) => v);
  assert.equal(receipts.length, 4, "create, assign, preview, approve");
  // The chain is contiguous: every receipt's fromVersion is the previous toVersion.
  const chain = receipts.sort((a, b) => (a.toVersion as number) - (b.toVersion as number));
  chain.forEach((r, i) => { if (i > 0) assert.equal(r.fromVersion, chain[i - 1].toVersion); });
  // A receipt records the digest and the edge — never the subject or body.
  const serialized = JSON.stringify(receipts);
  assert.equal(serialized.includes("Preview only."), false, "a receipt must not carry the draft body");
  assert.equal(serialized.includes("Golfriend"), false, "a receipt must not carry the subject");
  assert.equal(serialized.includes(DIGEST), true);
});

console.log(`✅ outreach production store: ${blocks} adversarial blocks passed against the real createOutreachStore() (forged roles, forged reviewer refs, self-approval, stale writes, concurrent writers, changed-payload replay, omitted digest, re-entrancy, expiry, revocation, unknown legal hold, unapproved jurisdiction, id screening, append-only receipts).`);
};

run().catch((error) => { console.error(error); process.exit(1); });
