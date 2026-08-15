// B5-R18 — Enterprise outreach draft and human-approval domain.
// Pure logic tests: workflow, authorization, separation of duties, consent, DNC, jurisdiction,
// digest, replay, revocation, locale and privacy. No send, no provider, no transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildOutreachDraft,
  CONSENT_STATES,
  CONTACT_PREFERENCES,
  contentDigest,
  DIGEST_ALGORITHM,
  DRAFT_REFUSALS,
  DRAFT_SCHEMA,
  DRAFT_TYPES,
  draftIsPrivacySafe,
  boundFromDraft,
  deriveClaims,
  draftPreviewStructure,
  EVIDENCE_BEARING_TYPES,
  PROHIBITED_CLAIMS,
  resolveDraftLocale,
  SUPPORTED_JURISDICTIONS,
  TEMPLATE_VERSION,
} from '../src/components/admin/v2/outreachDraftDomain.mjs';
import { DRAFT_COPY, SHARED_COPY_KEYS } from '../src/components/admin/v2/outreachDraftCopy.mjs';
import {
  applyWorkflowAction,
  APPROVAL_ACTIONS,
  APPROVAL_STATES,
  APPROVAL_TTL_MINUTES,
  AUTHOR_GRANT,
  INVALIDATION_TRIGGERS,
  revalidateApproval,
  REVIEWER_GRANT,
  SEND_ADAPTER_CONTRACT,
  sendReadiness,
  workflowReceipt,
} from '../src/components/admin/v2/outreachApprovalWorkflow.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const canonicalCodes = read('../src/i18n/locales.ts').match(/LOCALE_CODES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));

const base = {
  prospect: { prospectId: 'p1', courseName: 'Riverbend Golf Club', country: 'Thailand', jurisdiction: 'TH', status: 'contact_ready' },
  contact: { prospectId: 'p1', preference: 'email', recipientSelected: false },
  consent: { state: 'granted', authority: 'portal_consent_v1' },
  purpose: 'introduce Golfriend to the course',
  createdBy: 'author@admin.example',
  createdAt: '2026-08-15T09:00:00.000Z',
};
// Production ships NO approved jurisdiction blocks, so every build refuses. Rendering is
// exercised with an explicitly UNAPPROVED test block, and the approval flag is asserted false.
const TEST_BLOCKS = Object.fromEntries(["TH","JP","KR","CN","ES","FR","DE","GB","US"].map((j) => [j, { version: "unapproved-test-block.v0", legallyApproved: false, text: "[TEST BLOCK - not legally approved]" }]));
const build = (overrides = {}) => buildOutreachDraft({ draftType: "course_introduction", locale: "en", ...base, complianceBlocks: TEST_BLOCKS, ...overrides });

// === 1. Seven draft types, eight-locale parity ==========================
assert.equal(DRAFT_SCHEMA, 'golfriend.admin.outreach-draft.v1');
assert.deepEqual([...DRAFT_TYPES], ['course_introduction', 'free_trial_invitation', 'played_evidence_opportunity', 'partnership_follow_up', 'missing_information_request', 'renewal_continuation', 'decline_closure']);
assert.equal(DRAFT_TYPES.length, 7);
assert.deepEqual(Object.keys(DRAFT_COPY), canonicalCodes, 'draft copy must cover exactly the canonical locale set');
for (const locale of canonicalCodes) {
  for (const key of SHARED_COPY_KEYS) {
    assert.ok(typeof DRAFT_COPY[locale][key] === 'string' && DRAFT_COPY[locale][key].trim(), `${locale}.${key} missing`);
    if (locale !== 'en') assert.notEqual(DRAFT_COPY[locale][key], DRAFT_COPY.en[key], `${locale}.${key} duplicates English`);
  }
  for (const type of DRAFT_TYPES) {
    const entry = DRAFT_COPY[locale][type];
    assert.ok(entry && entry.subject.trim() && entry.body.trim(), `${locale}.${type} incomplete`);
    if (locale !== 'en') {
      assert.notEqual(entry.subject, DRAFT_COPY.en[type].subject, `${locale}.${type}.subject duplicates English`);
      assert.notEqual(entry.body, DRAFT_COPY.en[type].body, `${locale}.${type}.body duplicates English`);
    }
  }
}
// Every locale renders every type with no unresolved placeholder and the disclaimer intact.
for (const locale of canonicalCodes) {
  for (const draftType of DRAFT_TYPES) {
    const evidence = EVIDENCE_BEARING_TYPES.includes(draftType) ? { authoritative: true, stale: false, evidenceVersion: 'e1', period: '2026-07', summary: 'Recorded interest for the period.' } : undefined;
    const result = build({ locale, draftType, evidence, prospect: { ...base.prospect, priorRelationship: true } });
    assert.equal(result.ok, true, `${locale}/${draftType} refused: ${result.reason}`);
    assert.doesNotMatch(`${result.draft.subject}\n${result.draft.body}`, /\{[a-z]+\}/i, `${locale}/${draftType} left a placeholder`);
    assert.ok(result.draft.body.includes(DRAFT_COPY[locale].disclaimer), `${locale}/${draftType} dropped the disclaimer`);
    assert.equal(result.draft.templateVersion, TEMPLATE_VERSION);
  }
}
// Locale fallback is EXACT: an unsupported locale is refused, never silently served in English.
assert.deepEqual(resolveDraftLocale('th'), { ok: true, locale: 'th' });
assert.equal(resolveDraftLocale('ar').ok, false);
assert.equal(build({ locale: 'ar' }).reason, 'unsupported_locale');

