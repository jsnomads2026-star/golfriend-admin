// ==========================================
// FILE: functions/src/outreachAuthority.test.ts   (run: node lib/outreachAuthority.test.js)
// ADVERSARIAL suite for the outreach authority core.
//
// Every case here is written to ATTACK a control, not to reproduce the implementation.
// Each block states the attack it performs; if the corresponding guard were deleted the
// assertion must fail. Several of these are regressions for defects an independent review
// found in the client-side twin of this logic — the same attacks are re-run here so the
// server boundary cannot repeat them.
// ==========================================
import assert from "node:assert/strict";
import {
  APP_CHECK_ENFORCED, ASSIGNABLE_FROM, OUTREACH_ERROR_CODES, PERSISTED_STATES,
  TRANSITION_EDGES, TRANSMISSION_ENABLED, isValidExpiry,
  appCheckDecision, authorizeCaller, decideAssignment, decideTransition, identityKey,
  isOpaqueId, jurisdictionDecision, legalHoldDecision, legalHoldState, presentsSurrogate,
  retentionDecision, sendability,
  type CallerContext, type PersistedDraft,
} from "./outreachAuthority.js";
import { canonicalizeOutreachContent, commandFingerprint, digestsEqual, outreachContentDigest } from "./outreachCanonical.js";

const CONTENT: Record<string, string | null> = {
  draftType: "introduction", locale: "th", templateVersion: "2026-08-15.v1",
  jurisdiction: "TH", jurisdictionApprovalVersion: null,
  prospectRef: "prospect-a1", contactRef: "contact-b2",
  recipientRole: null, recipientRef: null, contactPreferenceVersion: "cp-1",
  consentVersion: "cv-1", doNotContactVersion: "dnc-1", purpose: "course_partnership",
  evidenceVersion: null, subject: "Golfriend", body: "Preview only.",
};
const DIGEST = outreachContentDigest(CONTENT).digest as string;

const staff = (uid: string): CallerContext =>
  ({ uid, adminDoc: { role: "Support", status: "Active" }, appCheckVerified: true });
const director = (uid: string): CallerContext =>
  ({ uid, adminDoc: { role: "Director", status: "Active" }, appCheckVerified: true });

const draft = (over: Partial<PersistedDraft> = {}): PersistedDraft => ({
  draftId: "d1", state: "previewed", version: 2,
  content: CONTENT, contentDigest: DIGEST, digestAlgorithm: "sha-256",
  createdByKey: "author-uid", assignedReviewerKey: "reviewer-uid",
  jurisdiction: "TH", expiresAt: null, ...over,
});

const NOW = "2026-08-15T09:00:00.000Z";
const move = (caller: CallerContext, over: Partial<PersistedDraft> = {}, patch: Record<string, unknown> = {}) =>
  decideTransition({
    caller, record: draft(over), expectedVersion: 2, requestedState: "approved",
    currentContent: ('content' in over ? over.content : CONTENT),
    now: NOW, legalHold: false, ...patch,
  } as Parameters<typeof decideTransition>[0]);

let checks = 0;
const check = (label: string, fn: () => void) => { fn(); checks += 1; void label; };

// --- 1. FORGED ROLE ---------------------------------------------------------------
// A caller sends their own role/claims in the payload. The core reads the admin_users
// document only, so a fabricated role cannot promote anyone.
check("forged role", () => {
  const forged = {
    uid: "attacker", appCheckVerified: true,
    adminDoc: null,
    // These are the shapes an attacker would put in request.data hoping something reads them.
    role: "Director", isAdmin: true, claims: { admin: true }, status: "Active",
  } as unknown as CallerContext;
  assert.equal(authorizeCaller(forged)?.code, "not_admin");
  assert.equal(authorizeCaller(forged, true)?.code, "not_admin");
  // A suspended or role-less document fails closed even when it exists.
  assert.equal(authorizeCaller({ uid: "u", adminDoc: { role: "Support", status: "Suspended" }, appCheckVerified: true })?.code, "not_admin");
  assert.equal(authorizeCaller({ uid: "u", adminDoc: { status: "Active" }, appCheckVerified: true })?.code, "not_admin");
  // Staff is not Director: revocation requires the higher tier.
  assert.equal(authorizeCaller(staff("u"), true)?.code, "insufficient_role");
  assert.equal(authorizeCaller(director("u"), true), null);
  assert.equal(authorizeCaller({ uid: null, adminDoc: { role: "Support", status: "Active" }, appCheckVerified: true })?.code, "unauthenticated");
});

