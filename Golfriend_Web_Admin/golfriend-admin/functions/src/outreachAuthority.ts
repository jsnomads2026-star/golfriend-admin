// ==========================================
// FILE: functions/src/outreachAuthority.ts
// Pure, testable authority core for enterprise outreach drafts and approvals.
//
// EVERY decision in this file is made from SERVER-RESOLVED inputs:
//   - the caller identity is request.auth.uid (verified by the Functions runtime),
//   - the caller's role comes from the admin_users/{uid} document,
//   - the draft's creator, assigned reviewer, state, version, digest and expiry come
//     from the PERSISTED record,
//   - jurisdiction approval and legal-hold status come from server-owned collections.
//
// Nothing the client sends is trusted as authority. A client-supplied role, reviewer
// reference, current state, digest, "approved" flag or approval verb is ignored — it is
// either re-derived here or the command is refused. Separation of duties is keyed on the
// TARGET STATE, never on the caller's verb, because a verb is the caller's to rename.
//
// This module performs NO I/O. outreachStore.ts supplies the reads and applies the
// writes inside a Firestore transaction. Keeping the decisions pure is what makes the
// adversarial suite in outreachAuthority.test.ts able to attack them directly.
// ==========================================
import { digestsEqual, outreachContentDigest } from "./outreachCanonical.js";
import { isActiveDirector, isActiveStaff, type AdminUserDoc } from "./authority.js";

/** The complete set of states a persisted draft may hold. An invented state is not a state. */
export const PERSISTED_STATES: readonly string[] = Object.freeze([
  "draft_created", "reviewer_assigned", "previewed", "approved",
  "rejected", "changes_requested", "expired", "revoked",
]);

/** Target states that constitute an approval and therefore require the reviewer controls. */
export const APPROVAL_STATES: readonly string[] = Object.freeze(["approved"]);

/** Terminal states. Nothing transitions out of these. */
export const TERMINAL_STATES: readonly string[] = Object.freeze(["revoked", "expired"]);

/**
 * Stable, localized-safe error codes. These are the ONLY strings a callable returns to a
 * client on refusal. They are enum-like keys the Admin UI localizes into all eight
 * locales; they never carry a record field, a name, a reviewer identity or a stack.
 */
export const OUTREACH_ERROR_CODES: readonly string[] = Object.freeze([
  "unauthenticated", "app_check_required", "not_admin", "insufficient_role",
  "payload_rejected", "content_rejected", "draft_not_found", "duplicate_draft",
  "version_required", "stale_write", "invalid_state", "separation_of_duties",
  "reviewer_not_assigned", "digest_mismatch", "draft_expired", "draft_terminal",
  "jurisdiction_not_approved", "legal_hold_unknown", "legal_hold_active",
  "replay_payload_mismatch", "retention_policy_unavailable", "transmission_not_permitted",
  "internal_error",
]);

/**
 * Transmission is NOT implemented and is not permitted by this lane. The constant exists so
 * that a future transmitter has to change a declared value under review, rather than
 * appearing because some code path forgot to check.
 */
export const TRANSMISSION_ENABLED = false;

/** Shape of a published surrogate reference. A caller may never present one as an identity. */
const SURROGATE_SHAPE = /^(actor|prospect|contact|rcpt|ref)-[0-9a-z]+$/;

/** Opaque identifier shape. A draft id is a lookup key, so it is refused, never redacted. */
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Canonical identity comparison key. NFC-folded, trimmed and case-folded so that
 * "ADMIN-1", "Admin-1" and " admin-1 " cannot be presented as three different people and
 * defeat separation of duties.
 */
export function identityKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.normalize("NFC").trim().toLowerCase();
  return key === "" ? null : key;
}

/** True when a caller is presenting a published surrogate as if it were a real identity. */
export function presentsSurrogate(value: unknown): boolean {
  return typeof value === "string" && SURROGATE_SHAPE.test(value.trim());
}

