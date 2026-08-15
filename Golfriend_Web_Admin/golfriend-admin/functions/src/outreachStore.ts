// ==========================================
// FILE: functions/src/outreachStore.ts
// CONCRETE production persistence binding for enterprise outreach drafts.
//
// This is the real store: Firestore via the Admin SDK, every command executed inside a
// single db.runTransaction so that the version read, the authority decision, the record
// write, the receipt append and the replay-ledger write either all happen or none do.
//
// It supplies I/O only. Every authority decision is made by the pure core in
// outreachAuthority.ts from server-resolved values. This file must never decide who may
// approve, what state a draft moves to, or whether a digest matches.
//
// Collections (all server-owned; client Firestore rules deny them outright — the Admin UI
// reaches this data only through the callables in index.ts):
//   enterprise_outreach_drafts/{draftId}
//   enterprise_outreach_receipts/{receiptId}     append-only, create-only
//   enterprise_outreach_commands/{commandId}     replay ledger
//   enterprise_legal_holds/{draftId}             hold state; absent read => UNKNOWN
//   enterprise_jurisdiction_approvals/{code}     legal approval; absent => NOT approved
//
// NO EMAIL IS SENT AND NO COURSE IS CONTACTED by anything in this file. There is no
// transmitter, no mail client, no outbound HTTP. A draft reaching `approved` records an
// approval; it does not deliver anything.
// ==========================================
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  decideAssignment, decideTransition, identityKey, isOpaqueId, jurisdictionDecision,
  legalHoldState, presentsSurrogate, sendability,
  type CallerContext, type Decision, type PersistedDraft,
} from "./outreachAuthority.js";
import { commandFingerprint, outreachContentDigest, sha256Hex } from "./outreachCanonical.js";
import { isActiveStaff, type AdminUserDoc } from "./authority.js";

export const DRAFTS = "enterprise_outreach_drafts";
export const RECEIPTS = "enterprise_outreach_receipts";
export const COMMANDS = "enterprise_outreach_commands";
export const LEGAL_HOLDS = "enterprise_legal_holds";
export const JURISDICTION_APPROVALS = "enterprise_jurisdiction_approvals";
const ADMIN_USERS = "admin_users";

/**
 * Fields that must never reach persistence. Outreach records carry versions, refs and
 * digests — never member identity, private notes or precise personal movement.
 */
const NEVER_PERSISTED: readonly string[] = Object.freeze([
  "email", "phone", "memberName", "memberId", "playerName", "notes", "privateNotes",
  "location", "coordinates", "lat", "lng", "deviceId", "ipAddress", "handicapHistory",
]);

export interface StoreResult {
  ok: boolean;
  code: string | null;
  replayed: boolean;
  draftId: string | null;
  state: string | null;
  version: number | null;
  receiptId: string | null;
}

const fail = (code: string): StoreResult =>
  ({ ok: false, code, replayed: false, draftId: null, state: null, version: null, receiptId: null });

/**
 * Snapshot caller input through JSON before ANY authority decision reads it. A getter on
 * the caller's object otherwise runs arbitrary code between the version check and the
 * write, and can return one value to the digest and a different one to the persisted
 * fields. Unserializable input refuses rather than being coerced.
 */
export function snapshot(value: unknown): { ok: boolean; value: unknown } {
  if (value === undefined) return { ok: true, value: undefined };
  try {
    const serialized = JSON.stringify(value, (_key, node) => {
      if (typeof node === "function" || typeof node === "symbol") throw new Error("unserializable");
      if (typeof node === "number" && !Number.isFinite(node)) throw new Error("unserializable");
      return node;
    });
    if (serialized === undefined) return { ok: false, value: null };
    return { ok: true, value: JSON.parse(serialized) };
  } catch {
    return { ok: false, value: null };
  }
}

/** Structural check that a record about to be written carries no forbidden field or value. */
export function persistedShapeIsMinimal(value: unknown): { minimal: boolean; offendingFields: string[] } {
  const offenders: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (NEVER_PERSISTED.indexOf(key) !== -1) offenders.push(key);
        walk(child);
      }
    }
  };
  walk(value);
  return { minimal: offenders.length === 0, offendingFields: offenders };
}