// --- 2. SEPARATION OF DUTIES KEYED ON TARGET STATE, NOT THE VERB --------------------
// The client-side twin keyed this on a caller-supplied `action`, so renaming the verb to
// "ratify" let a creator approve their own draft. There is no verb here at all: the only
// thing that can request an approval is the target state, and it is allowlisted.
check("self-approval", () => {
  assert.equal(move(staff("author-uid")).code, "separation_of_duties");
  // Case and whitespace variants of the creator are the same person.
  for (const variant of ["AUTHOR-UID", "Author-Uid", " author-uid ", "author-uid\t"]) {
    assert.equal(move(staff(variant)).code, "separation_of_duties", variant);
  }
  // A stranger who is not the assigned reviewer cannot approve either.
  assert.equal(move(staff("stranger-uid")).code, "separation_of_duties");
  // With no reviewer assigned, approval is refused rather than defaulting to "anyone".
  assert.equal(move(staff("reviewer-uid"), { assignedReviewerKey: null }).code, "reviewer_not_assigned");
  // The assigned reviewer succeeds — proving the refusals above are the guard, not a
  // blanket denial that would pass this suite while blocking real work.
  const good = move(staff("reviewer-uid"));
  assert.equal(good.ok, true);
  assert.equal(good.toState, "approved");
  assert.equal(good.toVersion, 3);
});

// --- 3. UNICODE IDENTITY VARIANTS --------------------------------------------------
// NFD and NFC spellings of the same name must fold to one key, or a single person becomes
// two and separation of duties evaporates.
check("unicode identity", () => {
  const nfc = "jos\u00e9-uid";
  const nfd = "jose\u0301-uid";
  assert.notEqual(nfc, nfd, "the two spellings must genuinely differ as strings");
  assert.equal(identityKey(nfc), identityKey(nfd));
  assert.equal(move(staff(nfd), { createdByKey: identityKey(nfc) }).code, "separation_of_duties");
  assert.equal(identityKey(""), null);
  assert.equal(identityKey("   "), null);
  assert.equal(identityKey(42), null);
  assert.equal(identityKey(null), null);
});

// --- 4. FORGED REVIEWER REFERENCE --------------------------------------------------
// get()/list() publish surrogate references. Echoing one back must never authenticate.
check("forged reviewer reference", () => {
  for (const surrogate of ["actor-9f2a", "prospect-11", "contact-ab", "rcpt-3", "ref-0"]) {
    assert.equal(presentsSurrogate(surrogate), true, surrogate);
    // A RESOLVABLE reviewer is supplied, so a refusal cannot come from the null-key check.
    // The previous version of this block passed `reviewerKey: null`, so all five iterations
    // asserted the same trivial fact and no surrogate guard was exercised at all.
    assert.equal(decideAssignment({
      caller: { uid: surrogate, adminDoc: { role: "Support", status: "Active" }, appCheckVerified: true },
      record: draft(), expectedVersion: 2, reviewerKey: "other-uid", legalHold: false,
    }).code, "payload_rejected", surrogate);
    // Same for a transition: a surrogate presented as the actor is refused.
    assert.equal(move({ uid: surrogate, adminDoc: { role: "Support", status: "Active" }, appCheckVerified: true }, { assignedReviewerKey: identityKey(surrogate) }).code, "payload_rejected", surrogate);
  }
  assert.equal(presentsSurrogate("actor_9f2a"), false);
  assert.equal(presentsSurrogate("real-person@example.com"), false);
  // An unresolvable reviewer (no active admin_users document → null key) is refused.
  assert.equal(decideAssignment({ caller: staff("a"), record: draft(), expectedVersion: 2, reviewerKey: null, legalHold: false }).code, "not_admin");
  // A creator cannot be assigned as their own reviewer.
  assert.equal(decideAssignment({ caller: staff("a"), record: draft(), expectedVersion: 2, reviewerKey: "author-uid", legalHold: false }).code, "separation_of_duties");
  assert.equal(decideAssignment({ caller: staff("a"), record: draft(), expectedVersion: 2, reviewerKey: "other-uid", legalHold: false }).ok, true);
  // SELF-NOMINATION. Without this, separation of duties collapses to "not the original
  // author": any other staff member could assign themselves to someone else's draft and
  // approve it alone, completing a two-person control by themselves.
  assert.equal(decideAssignment({ caller: staff("mallory"), record: draft(), expectedVersion: 2, reviewerKey: "mallory", legalHold: false }).code, "separation_of_duties");
  for (const variant of ["MALLORY", " mallory "]) {
    assert.equal(decideAssignment({ caller: staff(variant), record: draft(), expectedVersion: 2, reviewerKey: "mallory", legalHold: false }).code, "separation_of_duties", variant);
  }
  // Assignment is only meaningful before a decision: a decided draft cannot be reopened by
  // reassigning it, which would let a second decision be laundered through one record.
  for (const decided of ["approved", "rejected"]) {
    assert.equal(decideAssignment({ caller: staff("a"), record: draft({ state: decided }), expectedVersion: 2, reviewerKey: "other-uid", legalHold: false }).code, "invalid_state", decided);
  }
  for (const open of ASSIGNABLE_FROM) {
    assert.equal(decideAssignment({ caller: staff("a"), record: draft({ state: open }), expectedVersion: 2, reviewerKey: "other-uid", legalHold: false }).ok, true, open);
  }
});