export function isOpaqueId(value: unknown): boolean {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

export interface PersistedDraft {
  draftId: string;
  state: string;
  version: number;
  /**
   * The canonical content, PERSISTED. A digest with no retrievable content is useless
   * twice over: no human can review what they are approving, and the digest can only ever
   * be verified against something the caller sends — which makes the caller the source of
   * truth for the very thing the digest exists to pin down.
   */
  content: unknown;
  contentDigest: string;
  digestAlgorithm: string;
  createdByKey: string | null;
  assignedReviewerKey: string | null;
  jurisdiction: string | null;
  expiresAt: string | null;
}

/**
 * The permitted state graph. A flat "is this a known state" allowlist is not a workflow:
 * without edges, `rejected -> approved` and `draft_created -> approved` are both legal and
 * the `previewed` step is decorative. Edges are declared explicitly so that adding one is
 * a reviewable act.
 */
export const TRANSITION_EDGES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // `reviewer_assigned` is deliberately NOT a target of any plain transition: it is reached
  // only through assignReviewer, which is the command that actually records a reviewer.
  // Allowing it here let a caller set the state with a null reviewer, so the record and its
  // permanent receipt both attested an assignment that never happened.
  draft_created: Object.freeze(["previewed", "revoked", "expired"]),
  // A reviewer must PREVIEW before approving. Listing `approved` here made `previewed` a
  // label nothing required passing through — a human approval nobody had to look at.
  reviewer_assigned: Object.freeze(["previewed", "rejected", "changes_requested", "revoked", "expired"]),
  previewed: Object.freeze(["approved", "rejected", "changes_requested", "revoked", "expired"]),
  changes_requested: Object.freeze(["previewed", "revoked", "expired"]),
  // An approval or rejection is final for that draft: reopening it would let a reviewer
  // launder a second decision through the same record and the same digest.
  approved: Object.freeze(["revoked", "expired"]),
  rejected: Object.freeze(["revoked", "expired"]),
  expired: Object.freeze([]),
  revoked: Object.freeze([]),
});

/** States from which a reviewer may be assigned or re-assigned. */
export const ASSIGNABLE_FROM: readonly string[] = Object.freeze([
  "draft_created", "reviewer_assigned", "previewed", "changes_requested",
]);

/**
 * Strict ISO-8601 UTC instant. `expiresAt` is compared with a string comparison against a
 * server ISO timestamp, so a value in any other shape compares nonsensically: "never"
 * sorts after every digit and the draft would never expire at all.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isValidExpiry(value: unknown): boolean {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  // Round-trip: rejects impossible dates such as month 13 or the 31st of February.
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export interface CallerContext {
  /** request.auth.uid — verified by the Functions runtime, never read from request.data. */
  uid: string | null;
  /** The admin_users/{uid} document, or null when the document does not exist. */
  adminDoc: AdminUserDoc | null;
  /** Whether the request carried a verified App Check token. */
  appCheckVerified: boolean;
}

export interface JurisdictionApproval {
  legallyApproved?: unknown;
  version?: unknown;
}

export interface LegalHoldRecord {
  active?: unknown;
}

export interface Decision {
  ok: boolean;
  code: string | null;
  /** Server-decided next state. Never echoed from the caller. */
  toState: string | null;
  toVersion: number | null;
}

const refuse = (code: string): Decision => ({ ok: false, code, toState: null, toVersion: null });
const allow = (toState: string, toVersion: number): Decision =>
  ({ ok: true, code: null, toState, toVersion });

/**
 * App Check enforcement.
 *
 * App Check is NOT provisioned in this repository: no attestation provider is configured
 * in the client bundle and no App Check dependency exists in either package. Turning
 * enforcement on here would reject every real Admin request, so the flag is OFF and says
 * so. It is a single declared constant precisely so that provisioning App Check is a
 * one-line, reviewable change rather than a hunt through handlers — and both branches are
 * covered by the adversarial suite, so the enforced path is proven before it is switched on.
 */
export const APP_CHECK_ENFORCED = false;

/**
 * `enforced` is a PARAMETER, defaulting to the declared constant, so the enforced branch is
 * executed by the real function in tests rather than by a stub the test wrote itself. A
 * stub proves only that the test file can return a string.
 */
