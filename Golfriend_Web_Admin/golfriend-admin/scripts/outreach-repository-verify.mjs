// B5-R20 — authoritative outreach persistence: repository, optimistic concurrency, replay,
// separation of duties from persisted identity, immutable receipts and fail-closed ports.
// No callable, no UI, no store binding, no transmitter.
import assert from 'node:assert/strict';

import {
  commandFingerprint,
  createOutreachRepository,
  DELETION_PORT,
  LEGAL_HOLD_PORT,
  NEVER_PERSISTED,
  PERSISTED_FIELDS,
  persistedShapeIsMinimal,
  PRODUCTION_STORE_PORT,
  REPOSITORY_SCHEMA,
  RETENTION_PORT,
} from '../src/components/admin/v2/outreachRepository.mjs';
import { CANONICAL_FIELDS, outreachContentDigest } from '../src/components/admin/v2/outreachDigest.mjs';

const bound = { draftType: 'course_introduction', locale: 'en', templateVersion: 't1', jurisdiction: 'TH', jurisdictionApprovalVersion: 'j1', prospectRef: 'p1', contactRef: 'c1', recipientRole: null, recipientRef: null, contactPreferenceVersion: 'cp1', consentVersion: 'cv1', doNotContactVersion: 'dnc1', purpose: 'introduce Golfriend', evidenceVersion: null, subject: 'Subject', body: 'Body' };
const at = '2026-08-15T09:00:00.000Z';
const fresh = () => {
  const repo = createOutreachRepository();
  repo.createDraft({ draftId: 'd1', bound, createdByRef: 'author-1', at, commandId: 'create-1' });
  return repo;
};

// === contract ============================================================
assert.equal(REPOSITORY_SCHEMA, 'golfriend.admin.outreach-repository.v1');
for (const field of ['draftId', 'prospectRef', 'contactRef', 'createdByRef', 'assignedReviewerRef', 'state', 'version', 'contentDigest', 'templateVersion', 'locale', 'jurisdiction', 'jurisdictionApprovalVersion', 'evidenceVersion', 'consentVersion', 'doNotContactVersion', 'contactPreferenceVersion', 'createdAt', 'updatedAt', 'expiresAt']) assert.ok(PERSISTED_FIELDS.includes(field), `must persist ${field}`);

// === creation ============================================================
const repo = createOutreachRepository();
const created = repo.createDraft({ draftId: 'd1', bound, createdByRef: 'author-1', at, expiresAt: '2026-08-15T10:00:00.000Z', commandId: 'create-1' });
assert.equal(created.ok, true);
assert.equal(created.record.version, 1);
assert.equal(created.record.state, 'draft_created');
assert.equal(created.record.contentDigest, outreachContentDigest(bound).digest, 'the persisted digest is the canonical SHA-256');
assert.match(created.record.contentDigest, /^sha-256:[0-9a-f]{64}$/);
assert.equal(repo.createDraft({ draftId: 'd1', bound, createdByRef: 'author-2', at, commandId: 'create-2' }).error, 'duplicate_draft');
assert.equal(repo.createDraft({ draftId: 'd2', bound, createdByRef: '', at, commandId: 'c' }).error, 'payload_rejected', 'an authoritative creator is required');
// Content that cannot be canonicalized is never persisted.
assert.equal(repo.createDraft({ draftId: 'd3', bound: { ...bound, evil: 'x' }, createdByRef: 'a', at, commandId: 'c3' }).error, 'payload_rejected');
assert.equal(repo.get('d3'), null, 'a rejected create must persist nothing');