// --- 5. STALE WRITE / MISSING VERSION ----------------------------------------------
check("optimistic concurrency", () => {
  for (const bad of [1, 3, 0, -1, 99]) {
    assert.equal(move(staff("reviewer-uid"), {}, { expectedVersion: bad }).code, "stale_write", String(bad));
  }
  // A missing or non-integer version is REFUSED, never defaulted — a default turns
  // compare-and-set into last-write-wins.
  for (const bad of [undefined, null, "2", 2.5, NaN, {}, []]) {
    assert.equal(move(staff("reviewer-uid"), {}, { expectedVersion: bad }).code, "version_required", String(bad));
  }
});

// --- 6. INVENTED STATE --------------------------------------------------------------
check("state allowlist", () => {
  for (const bad of ["super_approved", "APPROVED", "", null, undefined, 7, ["approved"]]) {
    assert.equal(move(staff("reviewer-uid"), {}, { requestedState: bad }).code, "invalid_state", String(bad));
  }
  assert.equal(PERSISTED_STATES.indexOf("approved") !== -1, true);
  assert.equal(PERSISTED_STATES.indexOf("super_approved"), -1);
  // Revocation is Director-only, and the role check runs BEFORE the state is examined.
  assert.equal(move(staff("reviewer-uid"), {}, { requestedState: "revoked" }).code, "insufficient_role");
  assert.equal(move(director("reviewer-uid"), {}, { requestedState: "revoked" }).ok, true);
});

// --- 6b. THE TRANSITION GRAPH IS A GRAPH, NOT A SET OF LABELS -----------------------
// A flat "is this a known state" allowlist is not a workflow: it makes every state
// reachable from every other, so a rejected draft could be approved and `previewed` was
// decorative.
check("transition graph", () => {
  assert.equal(move(staff("reviewer-uid"), { state: "rejected" }).code, "invalid_state", "a rejected draft must not become approved");
  assert.equal(move(staff("reviewer-uid"), { state: "draft_created" }).code, "invalid_state", "approval must not skip reviewer assignment");
  assert.equal(move(staff("reviewer-uid"), { state: "approved" }).code, "invalid_state", "a draft must not be approved twice");
  assert.equal(move(staff("reviewer-uid"), { state: "changes_requested" }).code, "invalid_state");
  // Every declared edge is genuinely permitted, so the refusals above are the graph and
  // not a function that refuses everything.
  assert.equal(move(staff("reviewer-uid"), { state: "previewed" }).ok, true);
  // Approval REQUIRES a preview. Leaving `reviewer_assigned -> approved` in the graph
  // made `previewed` a label nothing had to pass through — a human approval that nobody
  // was required to look at.
  assert.equal(move(staff("reviewer-uid"), { state: "reviewer_assigned" }).code, "invalid_state", "approval must not skip the preview");
  assert.equal(move(staff("reviewer-uid"), { state: "reviewer_assigned" }, { requestedState: "previewed" }).ok, true);
  // `reviewer_assigned` is reachable ONLY through assignReviewer, never through a plain
  // transition — otherwise a caller could set the state with no reviewer recorded, and
  // the record and its permanent receipt would both attest an assignment that never was.
  for (const from of PERSISTED_STATES) {
    assert.equal((TRANSITION_EDGES[from] ?? []).includes("reviewer_assigned"), false, from);
  }
  assert.equal(move(staff("reviewer-uid"), {}, { requestedState: "rejected" }).ok, true);
  assert.equal(move(staff("reviewer-uid"), {}, { requestedState: "changes_requested" }).ok, true);
  // Every state has an entry; a state with no edges is terminal by construction.
  for (const state of PERSISTED_STATES) assert.ok(Array.isArray(TRANSITION_EDGES[state]), state);
  assert.deepEqual(TRANSITION_EDGES.revoked, []);
  assert.deepEqual(TRANSITION_EDGES.expired, []);
});