// === 2. Fail-closed gates ================================================
const refusals = [
  ['do_not_contact', { contact: { ...base.contact, doNotContact: true } }],
  ['do_not_contact', { prospect: { ...base.prospect, status: 'do_not_contact' } }],
  ['consent_withdrawn', { consent: { state: 'withdrawn', authority: 'a' } }],
  ['missing_consent_authority', { consent: { state: 'granted', authority: '' } }],
  ['missing_consent_authority', { consent: { state: 'unknown', authority: 'a' } }],
  ['missing_consent_authority', { consent: { state: 'never_given', authority: 'a' } }],
  ['missing_consent_authority', { consent: null }],
  ['unsupported_jurisdiction', { prospect: { ...base.prospect, jurisdiction: 'XX' } }],
  ['unsupported_jurisdiction', { prospect: { ...base.prospect, jurisdiction: undefined } }],
  ['missing_contact_preference', { contact: { prospectId: 'p1' } }],
  ['missing_contact_preference', { contact: { prospectId: 'p1', preference: 'carrier_pigeon' } }],
  ['active_partner_status', { prospect: { ...base.prospect, status: 'active_partner' } }],
  ['prospect_deleted', { prospect: { ...base.prospect, deleted: true } }],
  ['conflicting_identity', { contact: { ...base.contact, prospectId: 'p2' } }],
  ['missing_purpose', { purpose: '' }],
  ['stale_evidence', { evidence: { authoritative: true, stale: true, evidenceVersion: 'e1' } }],
  ['unknown_draft_type', { draftType: 'send_invoice' }],
];
for (const [expected, overrides] of refusals) {
  const result = build(overrides);
  assert.equal(result.ok, false, `${expected} should refuse`);
  assert.equal(result.reason, expected);
  assert.equal(result.draft, null, 'a refusal must produce no draft');
  assert.ok(DRAFT_REFUSALS.includes(result.reason));
}
// An evidence-bearing draft requires CURRENT AUTHORITATIVE evidence.
assert.equal(build({ draftType: 'played_evidence_opportunity' }).reason, 'evidence_required_but_unavailable');
assert.equal(build({ draftType: 'played_evidence_opportunity', evidence: { authoritative: false, evidenceVersion: 'e1' } }).reason, 'evidence_required_but_unavailable');
assert.equal(build({ draftType: 'played_evidence_opportunity', evidence: { authoritative: true, stale: false, evidenceVersion: 'e1', period: '2026-07', summary: 'Recorded interest.' } }).ok, true);
assert.deepEqual([...CONSENT_STATES], ['granted', 'withdrawn', 'never_given', 'unknown']);
assert.deepEqual([...CONTACT_PREFERENCES], ['email', 'postal', 'in_person', 'portal_message']);
assert.ok(SUPPORTED_JURISDICTIONS.includes('TH'));