// === optimistic concurrency =============================================
assert.equal(repo.assignReviewer({ draftId: 'd1', expectedVersion: 99, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'a-stale' }).error, 'stale_write');
assert.equal(repo.assignReviewer({ draftId: 'd1', reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'a-nov' }).error, 'version_required', 'an exact expected version is mandatory');
assert.equal(repo.assignReviewer({ draftId: 'nope', expectedVersion: 1, reviewerRef: 'r', actorRef: 'a', at, commandId: 'a-nf' }).error, 'not_found');
const assigned = repo.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'assign-1' });
assert.equal(assigned.record.version, 2, 'a successful write increments the version');
assert.equal(assigned.record.assignedReviewerRef, 'rev-1');
// The now-stale version is rejected: no last-write-wins path exists.
assert.equal(repo.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-2', actorRef: 'x', at, commandId: 'assign-2' }).error, 'stale_write');
assert.equal(repo.get('d1').assignedReviewerRef, 'rev-1', 'a rejected write leaves state untouched');

// === separation of duties from PERSISTED identity =======================
const sod = fresh();
// The creator is read from the record, so a caller claiming to be someone else changes nothing.
assert.equal(sod.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'author-1', actorRef: 'author-1', at, commandId: 's1' }).error, 'separation_of_duties');
sod.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 's2' });
assert.equal(sod.transition({ draftId: 'd1', expectedVersion: 2, action: 'approve', toState: 'approved', actorRef: 'author-1', at, commandId: 's3' }).error, 'separation_of_duties', 'the persisted creator may never approve');
// Only the persisted assigned reviewer may act when that is required.
assert.equal(sod.transition({ draftId: 'd1', expectedVersion: 2, action: 'approve', toState: 'approved', actorRef: 'someone-else', at, commandId: 's4', requireAssignedReviewer: true }).error, 'separation_of_duties');
const unassigned = createOutreachRepository();
unassigned.createDraft({ draftId: 'd9', bound, createdByRef: 'author-1', at, commandId: 'u1' });
assert.equal(unassigned.transition({ draftId: 'd9', expectedVersion: 1, action: 'approve', toState: 'approved', actorRef: 'rev-1', at, commandId: 'u2', requireAssignedReviewer: true }).error, 'reviewer_not_assigned');

// === digest revalidation on transition ==================================
const digestRepo = fresh();
digestRepo.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'd-a' });
// Changed content is refused, never silently re-based onto the new content.
for (const changed of [{ ...bound, body: 'EDITED' }, { ...bound, locale: 'th' }, { ...bound, consentVersion: 'cv2' }, { ...bound, doNotContactVersion: 'dnc2' }, { ...bound, contactPreferenceVersion: 'cp2' }, { ...bound, jurisdictionApprovalVersion: 'j2' }, { ...bound, evidenceVersion: 'e2' }, { ...bound, templateVersion: 't2' }]) {
  const result = digestRepo.transition({ draftId: 'd1', expectedVersion: 2, action: 'approve', toState: 'approved', actorRef: 'rev-1', at, currentBound: changed, commandId: `dg-${Math.random()}` });
  assert.equal(result.ok, false, `a change to ${Object.keys(changed).length} fields must be refused`);
  assert.equal(result.error, 'payload_rejected');
}
assert.equal(digestRepo.get('d1').version, 2, 'refused transitions do not advance the version');
const approved = digestRepo.transition({ draftId: 'd1', expectedVersion: 2, action: 'approve', toState: 'approved', actorRef: 'rev-1', at, currentBound: bound, commandId: 'dg-ok', requireAssignedReviewer: true });
assert.equal(approved.ok, true);
assert.equal(approved.record.state, 'approved');
assert.equal(approved.record.version, 3);
// Non-canonicalizable content is refused too.
assert.equal(digestRepo.transition({ draftId: 'd1', expectedVersion: 3, action: 'revoke', toState: 'revoked', actorRef: 'rev-1', at, currentBound: { ...bound, evil: 'x' }, commandId: 'dg-bad' }).error, 'payload_rejected');

// === replay safety =======================================================
const replay = fresh();
const first = replay.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'replay-key' });
const again = replay.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'replay-key' });
assert.equal(again.ok, true, 'an exact replay succeeds');
assert.equal(again.record.version, first.record.version, 'a replay returns the ORIGINAL result, not a new version');
assert.equal(again.receipt.receiptId, first.receipt.receiptId);
assert.equal(replay.get('d1').version, 2, 'a replay creates no second transition');
assert.equal(replay.history('d1').length, 2, 'one create + one assign: a replay adds no receipt');
// The same command id with a CHANGED payload fails closed.
assert.equal(replay.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-2', actorRef: 'author-1', at, commandId: 'replay-key' }).error, 'replay_payload_mismatch');
assert.equal(replay.get('d1').assignedReviewerRef, 'rev-1', 'a mismatched replay changes nothing');
// Concurrent duplicates: the same command issued repeatedly yields one transition, one receipt.
const burst = fresh();
const results = Array.from({ length: 5 }, () => burst.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'burst-1' }));
assert.ok(results.every((r) => r.ok && r.record.version === 2), 'every duplicate returns the same result');
assert.equal(new Set(results.map((r) => r.receipt.receiptId)).size, 1, 'one receipt for one command');
assert.equal(burst.history('d1').length, 2);
// A command id is optional; without one, a second identical call is a genuine second command.
const noId = fresh();
noId.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'a', at });
assert.equal(noId.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'a', at }).error, 'stale_write', 'without a command id, concurrency still protects');
// The fingerprint distinguishes payloads.
assert.notEqual(commandFingerprint({ a: 1 }), commandFingerprint({ a: 2 }));
assert.equal(commandFingerprint({ a: 1 }), commandFingerprint({ a: 1 }));