// --- 6c. `expired` IS NOT A BACK-DOOR REVOCATION ------------------------------------
// `expired` is terminal, so if any staff member could set it at will it would be a
// revocation without the Director gate that revocation carefully requires.
check("expired is not a backdoor revoke", () => {
  assert.equal(move(staff("reviewer-uid"), {}, { requestedState: "expired" }).code, "invalid_state", "expiry may not be declared before the deadline");
  assert.equal(move(director("reviewer-uid"), {}, { requestedState: "expired" }).code, "invalid_state", "not even a Director may expire a live draft");
  // Once the deadline has genuinely passed, recording it is permitted.
  assert.equal(move(staff("reviewer-uid"), { expiresAt: "2026-08-14T00:00:00.000Z" }, { requestedState: "expired" }).ok, true);
  // A malformed expiry never counts as passed — otherwise "never" would expire everything.
  assert.equal(isValidExpiry("never"), false);
  assert.equal(isValidExpiry("2026-08-15T16:00:00+07:00"), false);
  assert.equal(isValidExpiry("2026-02-31T00:00:00.000Z"), false);
  assert.equal(isValidExpiry("2026-13-01T00:00:00.000Z"), false);
  assert.equal(isValidExpiry(""), false);
  assert.equal(isValidExpiry(null), false);
  assert.equal(isValidExpiry("2026-08-14T00:00:00.000Z"), true);
  // An UNPARSEABLE stored expiry counts as PASSED, not as absent. The previous version of
  // this block asserted the opposite and so LOCKED IN a fail-open: "never" sorts after
  // every digit, so a raw comparison reports it as not yet reached — forever — and the
  // draft could neither expire nor be closed as expired.
  for (const malformed of ["never", "9999-99-99T00:00:00.000Z", "2026-08-14T00:00:00Z", "0"]) {
    assert.equal(move(staff("reviewer-uid"), { expiresAt: malformed }).code, "draft_expired", malformed);
    assert.equal(move(staff("reviewer-uid"), { expiresAt: malformed }, { requestedState: "expired" }).ok, true, malformed + " must still be closable");
  }
});

// --- 7. DIGEST BINDING IS MANDATORY -------------------------------------------------
// Omitting content must NOT skip the check. In the client-side twin the digest check was
// conditional on the caller supplying content, so omitting it bypassed the whole control.
check("digest binding", () => {
  // A record whose stored content is missing or unusable cannot be approved: the digest
  // has nothing to verify against, so the integrity claim would be vacuous.
  for (const omitted of [undefined, null, {}, "", 0]) {
    assert.equal(move(staff("reviewer-uid"), { content: omitted }).code, "content_rejected", String(omitted));
  }
  // Stored content that no longer matches the recorded digest means the record was
  // tampered with outside the command path. It is refused, not silently re-digested.
  assert.equal(move(staff("reviewer-uid"), { content: { ...CONTENT, body: "Different." } }).code, "digest_mismatch");
  // A caller-supplied digest claim is not consulted; only the recomputed one is.
  assert.equal(move(staff("reviewer-uid"), { content: { ...CONTENT, body: "Different." } }, { claimedDigest: DIGEST } as never).code, "digest_mismatch");
  assert.equal(move(staff("reviewer-uid"), { contentDigest: "sha-256:" + "0".repeat(64) }).code, "digest_mismatch");
  assert.equal(digestsEqual(DIGEST, DIGEST), true);
  assert.equal(digestsEqual(DIGEST, DIGEST.slice(0, -1) + "0"), false);
  assert.equal(digestsEqual(DIGEST, null), false);
});