// === 3. Binding and claims ==============================================
const ok = build();
const draft = ok.draft;
for (const field of ['prospectId', 'country', 'jurisdiction', 'locale', 'contactPreference', 'consentState', 'consentAuthority', 'purpose', 'evidenceVersion', 'templateVersion', 'contentDigest']) assert.ok(Object.hasOwn(draft, field), `draft must bind ${field}`);
assert.equal(draft.doNotContact, false);
assert.equal(draft.deliveryAvailable, false);
assert.ok(Object.isFrozen(draft));
// No draft may assert a commercial or legal claim.
for (const claim of PROHIBITED_CLAIMS) assert.equal(draft.claims[claim], false, `${claim} must be false`);
assert.doesNotMatch(JSON.stringify(draft.claims), /true/);
// A clean identifier is preserved; one carrying personal data is surrogated, never emitted.
assert.equal(draft.prospectId, 'p1');
const hostileId = build({ prospect: { ...base.prospect, prospectId: 'somchai@leak.example' }, contact: { ...base.contact, prospectId: 'somchai@leak.example' } });
assert.match(hostileId.draft.prospectId, /^prospect-/);
assert.doesNotMatch(JSON.stringify(hostileId.draft), /somchai@leak\.example/);
// The author is an operator identity and is always surrogated when it carries personal data.
assert.doesNotMatch(JSON.stringify(draft), /author@admin\.example/);
assert.match(draft.createdBy, /^actor-/);