export function appCheckDecision(caller: CallerContext, enforced: boolean = APP_CHECK_ENFORCED): Decision | null {
  if (!enforced) return null;
  return caller.appCheckVerified === true ? null : refuse("app_check_required");
}

/**
 * Caller authorization. Fails closed on a missing uid, a missing admin_users document, a
 * suspended account or an account with no assigned role. There is no break-glass and no
 * environment bypass — this reuses the existing server-owned staff authority verbatim.
 */
export function authorizeCaller(caller: CallerContext, requireDirector = false): Decision | null {
  const appCheck = appCheckDecision(caller);
  if (appCheck) return appCheck;
  if (!caller.uid || typeof caller.uid !== "string") return refuse("unauthenticated");
  if (!isActiveStaff(caller.adminDoc)) return refuse("not_admin");
  if (requireDirector && !isActiveDirector(caller.adminDoc)) return refuse("insufficient_role");
  return null;
}

/**
 * Jurisdiction gate. A jurisdiction is sendable ONLY when a server-owned record marks it
 * legally approved AND carries a policy version. No such record exists yet, so every
 * jurisdiction currently refuses. That refusal is the honest state of the world: this lane
 * is not authorized to author legal wording, opt-out language or jurisdiction policy, and
 * a default-allow here would manufacture an approval nobody granted.
 */
export function jurisdictionDecision(
  jurisdiction: unknown,
  approval: JurisdictionApproval | null | undefined,
): { approved: boolean; version: string | null; code: string | null } {
  if (typeof jurisdiction !== "string" || jurisdiction.trim() === "") {
    return { approved: false, version: null, code: "jurisdiction_not_approved" };
  }
  if (!approval || typeof approval !== "object") {
    return { approved: false, version: null, code: "jurisdiction_not_approved" };
  }
  // Strictly `true`. A truthy string such as "pending" must not read as approval.
  if (approval.legallyApproved !== true) {
    return { approved: false, version: null, code: "jurisdiction_not_approved" };
  }
  if (typeof approval.version !== "string" || approval.version.trim() === "") {
    return { approved: false, version: null, code: "jurisdiction_not_approved" };
  }
  return { approved: true, version: approval.version, code: null };
}

/**
 * Legal hold. Three-valued on purpose: `true` held, `false` not held, `null` UNKNOWN.
 * Unknown must never collapse to `false` — "we could not determine whether this is under
 * legal hold" is not "it is not under legal hold".
 */
export function legalHoldState(record: LegalHoldRecord | null | undefined, readOk: boolean): boolean | null {
  if (!readOk) return null;
  if (record === null || record === undefined) return false;
  if (typeof record !== "object") return null;
  if (record.active === true) return true;
  if (record.active === false) return false;
  return null;
}

export function legalHoldDecision(held: boolean | null): Decision | null {
  if (held === null) return refuse("legal_hold_unknown");
  if (held === true) return refuse("legal_hold_active");
  return null;
}

/**
 * Retention and deletion remain PORT-DRIVEN. No duration, schedule or deletion rule is
 * invented here. Until an approved policy record exists, any retention-dependent operation
 * refuses rather than applying a plausible-looking default.
 */
export function retentionDecision(policy: { version?: unknown; approved?: unknown } | null): Decision | null {
  if (!policy || typeof policy !== "object") return refuse("retention_policy_unavailable");
  if (policy.approved !== true) return refuse("retention_policy_unavailable");
  if (typeof policy.version !== "string" || policy.version.trim() === "") {
    return refuse("retention_policy_unavailable");
  }
  return null;
}

export interface TransitionInput {
  /** Server-resolved caller. */
  caller: CallerContext;
  /** The PERSISTED record read inside the transaction. */
  record: PersistedDraft | null;
  /** Caller-declared version for compare-and-set. Only ever compared, never written. */
  expectedVersion: unknown;
  /** Caller-requested target state. Validated against the allowlist; never written raw. */
  requestedState: unknown;
  /** Caller-supplied content, re-digested here and compared to the persisted digest. */
  currentContent: unknown;
  /** ISO instant supplied by the server clock, not by the caller. */
  now: string;
  /** Legal-hold status resolved from a server record. */
  legalHold: boolean | null;
}