// --- 8. EXPIRY IS ENFORCED, NOT MERELY STORED ---------------------------------------
check("expiry", () => {
  const expired = { expiresAt: "2026-08-14T00:00:00.000Z" };
  assert.equal(move(staff("reviewer-uid"), expired).code, "draft_expired");
  // Only the transition that RECORDS the expiry is permitted past the deadline.
  assert.equal(move(staff("reviewer-uid"), expired, { requestedState: "expired" }).ok, true);
  assert.equal(move(director("reviewer-uid"), expired, { requestedState: "expired" }).ok, true);
  // An expiry in the future does not block.
  assert.equal(move(staff("reviewer-uid"), { expiresAt: "2027-01-01T00:00:00.000Z" }).ok, true);
});

// --- 9. TERMINAL STATES ARE TERMINAL ------------------------------------------------
check("revocation is terminal", () => {
  for (const terminal of ["revoked", "expired"]) {
    assert.equal(move(staff("reviewer-uid"), { state: terminal }).code, "draft_terminal", terminal);
    assert.equal(move(director("reviewer-uid"), { state: terminal }, { requestedState: "revoked" }).code, "draft_terminal", terminal);
    assert.deepEqual(TRANSITION_EDGES[terminal], [], terminal);
  }
});

// --- 10. LEGAL HOLD: UNKNOWN IS NOT "NOT HELD" --------------------------------------
check("legal hold", () => {
  assert.equal(move(staff("reviewer-uid"), {}, { legalHold: null }).code, "legal_hold_unknown");
  assert.equal(move(staff("reviewer-uid"), {}, { legalHold: true }).code, "legal_hold_active");
  // A FAILED read is UNKNOWN, never false.
  assert.equal(legalHoldState(null, false), null);
  assert.equal(legalHoldState({ active: true }, false), null);
  assert.equal(legalHoldState(null, true), false);
  assert.equal(legalHoldState({ active: true }, true), true);
  assert.equal(legalHoldState({ active: false }, true), false);
  // Anything that is not strictly true/false is UNKNOWN — "pending", 1, "false" included.
  for (const ambiguous of ["true", "false", 1, 0, "pending", null, undefined, {}]) {
    assert.equal(legalHoldState({ active: ambiguous } as never, true), null, String(ambiguous));
  }
  assert.equal(legalHoldDecision(null)?.code, "legal_hold_unknown");
  assert.equal(legalHoldDecision(true)?.code, "legal_hold_active");
  assert.equal(legalHoldDecision(false), null);
  // Hold outranks a valid approval: a held draft cannot be approved by anyone.
  assert.equal(decideAssignment({ caller: staff("a"), record: draft(), expectedVersion: 2, reviewerKey: "other", legalHold: null }).code, "legal_hold_unknown");
});

// --- 11. JURISDICTION APPROVAL IS NEVER DEFAULTED -----------------------------------
// No approved jurisdiction record exists in this repository, so EVERY jurisdiction must
// currently refuse. A truthy-but-not-true value must not read as approval.
check("jurisdiction", () => {
  assert.equal(jurisdictionDecision("TH", null).approved, false);
  assert.equal(jurisdictionDecision("TH", {}).approved, false);
  assert.equal(jurisdictionDecision("TH", { legallyApproved: true }).approved, false, "approval without a version is not approval");
  for (const truthy of ["true", 1, "approved", "pending", {}]) {
    assert.equal(jurisdictionDecision("TH", { legallyApproved: truthy, version: "v1" }).approved, false, String(truthy));
  }
  assert.equal(jurisdictionDecision("", { legallyApproved: true, version: "v1" }).approved, false);
  assert.equal(jurisdictionDecision(null, { legallyApproved: true, version: "v1" }).approved, false);
  assert.equal(jurisdictionDecision("TH", { legallyApproved: true, version: "  " }).approved, false);
  // The positive path exists and is reachable ONLY with a real approved record — so the
  // refusals above are the gate, not a function that always says no.
  const approved = jurisdictionDecision("TH", { legallyApproved: true, version: "th-2026-08-15" });
  assert.equal(approved.approved, true);
  assert.equal(approved.version, "th-2026-08-15");
});

