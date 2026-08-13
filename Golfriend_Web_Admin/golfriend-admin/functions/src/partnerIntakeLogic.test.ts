// ==========================================
// FILE: functions/src/partnerIntakeLogic.test.ts
// Unit tests for the pure partner-intake logic. Run: `npm run test:intake`.
// Exits non-zero on the first failed assertion.
// ==========================================
import assert from 'node:assert';
import {
  validateSubmission,
  statusOnSubmit,
  canSubmit,
  canReview,
  applyReview,
  isSubmissionStatus,
  REQUIRED_DOCUMENTS,
  type ReviewDecision,
} from './partnerIntakeLogic.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

// ---- validation ----
check('valid submission requires consent AND attestation', () => {
  const full = { checklist: { business_registration: true, ownership_or_authorization: true, responsible_person_id: true }, consentAccepted: true, attestationAccepted: true };
  assert.equal(validateSubmission(full).ok, true);
  assert.equal(validateSubmission({ ...full, consentAccepted: false }).ok, false);
  assert.equal(validateSubmission({ ...full, attestationAccepted: false }).ok, false);
  assert.equal(validateSubmission(null).ok, false);
});

check('partial checklist is allowed and missing docs are recorded', () => {
  const r = validateSubmission({ checklist: { business_registration: true }, consentAccepted: true, attestationAccepted: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.clean!.missingDocuments, ['ownership_or_authorization', 'responsible_person_id']);
  // every required doc is normalized to a boolean
  assert.deepEqual(Object.keys(r.clean!.checklist).sort(), [...REQUIRED_DOCUMENTS].sort());
});

check('note is trimmed and length-capped; non-string ignored', () => {
  assert.equal(validateSubmission({ consentAccepted: true, attestationAccepted: true, note: '  hi  ' }).clean!.note, 'hi');
  assert.equal(validateSubmission({ consentAccepted: true, attestationAccepted: true, note: 42 }).clean!.note, '');
});

// ---- state machine ----
check('submit yields submitted; only draft/info_needed/rejected can (re)submit', () => {
  assert.equal(statusOnSubmit(), 'submitted');
  assert.equal(canSubmit(null), true);
  assert.equal(canSubmit('draft'), true);
  assert.equal(canSubmit('info_needed'), true);
  assert.equal(canSubmit('rejected'), true);
  assert.equal(canSubmit('submitted'), false);
  assert.equal(canSubmit('under_review'), false);
  assert.equal(canSubmit('approved'), false);
});

check('review is allowed only from submitted/under_review/info_needed', () => {
  assert.equal(canReview('submitted'), true);
  assert.equal(canReview('under_review'), true);
  assert.equal(canReview('info_needed'), true);
  assert.equal(canReview('approved'), false);
  assert.equal(canReview('rejected'), false);
  assert.equal(canReview(null), false);
});

check('applyReview maps decisions and gates transitions', () => {
  assert.equal(applyReview('submitted', 'begin_review').status, 'under_review');
  assert.equal(applyReview('under_review', 'reject').status, 'rejected');
  assert.equal(applyReview('submitted', 'request_info').status, 'info_needed');
  const approved = applyReview('under_review', 'approve');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.readyForProvisioning, true); // handoff flag on approval only
  assert.equal(applyReview('approved', 'approve').ok, false); // terminal — cannot re-review
  assert.equal(applyReview('submitted', 'nonsense' as unknown as ReviewDecision).ok, false);
});

check('approval is the ONLY decision that flags provisioning handoff', () => {
  assert.notEqual(applyReview('submitted', 'begin_review').readyForProvisioning, true);
  assert.notEqual(applyReview('submitted', 'reject').readyForProvisioning, true);
  assert.notEqual(applyReview('submitted', 'request_info').readyForProvisioning, true);
});

check('status type guard', () => {
  assert.equal(isSubmissionStatus('approved'), true);
  assert.equal(isSubmissionStatus('nope'), false);
});

console.log(`\npartnerIntakeLogic: ${passed} checks passed.`);