function toPersistedDraft(draftId: string, data: Record<string, unknown> | undefined): PersistedDraft | null {
  if (!data) return null;
  const version = data.version;
  const state = data.state;
  const digest = data.contentDigest;
  // A record that does not present a well-formed state/version/digest is NOT usable as
  // authority. Coercing it would let a malformed or partially-written document be treated
  // as a valid baseline for a compare-and-set.
  if (typeof version !== "number" || !Number.isInteger(version)) return null;
  if (typeof state !== "string" || typeof digest !== "string") return null;
  return {
    draftId,
    state,
    version,
    contentDigest: digest,
    digestAlgorithm: typeof data.digestAlgorithm === "string" ? data.digestAlgorithm : "",
    createdByKey: typeof data.createdByKey === "string" ? data.createdByKey : null,
    assignedReviewerKey: typeof data.assignedReviewerKey === "string" ? data.assignedReviewerKey : null,
    jurisdiction: typeof data.jurisdiction === "string" ? data.jurisdiction : null,
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
  };
}

/** Deterministic receipt id, so the same edge cannot append two receipts. */
export function receiptIdFor(args: {
  draftId: string; fromVersion: number; toVersion: number; toState: string; commandId: string;
}): string {
  const material = `${args.draftId}|${args.fromVersion}|${args.toVersion}|${args.toState}|${args.commandId}`;
  return `prc-${sha256Hex(material).slice(0, 32)}`;
}

export interface OutreachStore {
  createDraft(args: CreateArgs): Promise<StoreResult>;
  assignReviewer(args: AssignArgs): Promise<StoreResult>;
  transition(args: TransitionArgs): Promise<StoreResult>;
  listDrafts(caller: CallerContext, limit?: number): Promise<ListResult>;
}

export interface CreateArgs {
  caller: CallerContext;
  draftId: unknown;
  content: unknown;
  jurisdiction: unknown;
  expiresAt: unknown;
  commandId: unknown;
  now: string;
}

export interface AssignArgs {
  caller: CallerContext;
  draftId: unknown;
  expectedVersion: unknown;
  reviewerUid: unknown;
  commandId: unknown;
  now: string;
}

export interface TransitionArgs {
  caller: CallerContext;
  draftId: unknown;
  expectedVersion: unknown;
  requestedState: unknown;
  content: unknown;
  commandId: unknown;
  now: string;
}

export interface ListRow {
  draftId: string;
  state: string;
  version: number;
  jurisdiction: string | null;
  jurisdictionApproved: boolean;
  legalHold: boolean | null;
  expiresAt: string | null;
  hasAssignedReviewer: boolean;
  callerIsCreator: boolean;
  callerIsAssignedReviewer: boolean;
  sendable: boolean;
  sendableReason: string;
}

export interface ListResult {
  ok: boolean;
  code: string | null;
  rows: ListRow[];
}

/**
 * Read the legal-hold state for a draft. A read that THROWS yields `null` (UNKNOWN), which
 * the authority core refuses on. Returning `false` on a failed read would convert an
 * infrastructure error into "not under legal hold", which is exactly backwards.
 */
async function readLegalHold(tx: Transaction, db: Firestore, draftId: string): Promise<boolean | null> {
  try {
    const snap = await tx.get(db.collection(LEGAL_HOLDS).doc(draftId));
    return legalHoldState(snap.exists ? (snap.data() as Record<string, unknown>) : null, true);
  } catch {
    return legalHoldState(null, false);
  }
}

async function readAdminDoc(tx: Transaction, db: Firestore, uid: string): Promise<AdminUserDoc | null> {
  const snap = await tx.get(db.collection(ADMIN_USERS).doc(uid));
  return snap.exists ? (snap.data() as AdminUserDoc) : null;
}