// === immutable history ===================================================
const hist = fresh();
hist.assignReviewer({ draftId: 'd1', expectedVersion: 1, reviewerRef: 'rev-1', actorRef: 'author-1', at, commandId: 'h1' });
hist.transition({ draftId: 'd1', expectedVersion: 2, action: 'approve', toState: 'approved', actorRef: 'rev-1', at, currentBound: bound, commandId: 'h2', requireAssignedReviewer: true });
const history = hist.history('d1');
assert.equal(history.length, 3);
assert.deepEqual(history.map((r) => r.action), ['create', 'assign_reviewer', 'approve']);
// Each receipt records the PREVIOUS state and version alongside the new one.
assert.equal(history[1].fromState, 'draft_created');
assert.equal(history[1].fromVersion, 1);
assert.equal(history[1].toVersion, 2);
assert.equal(history[2].fromState, 'reviewer_assigned');
assert.ok(history.every((r) => Object.isFrozen(r)));
assert.ok(history.every((r) => r.deliveryClaimed === false));
// A caller cannot mutate stored state through a returned copy.
assert.throws(() => { 'use strict'; hist.get('d1').state = 'tampered'; });
assert.throws(() => { 'use strict'; hist.history('d1')[0].toState = 'tampered'; });
assert.equal(hist.get('d1').state, 'approved');
assert.equal(hist.history('d1')[0].toState, 'draft_created');

// === privacy =============================================================
for (const field of ['subject', 'body', 'recipientRole', 'address', 'contactEmail', 'contactPhone', 'purpose']) assert.ok(NEVER_PERSISTED.includes(field), `${field} must be barred from persistence`);
assert.deepEqual(persistedShapeIsMinimal(hist.get('d1')), { minimal: true, offendingFields: [] });
assert.deepEqual(persistedShapeIsMinimal(hist.history('d1')), { minimal: true, offendingFields: [] });
// The rendered body, subject and purpose never reach the store, even though they were supplied.
const stored = JSON.stringify(hist.get('d1')) + JSON.stringify(hist.history('d1'));
assert.doesNotMatch(stored, /Subject|Body|introduce Golfriend/, 'no rendered content or purpose is persisted');
// The minimality check can actually fail.
assert.equal(persistedShapeIsMinimal({ receipt: { body: 'leak' } }).minimal, false);

// === fail-closed ports ===================================================
assert.equal(PRODUCTION_STORE_PORT.mounted, false);
assert.equal(PRODUCTION_STORE_PORT.adapter, null);
assert.equal(RETENTION_PORT.mounted, false);
assert.equal(RETENTION_PORT.retentionDurationDays, null, 'no retention duration may be invented');
assert.equal(RETENTION_PORT.retentionPolicyVersion, null);
assert.equal(RETENTION_PORT.evaluate().ok, false);
assert.equal(RETENTION_PORT.evaluate().error, 'retention_policy_unavailable');
assert.equal(DELETION_PORT.requestDeletion().ok, false);
assert.equal(DELETION_PORT.requestDeletion().deleted, false, 'no deletion is performed or claimed');
assert.equal(LEGAL_HOLD_PORT.isHeld().ok, false);
assert.equal(LEGAL_HOLD_PORT.isHeld().held, null, 'unknown hold state is never treated as "not held"');
for (const port of [PRODUCTION_STORE_PORT, RETENTION_PORT, DELETION_PORT, LEGAL_HOLD_PORT]) assert.ok(Object.isFrozen(port));

// The canonical field set is shared, not duplicated, so the two cannot drift.
assert.ok(CANONICAL_FIELDS.includes('consentVersion') && CANONICAL_FIELDS.includes('doNotContactVersion'));

console.log('Outreach repository verification PASS: canonical SHA-256 persisted, exact-version optimistic concurrency with stale-write and changed-payload rejection, separation of duties from the persisted creator and assigned reviewer, replay returning the original result with one transition and one receipt per command id and a fail-closed payload mismatch, immutable frozen history recording previous state and version, no rendered content/contact/purpose persisted, and unmounted store plus fail-closed retention, deletion and legal-hold ports.');