// --- 12. SENDABILITY IS UNREACHABLE WHILE TRANSMISSION IS DISABLED -------------------
check("sendability", () => {
  assert.equal(TRANSMISSION_ENABLED, false);
  const best = sendability({ record: draft({ state: "approved" }), jurisdictionApproved: true, legalHold: false, now: NOW });
  assert.equal(best.sendable, false, "even a fully approved draft is not sendable in this lane");
  assert.equal(best.reason, "transmission_not_permitted");
  assert.equal(sendability({ record: draft({ state: "approved" }), jurisdictionApproved: false, legalHold: false, now: NOW }).reason, "jurisdiction_not_approved");
  assert.equal(sendability({ record: draft({ state: "approved" }), jurisdictionApproved: true, legalHold: null, now: NOW }).reason, "legal_hold_unknown");
  assert.equal(sendability({ record: draft({ state: "approved" }), jurisdictionApproved: true, legalHold: true, now: NOW }).reason, "legal_hold_active");
  assert.equal(sendability({ record: draft({ state: "draft_created" }), jurisdictionApproved: true, legalHold: false, now: NOW }).reason, "invalid_state");
  assert.equal(sendability({ record: draft({ state: "approved", expiresAt: "2020-01-01T00:00:00.000Z" }), jurisdictionApproved: true, legalHold: false, now: NOW }).reason, "draft_expired");
  assert.equal(sendability({ record: null, jurisdictionApproved: true, legalHold: false, now: NOW }).reason, "draft_not_found");
});

// --- 13. RETENTION STAYS PORT-DRIVEN -------------------------------------------------
check("retention", () => {
  for (const bad of [null, {}, { approved: true }, { approved: "true", version: "v1" }, { approved: true, version: "" }]) {
    assert.equal(retentionDecision(bad as never)?.code, "retention_policy_unavailable", JSON.stringify(bad));
  }
  assert.equal(retentionDecision({ approved: true, version: "r-1" }), null);
});

// --- 14. APP CHECK: BOTH BRANCHES ARE PROVEN ----------------------------------------
// Enforcement is off because no attestation provider is provisioned in this repository.
// The enforced branch is still exercised so switching the constant is a proven change.
check("app check", () => {
  assert.equal(APP_CHECK_ENFORCED, false, "flipping this on without provisioning App Check would reject every real request");
  // Not enforced: an unattested request passes.
  assert.equal(appCheckDecision({ uid: "u", adminDoc: null, appCheckVerified: false }, false), null);
  // ENFORCED: the real function's real branch, reached by injecting the flag. An earlier
  // version of this block asserted on a stub defined in this file, which proved only that
  // the test could return a string — rewriting the guard to `return null` broke nothing.
  assert.equal(appCheckDecision({ uid: "u", adminDoc: null, appCheckVerified: false }, true)?.code, "app_check_required");
  assert.equal(appCheckDecision({ uid: "u", adminDoc: null, appCheckVerified: true }, true), null);
  // Anything other than a verified boolean true is unattested.
  for (const bogus of ["true", 1, {}, null, undefined]) {
    assert.equal(appCheckDecision({ uid: "u", adminDoc: null, appCheckVerified: bogus as never }, true)?.code, "app_check_required", String(bogus));
  }
  // And it gates BEFORE authorization, so an unattested admin is still refused.
  assert.equal(appCheckDecision({ uid: "u", adminDoc: { role: "Director", status: "Active" }, appCheckVerified: false }, true)?.code, "app_check_required");
});