// === 4. Content digest ===================================================
assert.equal(draft.digestAlgorithm, DIGEST_ALGORITHM);
assert.equal(contentDigest({ a: 1, b: 2 }), contentDigest({ b: 2, a: 1 }), 'the digest must be key-order independent');
assert.notEqual(contentDigest({ a: 1 }), contentDigest({ a: 2 }));
assert.equal(draft.contentDigest.length > 32, true, 'a wide digest bounds accidental collision');
// Any bound change produces a different digest.
for (const overrides of [
  { locale: 'th' },
  { purpose: 'a different purpose' },
  { contact: { ...base.contact, preference: 'postal' } },
  { contact: { ...base.contact, recipientSelected: true, recipientRole: 'General manager', address: 'gm@courseA.example' } },
  { draftType: 'partnership_follow_up', prospect: { ...base.prospect, priorRelationship: true } },
  { prospect: { ...base.prospect, country: 'Japan', jurisdiction: 'JP' } },
]) {
  const changed = build(overrides);
  assert.equal(changed.ok, true, `refused: ${changed.reason}`);
  assert.notEqual(changed.draft.contentDigest, draft.contentDigest, `digest unchanged for ${JSON.stringify(Object.keys(overrides))}`);
}
// The DESTINATION is bound: swapping the address after approval must change the digest.
const toA = build({ contact: { ...base.contact, recipientSelected: true, recipientRole: 'GM', address: 'gm@courseA.example' } });
const toB = build({ contact: { ...base.contact, recipientSelected: true, recipientRole: 'GM', address: 'attacker@evil.example' } });
assert.notEqual(toA.draft.contentDigest, toB.draft.contentDigest, 'a recipient swap must invalidate approval');
assert.doesNotMatch(JSON.stringify(toA.draft), /gm@courseA\.example/, 'the address is bound as a surrogate, never in clear');
// A selected recipient without an address is refused rather than silently unaddressed.
assert.equal(build({ contact: { ...base.contact, recipientSelected: true, recipientRole: 'GM' } }).reason, 'missing_recipient_address');
// A type asserting an existing relationship requires one on record.
assert.equal(build({ draftType: 'renewal_continuation' }).reason, 'no_prior_relationship');
assert.equal(build({ draftType: 'partnership_follow_up' }).reason, 'no_prior_relationship');
// Production ships no approved jurisdiction block, so every jurisdiction refuses.
assert.equal(buildOutreachDraft({ draftType: 'course_introduction', locale: 'en', ...base }).reason, 'jurisdiction_compliance_block_unavailable');
assert.equal(draft.complianceBlockApproved, false, 'the test block is explicitly not legally approved');
// Deny flags accept any truthy value, not only === true.
for (const flag of ['true', 1, 'yes']) {
  assert.equal(build({ contact: { ...base.contact, doNotContact: flag } }).reason, 'do_not_contact', `doNotContact:${JSON.stringify(flag)} must refuse`);
  assert.equal(build({ prospect: { ...base.prospect, deleted: flag } }).reason, 'prospect_deleted');
}
// DNC is honoured on every carrier, and status is an allowlist.
assert.equal(build({ prospect: { ...base.prospect, doNotContact: true } }).reason, 'do_not_contact');
assert.equal(build({ consent: { ...base.consent, doNotContact: true } }).reason, 'do_not_contact');
assert.equal(build({ prospect: { ...base.prospect, status: 'DO_NOT_CONTACT' } }).reason, 'do_not_contact');
assert.equal(build({ prospect: { ...base.prospect, status: 'ACTIVE_PARTNER' } }).reason, 'active_partner_status');
assert.equal(build({ prospect: { ...base.prospect, status: 'invented_status' } }).reason, 'do_not_contact');
// A prototype-chain locale is refused, not thrown on.
for (const locale of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(build({ locale }).reason, 'unsupported_locale', `${locale} must be refused`);
// Injected content is screened for personal data AND prohibited claims before rendering.
assert.equal(build({ purpose: 'contact ops@leak.example' }).reason, 'unsafe_injected_content');
assert.equal(build({ draftType: 'played_evidence_opportunity', evidence: { authoritative: true, stale: false, evidenceVersion: 'e1', period: '2026-07', summary: 'You owe Golfriend an outstanding commission invoice.' } }).reason, 'prohibited_claim_in_content');
assert.equal(build({ draftType: 'played_evidence_opportunity', evidence: { authoritative: true, stale: false, evidenceVersion: 'e1', period: 'ops@leak.example', summary: 'ok' } }).reason, 'unsafe_injected_content');
// An evidence draft whose copy promises a summary must have one.
assert.equal(build({ draftType: 'played_evidence_opportunity', evidence: { authoritative: true, stale: false, evidenceVersion: 'e1', period: '2026-07' } }).reason, 'missing_evidence_summary');
// Identical inputs are deterministic.
assert.equal(build().draft.contentDigest, draft.contentDigest);

// === 5. Workflow and separation of duties ===============================
assert.deepEqual([...APPROVAL_ACTIONS], ['assign_reviewer', 'preview', 'approve', 'reject', 'request_changes', 'expire', 'revoke']);
assert.equal(APPROVAL_STATES.length, 9);
assert.notEqual(REVIEWER_GRANT, AUTHOR_GRANT);
// No fabricated field: separation of duties is tested against the object the PRODUCER emits.
const bound = draft;
const author = { actorRef: draft.createdBy, grants: [REVIEWER_GRANT, AUTHOR_GRANT], role: 'Director' };
const reviewer = { actorRef: 'actor-reviewer-1', grants: [REVIEWER_GRANT], role: 'Director' };
const outsider = { actorRef: 'actor-outsider', grants: [], role: 'Support' };

// The author cannot be assigned as reviewer, and cannot approve their own draft.
assert.equal(applyWorkflowAction({ state: 'draft_created', action: 'assign_reviewer', draft: bound, actor: author, reviewerRef: bound.createdBy, at: 't' }).error, 'separation_of_duties');
assert.equal(applyWorkflowAction({ state: 'previewed', action: 'approve', draft: bound, actor: author, at: 't' }).error, 'separation_of_duties');
// A reviewer grant is required for every review action.
for (const action of ['preview', 'approve', 'reject', 'request_changes']) {
  const state = action === 'approve' ? 'previewed' : 'reviewer_assigned';
  assert.equal(applyWorkflowAction({ state, action, draft: bound, actor: outsider, at: 't' }).error, 'reviewer_grant_required', `${action} must require the grant`);
}
// Only the assigned reviewer may act.
assert.equal(applyWorkflowAction({ state: 'previewed', action: 'approve', draft: bound, actor: reviewer, assignedReviewerRef: 'actor-someone-else', at: 't' }).error, 'not_the_assigned_reviewer');
// Happy path.
assert.equal(applyWorkflowAction({ state: 'draft_created', action: 'assign_reviewer', draft: bound, actor: author, reviewerRef: reviewer.actorRef, at: 't' }).state, 'reviewer_assigned');
assert.equal(applyWorkflowAction({ state: 'reviewer_assigned', action: 'preview', draft: bound, actor: reviewer, at: 't' }).state, 'previewed');
const approved = applyWorkflowAction({ state: 'previewed', action: 'approve', draft: bound, actor: reviewer, at: '2026-08-15T10:00:00.000Z' });
assert.equal(approved.state, 'approved');
assert.equal(approved.approvedDigest, draft.contentDigest, 'approval binds the exact digest');
// Terminal states accept nothing further.
for (const terminal of ['rejected', 'expired', 'revoked', 'invalidated']) assert.equal(applyWorkflowAction({ state: terminal, action: 'approve', draft: bound, actor: reviewer, at: 't' }).error, 'transition_not_permitted');
// An approved draft can still be expired or revoked.
assert.equal(applyWorkflowAction({ state: 'approved', action: 'revoke', draft: bound, actor: reviewer, at: 't' }).state, 'revoked');
assert.equal(applyWorkflowAction({ state: 'approved', action: 'expire', draft: bound, actor: reviewer, at: 't' }).state, 'expired');
assert.equal(applyWorkflowAction({ state: 'previewed', action: 'not_an_action', draft: bound, actor: reviewer, at: 't' }).error, 'unknown_action');

// Every transition yields an immutable receipt that never claims delivery.
const receipt = workflowReceipt({ action: 'approve', fromState: 'previewed', toState: 'approved', draftDigest: draft.contentDigest, actorRef: 'reviewer@admin.example', at: '2026-08-15T10:00:00.000Z' });
assert.ok(Object.isFrozen(receipt));
assert.equal(receipt.deliveryClaimed, false);
assert.doesNotMatch(JSON.stringify(receipt), /reviewer@admin\.example/, 'actors are surrogated, never named');
assert.match(receipt.notice, /not delivery confirmation/i);

// === 6. Revalidation: replay and revocation =============================
const approval = { state: 'approved', approvedDigest: draft.contentDigest, approvedAt: '2026-08-15T10:00:00.000Z', approverRole: 'Director', evidenceVersion: null };
const goodContext = { approverGrants: [REVIEWER_GRANT], approverRole: 'Director', consentState: 'granted', doNotContact: false, prospectDeleted: false, evidenceVersion: null };
const currentBound = boundFromDraft(draft);
const fresh = revalidateApproval({ approval, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z' });
assert.equal(fresh.valid, true, `unexpected failures: ${fresh.failures.join(', ')}`);

// Each invalidation trigger, individually.
const triggers = [
  ['content_changed', { currentBound: { ...currentBound, body: 'edited body' } }],
  ['content_changed', { currentBound: { ...currentBound, purpose: 'different purpose' } }],
  ['grant_revoked', { context: { ...goodContext, approverGrants: [] } }],
  ['role_changed', { context: { ...goodContext, approverRole: 'Support' } }],
  ['consent_withdrawn', { context: { ...goodContext, consentState: 'withdrawn' } }],
  ['do_not_contact_set', { context: { ...goodContext, doNotContact: true } }],
  ['prospect_deleted', { context: { ...goodContext, prospectDeleted: true } }],
  ['evidence_changed', { context: { ...goodContext, evidenceVersion: 'e2' } }],
];
for (const [trigger, overrides] of triggers) {
  const result = revalidateApproval({ approval, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z', ...overrides });
  assert.equal(result.valid, false, `${trigger} must invalidate`);
  assert.ok(result.failures.includes(trigger), `${trigger} not reported: ${result.failures.join(', ')}`);
  assert.ok(INVALIDATION_TRIGGERS.includes(trigger));
}
// Approval expires after a bounded server-controlled period.
assert.ok(revalidateApproval({ approval, currentBound, context: goodContext, at: '2026-08-15T12:00:00.000Z' }).failures.includes('approval_expired'));
assert.ok(revalidateApproval({ approval, currentBound, context: goodContext, at: '2026-08-15T09:00:00.000Z' }).failures.includes('approval_expired'), 'a time before approval is not valid either');
assert.equal(APPROVAL_TTL_MINUTES, 60);
// A non-approved state is never revalidated as valid.
assert.equal(revalidateApproval({ approval: { ...approval, state: 'revoked' }, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z' }).valid, false);
// The digest is RECOMPUTED, so a mutated draft carrying its own stale digest cannot self-validate.
assert.equal(revalidateApproval({ approval: { ...approval, approvedDigest: contentDigest({ ...currentBound, body: 'edited' }) }, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z' }).failures.includes('content_changed'), true);

// === 7. Send adapter is a contract, never mounted =======================
assert.equal(SEND_ADAPTER_CONTRACT.mounted, false);
assert.equal(SEND_ADAPTER_CONTRACT.adapter, null);
assert.ok(Object.isFrozen(SEND_ADAPTER_CONTRACT));
const readiness = sendReadiness({ approval, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z' });
assert.equal(readiness.sendable, false, 'nothing is sendable without a mounted adapter');
assert.deepEqual([...readiness.blocked], ['no_send_adapter_mounted']);
// A non-production adapter is not a send adapter.
assert.equal(sendReadiness({ approval, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z', adapter: { send() {} } }).sendable, false);
assert.equal(sendReadiness({ approval, currentBound, context: goodContext, at: '2026-08-15T10:10:00.000Z', adapter: { send() {}, productionApproved: true } }).sendable, true, 'the contract is satisfiable, so the gate is real');
// An invalid approval blocks even a production adapter.
assert.equal(sendReadiness({ approval, currentBound, context: { ...goodContext, doNotContact: true }, at: '2026-08-15T10:10:00.000Z', adapter: { send() {}, productionApproved: true } }).sendable, false);

// === 8. Accessible preview and privacy ==================================
const preview = draftPreviewStructure(draft);
assert.equal(preview.lang, draft.locale, 'the preview declares its language for assistive technology');
assert.deepEqual(preview.regions.map((r) => r.id), ['subject', 'body', 'binding', 'status']);
assert.ok(preview.regions.every((r) => r.label && r.role && typeof r.text === 'string'), 'every region is labelled and roled');
assert.equal(preview.regions.find((r) => r.id === 'status').role, 'status');
assert.ok(Object.isFrozen(preview.regions));
// A draft without an explicitly selected recipient carries no personal data.
assert.equal(draft.recipientIncluded, false);
assert.equal(draftIsPrivacySafe(draft), true);
assert.ok(draft.body.includes(DRAFT_COPY.en.recipientFallback), 'the name-free fallback is used');
// Hostile free text is now REFUSED at the gate rather than redacted after rendering: a value
// carrying personal data never reaches the body at all.
assert.equal(build({ contact: { ...base.contact, recipientSelected: true, recipientRole: "GM ops@leak.example", address: "gm@a.example" } }).reason, "unsafe_injected_content");
// A hostile course name is REDACTED at interpolation (it is a business identifier, not an
// operator-authored message field), so the draft still builds but the value never appears.
assert.doesNotMatch(build({ prospect: { ...base.prospect, courseName: "Riverbend ops@leak.example" } }).draft.body, /ops@leak.example/);
// The claims map is DERIVED from rendered text, so it can actually report true.
assert.equal(deriveClaims("You owe an outstanding commission invoice").invoice, true);
assert.equal(deriveClaims("An introduction to Golfriend").invoice, false);
assert.deepEqual(draft.claims, Object.fromEntries(PROHIBITED_CLAIMS.map((c) => [c, false])), "clean copy derives an all-false claims map");
assert.equal(draftIsPrivacySafe(draft), true);
assert.equal(draftIsPrivacySafe({ subject: "x", body: "reach ops@leak.example", recipientIncluded: false }), false, "the privacy check must be able to fail");

console.log('Outreach draft and approval verification PASS: seven draft types with exact eight-locale parity and no placeholder or dropped disclaimer, seventeen fail-closed refusals covering consent authority, withdrawal, DNC, jurisdiction, contact preference, active partner, deletion, conflicting identity, purpose and stale/absent evidence, full binding with an order-independent digest that changes on every bound edit, separation of duties at assignment and approval, grant and assigned-reviewer enforcement, immutable non-delivery receipts, eight invalidation triggers plus bounded expiry with a recomputed digest, an unmounted but satisfiable send contract, and an accessible labelled preview with name-free fallback and redacted hostile input.');