/**
 * The authoritative transition decision.
 *
 * Order matters: authentication, then authorization, then the state allowlist, then the
 * record, then compare-and-set, then legal hold, then terminal/expiry, then separation of
 * duties, then the digest. Every one of these is derived from a server-resolved value.
 */
export function decideTransition(input: TransitionInput): Decision {
  const { caller, record, expectedVersion, requestedState, currentContent, now, legalHold } = input;

  // A revocation is a Director action; every other transition is active-staff.
  const wantsRevoke = requestedState === "revoked";
  const authz = authorizeCaller(caller, wantsRevoke);
  if (authz) return authz;

  // The target state must be one this system actually has. An unknown state cannot be
  // written, so a caller cannot invent "super_approved" and land outside every guard.
  if (typeof requestedState !== "string" || PERSISTED_STATES.indexOf(requestedState) === -1) {
    return refuse("invalid_state");
  }
  if (!record) return refuse("draft_not_found");

  // Optimistic concurrency: an EXACT integer version match. A missing version is refused
  // rather than defaulted, because defaulting turns compare-and-set into last-write-wins.
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return refuse("version_required");
  }
  if (record.version !== expectedVersion) return refuse("stale_write");

  const hold = legalHoldDecision(legalHold);
  if (hold) return hold;

  // Terminal is reported before the graph so a closed draft says so, rather than giving the
  // generic "that edge does not exist".
  if (TERMINAL_STATES.indexOf(record.state) !== -1) return refuse("draft_terminal");

  // The edge must exist in the declared graph. Without this, every state is reachable from
  // every other: `rejected -> approved` was legal, approval could skip reviewer assignment,
  // and `previewed` was a label nothing required passing through.
  const allowedTargets = TRANSITION_EDGES[record.state];
  if (!allowedTargets || allowedTargets.indexOf(requestedState) === -1) {
    return refuse("invalid_state");
  }

  // An expiry that nothing enforces is worse than no expiry at all. Only the transition
  // that RECORDS the expiry is permitted once the deadline has passed.
  // An UNPARSEABLE stored expiry is treated as PASSED, not as absent. Reading it as
  // "not yet expired" fails OPEN twice over: the draft becomes immortal AND can never be
  // closed as expired. Records written before expiry validation existed accepted any
  // string, so "never" is exactly the legacy value at risk — and "never" sorts after every
  // digit, so a raw comparison would report it as not yet reached, forever.
  const hasExpiry = typeof record.expiresAt === "string" && record.expiresAt !== "";
  const unparseableExpiry = hasExpiry && !isValidExpiry(record.expiresAt);
  const pastDeadline = hasExpiry && (unparseableExpiry || now > (record.expiresAt as string));
  if (pastDeadline && requestedState !== "expired") return refuse("draft_expired");
  // `expired` is terminal, so without this it would be a revocation any staff member could
  // perform — the exact outcome the Director-only revoke gate exists to prevent. Recording
  // an expiry is only permitted once the deadline has ACTUALLY passed.
  if (requestedState === "expired" && !pastDeadline) return refuse("invalid_state");

  const actorKey = identityKey(caller.uid);
  if (!actorKey) return refuse("unauthenticated");
  // The verified uid can never be a surrogate, but a future caller-supplied actor path
  // would be, and this is the guard that would stop it.
  if (presentsSurrogate(caller.uid)) return refuse("payload_rejected");

  // SEPARATION OF DUTIES — keyed on the TARGET STATE, not on any caller-supplied verb.
  // Keying on a verb let a creator approve their own draft simply by renaming the action.
  const isApproval = APPROVAL_STATES.indexOf(requestedState) !== -1;
  if (isApproval) {
    if (actorKey === record.createdByKey) return refuse("separation_of_duties");
    if (!record.assignedReviewerKey) return refuse("reviewer_not_assigned");
    if (actorKey !== record.assignedReviewerKey) return refuse("separation_of_duties");
  }

  // The digest is recomputed on EVERY transition. Making it conditional on the caller
  // supplying content meant that omitting the argument skipped the check entirely.
  const recomputed = outreachContentDigest(currentContent);
  if (!recomputed.ok) return refuse("content_rejected");
  // The caller's own digest claim is never consulted; only the recomputed one is.
  if (!digestsEqual(recomputed.digest, record.contentDigest)) return refuse("digest_mismatch");

  return allow(requestedState, record.version + 1);
}