// --- 15. RE-ENTRANCY / GETTER ATTACK ------------------------------------------------
// A getter on caller content must not be able to observe or influence the decision, and
// must not yield one value to the digest and another to a later read.
check("re-entrancy", () => {
  let reads = 0;
  const hostile: Record<string, unknown> = { ...CONTENT };
  Object.defineProperty(hostile, "body", {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? CONTENT.body : "swapped after the digest"; },
  });
  const outcome = move(staff("reviewer-uid"), { content: hostile });
  // Either the digest saw the swapped value and refused, or it saw the honest value and
  // allowed — but the decision must be consistent with exactly one reading of the content.
  if (outcome.ok) assert.equal(reads <= 1, true, "the content must not be re-read after the digest decision");
  else assert.equal(outcome.code, "digest_mismatch");
});

// --- 16. CHANGED-PAYLOAD REPLAY FINGERPRINT -----------------------------------------
check("fingerprint", () => {
  assert.notEqual(commandFingerprint({ a: 1 }), commandFingerprint({ a: 1, b: undefined }), "undefined must not be erased");
  assert.equal(commandFingerprint({ a: 1, b: 2 }), commandFingerprint({ b: 2, a: 1 }), "key order must not matter");
  assert.equal(commandFingerprint({ f: () => undefined }), null);
  assert.equal(commandFingerprint({ n: NaN }), null);
  assert.notEqual(commandFingerprint({ op: "transition", state: "approved" }), commandFingerprint({ op: "transition", state: "rejected" }));
});

// --- 17. CANONICAL FORM REFUSALS ----------------------------------------------------
check("canonicalization", () => {
  assert.equal(canonicalizeOutreachContent({ ...CONTENT, extra: "x" }).error, "unknown_field");
  const missing: Record<string, unknown> = { ...CONTENT };
  delete missing.body;
  assert.equal(canonicalizeOutreachContent(missing).error, "missing_field");
  assert.equal(canonicalizeOutreachContent({ ...CONTENT, subject: "a\u202Eb" }).error, "control_character");
  assert.equal(canonicalizeOutreachContent({ ...CONTENT, subject: "cafe\u0301" }).error, "non_normalized_text");
  assert.equal(canonicalizeOutreachContent({ ...CONTENT, draftType: null }).error, "unsupported_value");
  assert.equal(canonicalizeOutreachContent({ ...CONTENT, subject: "x".repeat(8193) }).error, "value_too_long");
  assert.equal(canonicalizeOutreachContent(null).error, "unsupported_value");
  assert.equal(canonicalizeOutreachContent([]).error, "unsupported_value");
  // The length prefix makes the encoding injective: a value containing the delimiter
  // cannot forge a neighbouring field.
  const a = outreachContentDigest({ ...CONTENT, subject: "x", body: "y" }).digest;
  const b = outreachContentDigest({ ...CONTENT, subject: "x\nbody:1:y", body: "" }).digest;
  assert.notEqual(a, b);
});

// --- 18. ERROR CODES ARE STABLE AND CARRY NO RECORD DATA ----------------------------
check("error codes", () => {
  const emitted = [
    move(staff("author-uid")).code, move(staff("reviewer-uid"), {}, { expectedVersion: 9 }).code,
    move(staff("reviewer-uid"), {}, { legalHold: null }).code,
    move(staff("reviewer-uid"), { content: null }).code,
    move(staff("reviewer-uid"), { state: "revoked" }).code, move(staff("author-uid"), { state: "approved" }).code,
  ];
  for (const code of emitted) {
    assert.equal(typeof code, "string");
    assert.equal(OUTREACH_ERROR_CODES.indexOf(code as string) !== -1, true, `${code} is not a declared code`);
    // A code is an enum key: no spaces, no punctuation, nothing that could carry a value.
    assert.match(code as string, /^[a-z_]+$/);
  }
  assert.equal(isOpaqueId("draft for john@x.com"), false);
  assert.equal(isOpaqueId("d1"), true);
  assert.equal(isOpaqueId("x".repeat(65)), false);
  assert.equal(isOpaqueId(""), false);
});

console.log(`✅ outreach authority: ${checks} adversarial blocks passed (forged roles, forged reviewer refs, unicode identity, stale writes, invented states, mandatory digest, expiry, terminal states, unknown legal hold, unapproved jurisdiction, unreachable sendability, port-driven retention, App Check branches, re-entrancy, replay fingerprint, canonical refusals, stable codes).`);