export function createOutreachStore(db: Firestore): OutreachStore {
  /**
   * Replay ledger. Read inside the transaction so a concurrent duplicate cannot slip
   * between the check and the write; the ledger doc is written with `create`, which fails
   * the whole transaction if another attempt claimed the same id first.
   */
  async function replayCheck(
    tx: Transaction, commandId: string, fingerprint: string,
  ): Promise<{ hit: boolean; mismatch: boolean; result: StoreResult | null }> {
    const snap = await tx.get(db.collection(COMMANDS).doc(commandId));
    if (!snap.exists) return { hit: false, mismatch: false, result: null };
    const data = snap.data() as Record<string, unknown>;
    if (data.fingerprint !== fingerprint) return { hit: true, mismatch: true, result: null };
    const stored = (data.result ?? null) as StoreResult | null;
    // The original result, FLAGGED, so a caller can tell a replay from a fresh write.
    return { hit: true, mismatch: false, result: stored ? { ...stored, replayed: true } : null };
  }

  async function guardedCommand(
    commandId: unknown, payload: unknown,
    run: (tx: Transaction, commandId: string, fingerprint: string) => Promise<StoreResult>,
  ): Promise<StoreResult> {
    if (!isOpaqueId(commandId)) return fail("payload_rejected");
    const fingerprint = commandFingerprint(payload);
    if (fingerprint === null) return fail("payload_rejected");
    try {
      return await db.runTransaction(async (tx) => {
        const replay = await replayCheck(tx, commandId as string, fingerprint);
        if (replay.hit) {
          if (replay.mismatch) return fail("replay_payload_mismatch");
          return replay.result ?? fail("internal_error");
        }
        return await run(tx, commandId as string, fingerprint);
      });
    } catch {
      // A transaction that lost a race, or a store failure, is an internal error — never a
      // silent success. Nothing is reported as written that was not written.
      return fail("internal_error");
    }
  }

  /** Persist the command outcome in the same transaction that produced it. */
  function recordCommand(tx: Transaction, commandId: string, fingerprint: string, result: StoreResult): void {
    tx.create(db.collection(COMMANDS).doc(commandId), {
      fingerprint,
      result: { ...result, replayed: false },
      recordedAt: new Date().toISOString(),
    });
  }

  /** Append an immutable receipt. `create` makes the append-only property structural. */
  function appendReceipt(tx: Transaction, receipt: Record<string, unknown>): void {
    tx.create(db.collection(RECEIPTS).doc(receipt.receiptId as string), receipt);
  }

  return {
    async createDraft(args: CreateArgs): Promise<StoreResult> {
      const { caller, draftId, jurisdiction, expiresAt, commandId, now } = args;
      // Snapshot BEFORE any decision reads the content.
      const snap = snapshot(args.content);
      if (!snap.ok) return fail("payload_rejected");
      const content = snap.value;

      if (!caller.uid) return fail("unauthenticated");
      if (!isOpaqueId(draftId)) return fail("payload_rejected");
      if (presentsSurrogate(caller.uid)) return fail("payload_rejected");
      if (expiresAt !== null && expiresAt !== undefined && typeof expiresAt !== "string") {
        return fail("payload_rejected");
      }

      const digest = outreachContentDigest(content);
      if (!digest.ok || !digest.digest) return fail("content_rejected");

      return guardedCommand(commandId, { op: "create", draftId, content, jurisdiction, expiresAt }, async (tx, cid, fp) => {
        const adminDoc = await readAdminDoc(tx, db, caller.uid as string);
        const resolved: CallerContext = { ...caller, adminDoc };
        if (!isActiveStaff(adminDoc)) return fail("not_admin");

        const ref = db.collection(DRAFTS).doc(draftId as string);
        const existing = await tx.get(ref);
        if (existing.exists) return fail("duplicate_draft");

        // Legal hold is consulted even at creation: a held subject may not gain new records.
        const held = await readLegalHold(tx, db, draftId as string);
        if (held === null) return fail("legal_hold_unknown");
        if (held) return fail("legal_hold_active");
        void resolved;

        const record = {
          draftId: draftId as string,
          state: "draft_created",
          version: 1,
          contentDigest: digest.digest,
          digestAlgorithm: "sha-256",
          createdByKey: identityKey(caller.uid),
          assignedReviewerKey: null,
          jurisdiction: typeof jurisdiction === "string" ? jurisdiction : null,
          expiresAt: typeof expiresAt === "string" ? expiresAt : null,
          createdAt: now,
          updatedAt: now,
        };
        const minimal = persistedShapeIsMinimal(record);
        if (!minimal.minimal) return fail("payload_rejected");

        const receiptId = receiptIdFor({ draftId: draftId as string, fromVersion: 0, toVersion: 1, toState: "draft_created", commandId: cid });
        const result: StoreResult = {
          ok: true, code: null, replayed: false, draftId: draftId as string,
          state: "draft_created", version: 1, receiptId,
        };
        tx.create(ref, record);
        appendReceipt(tx, {
          receiptId, draftId: draftId as string, action: "create",
          fromState: null, toState: "draft_created", fromVersion: 0, toVersion: 1,
          actorKey: identityKey(caller.uid), contentDigest: digest.digest, at: now, commandId: cid,
        });
        recordCommand(tx, cid, fp, result);
        return result;
      });
    },

    async assignReviewer(args: AssignArgs): Promise<StoreResult> {
      const { caller, draftId, expectedVersion, reviewerUid, commandId, now } = args;
      if (!caller.uid) return fail("unauthenticated");
      if (!isOpaqueId(draftId)) return fail("payload_rejected");
      // A published surrogate may never be presented back as an identity. The surrogate is
      // a privacy transform; accepting it as input would make it an authentication token.
      if (presentsSurrogate(reviewerUid) || presentsSurrogate(caller.uid)) return fail("payload_rejected");
      if (typeof reviewerUid !== "string" || reviewerUid.trim() === "") return fail("payload_rejected");

      return guardedCommand(commandId, { op: "assign", draftId, expectedVersion, reviewerUid }, async (tx, cid, fp) => {
        const adminDoc = await readAdminDoc(tx, db, caller.uid as string);
        const resolved: CallerContext = { ...caller, adminDoc };

        const ref = db.collection(DRAFTS).doc(draftId as string);
        const snap = await tx.get(ref);
        const record = toPersistedDraft(draftId as string, snap.exists ? (snap.data() as Record<string, unknown>) : undefined);

        // The reviewer's identity is resolved from a TRUSTED admin_users read, not from the
        // string the caller sent. A uid with no active admin document yields a null key.
        const reviewerDoc = await readAdminDoc(tx, db, reviewerUid);
        const reviewerKey = isActiveStaff(reviewerDoc) ? identityKey(reviewerUid) : null;

        const held = record ? await readLegalHold(tx, db, draftId as string) : null;
        const decision = decideAssignment({ caller: resolved, record, expectedVersion, reviewerKey, legalHold: held });
        if (!decision.ok || decision.toState === null || decision.toVersion === null) {
          return fail(decision.code ?? "internal_error");
        }

        const receiptId = receiptIdFor({
          draftId: draftId as string, fromVersion: (record as PersistedDraft).version,
          toVersion: decision.toVersion, toState: decision.toState, commandId: cid,
        });
        const result: StoreResult = {
          ok: true, code: null, replayed: false, draftId: draftId as string,
          state: decision.toState, version: decision.toVersion, receiptId,
        };
        tx.update(ref, {
          state: decision.toState,
          version: decision.toVersion,
          assignedReviewerKey: reviewerKey,
          updatedAt: now,
        });
        appendReceipt(tx, {
          receiptId, draftId: draftId as string, action: "assign_reviewer",
          fromState: (record as PersistedDraft).state, toState: decision.toState,
          fromVersion: (record as PersistedDraft).version, toVersion: decision.toVersion,
          actorKey: identityKey(caller.uid), contentDigest: (record as PersistedDraft).contentDigest,
          at: now, commandId: cid,
        });
        recordCommand(tx, cid, fp, result);
        return result;
      });
    },

    async transition(args: TransitionArgs): Promise<StoreResult> {
      const { caller, draftId, expectedVersion, requestedState, commandId, now } = args;
      const snapped = snapshot(args.content);
      if (!snapped.ok) return fail("payload_rejected");
      const content = snapped.value;

      if (!caller.uid) return fail("unauthenticated");
      if (!isOpaqueId(draftId)) return fail("payload_rejected");

      return guardedCommand(
        commandId,
        { op: "transition", draftId, expectedVersion, requestedState, content },
        async (tx, cid, fp) => {
          const adminDoc = await readAdminDoc(tx, db, caller.uid as string);
          const resolved: CallerContext = { ...caller, adminDoc };

          const ref = db.collection(DRAFTS).doc(draftId as string);
          const snap = await tx.get(ref);
          const record = toPersistedDraft(draftId as string, snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
          const held = record ? await readLegalHold(tx, db, draftId as string) : null;

          const decision: Decision = decideTransition({
            caller: resolved, record, expectedVersion, requestedState,
            currentContent: content, now, legalHold: held,
          });
          if (!decision.ok || decision.toState === null || decision.toVersion === null) {
            return fail(decision.code ?? "internal_error");
          }

          const current = record as PersistedDraft;
          const receiptId = receiptIdFor({
            draftId: draftId as string, fromVersion: current.version,
            toVersion: decision.toVersion, toState: decision.toState, commandId: cid,
          });
          const result: StoreResult = {
            ok: true, code: null, replayed: false, draftId: draftId as string,
            state: decision.toState, version: decision.toVersion, receiptId,
          };
          // Only the state, version and timestamp move. The digest is NEVER rewritten by a
          // transition: the approved content is the content that was digested at creation.
          tx.update(ref, { state: decision.toState, version: decision.toVersion, updatedAt: now });
          appendReceipt(tx, {
            receiptId, draftId: draftId as string, action: "transition",
            fromState: current.state, toState: decision.toState,
            fromVersion: current.version, toVersion: decision.toVersion,
            actorKey: identityKey(caller.uid), contentDigest: current.contentDigest,
            at: now, commandId: cid,
          });
          recordCommand(tx, cid, fp, result);
          return result;
        },
      );
    },

    async listDrafts(caller: CallerContext, limit = 50): Promise<ListResult> {
      if (!caller.uid) return { ok: false, code: "unauthenticated", rows: [] };
      const adminSnap = await db.collection(ADMIN_USERS).doc(caller.uid).get();
      if (!isActiveStaff(adminSnap.exists ? (adminSnap.data() as AdminUserDoc) : null)) {
        return { ok: false, code: "not_admin", rows: [] };
      }
      const callerKey = identityKey(caller.uid);
      const snap = await db.collection(DRAFTS).limit(Math.min(Math.max(1, limit), 200)).get();
      const rows: ListRow[] = [];
      for (const doc of snap.docs) {
        const record = toPersistedDraft(doc.id, doc.data() as Record<string, unknown>);
        if (!record) continue;

        let approvalDoc: Record<string, unknown> | null = null;
        if (record.jurisdiction) {
          const j = await db.collection(JURISDICTION_APPROVALS).doc(record.jurisdiction).get();
          approvalDoc = j.exists ? (j.data() as Record<string, unknown>) : null;
        }
        const jurisdiction = jurisdictionDecision(record.jurisdiction, approvalDoc);

        let held: boolean | null;
        try {
          const h = await db.collection(LEGAL_HOLDS).doc(doc.id).get();
          held = legalHoldState(h.exists ? (h.data() as Record<string, unknown>) : null, true);
        } catch {
          held = null;
        }

        const send = sendability({ record, jurisdictionApproved: jurisdiction.approved, legalHold: held, now: new Date().toISOString() });
        // The projection carries NO identity: the caller learns their OWN relationship to
        // the draft and whether a reviewer exists, never who anyone else is.
        rows.push({
          draftId: record.draftId,
          state: record.state,
          version: record.version,
          jurisdiction: record.jurisdiction,
          jurisdictionApproved: jurisdiction.approved,
          legalHold: held,
          expiresAt: record.expiresAt,
          hasAssignedReviewer: record.assignedReviewerKey !== null,
          callerIsCreator: callerKey !== null && callerKey === record.createdByKey,
          callerIsAssignedReviewer: callerKey !== null && callerKey === record.assignedReviewerKey,
          sendable: send.sendable,
          sendableReason: send.reason,
        });
      }
      return { ok: true, code: null, rows };
    },
  };
}