export interface AssignmentInput {
  caller: CallerContext;
  record: PersistedDraft | null;
  expectedVersion: unknown;
  reviewerKey: string | null;
  legalHold: boolean | null;
}

/**
 * Reviewer assignment. `reviewerKey` is resolved by the store from a trusted admin_users
 * lookup — the caller sends a uid, and a uid with no active admin_users document produces
 * a null key here and is refused.
 */
export function decideAssignment(input: AssignmentInput): Decision {
  const { caller, record, expectedVersion, reviewerKey, legalHold } = input;
  const authz = authorizeCaller(caller);
  if (authz) return authz;
  // A published surrogate may never be presented as an identity, at either end.
  if (presentsSurrogate(caller.uid)) return refuse("payload_rejected");
  if (!record) return refuse("draft_not_found");
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    return refuse("version_required");
  }
  if (record.version !== expectedVersion) return refuse("stale_write");
  const hold = legalHoldDecision(legalHold);
  if (hold) return hold;
  if (TERMINAL_STATES.indexOf(record.state) !== -1) return refuse("draft_terminal");
  // Assignment is only meaningful before a decision. Permitting it from `approved` let a
  // caller silently reopen a decided draft, regress its state and approve it again.
  if (ASSIGNABLE_FROM.indexOf(record.state) === -1) return refuse("invalid_state");
  if (!reviewerKey) return refuse("not_admin");
  // A creator may not be assigned as their own reviewer.
  if (reviewerKey === record.createdByKey) return refuse("separation_of_duties");
  // NOR MAY THE CALLER NOMINATE THEMSELVES. Without this, separation of duties collapses to
  // "not the original author": any other staff member could assign themselves as reviewer
  // of someone else's draft and approve it alone, which is one person completing a
  // two-person control.
  const actorKey = identityKey(caller.uid);
  if (!actorKey) return refuse("unauthenticated");
  if (reviewerKey === actorKey) return refuse("separation_of_duties");
  return allow("reviewer_assigned", record.version + 1);
}

/**
 * Sendability. Deliberately conservative and deliberately unreachable: even a fully
 * approved, unexpired, unheld draft in an approved jurisdiction is NOT sendable, because
 * transmission is disabled for this lane. Both halves are reported so the Admin surface
 * can show WHY, rather than showing a bare "no".
 */
export function sendability(args: {
  record: PersistedDraft | null;
  jurisdictionApproved: boolean;
  legalHold: boolean | null;
  now: string;
}): { sendable: boolean; reason: string } {
  const { record, jurisdictionApproved, legalHold, now } = args;
  if (!record) return { sendable: false, reason: "draft_not_found" };
  if (legalHold === null) return { sendable: false, reason: "legal_hold_unknown" };
  if (legalHold) return { sendable: false, reason: "legal_hold_active" };
  // Same rule as decideTransition: an unparseable expiry counts as passed. Two places that
  // disagree about whether a draft is expired is a bug waiting to be exploited.
  if (record.expiresAt && (!isValidExpiry(record.expiresAt) || now > record.expiresAt)) {
    return { sendable: false, reason: "draft_expired" };
  }
  if (TERMINAL_STATES.indexOf(record.state) !== -1) return { sendable: false, reason: "draft_terminal" };
  if (record.state !== "approved") return { sendable: false, reason: "invalid_state" };
  if (!jurisdictionApproved) return { sendable: false, reason: "jurisdiction_not_approved" };
  return { sendable: false, reason: "transmission_not_permitted" };
}
