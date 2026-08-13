// ==========================================
// FILE: functions/src/partnerIntakeLogic.ts
// Pure, server-authoritative logic for the partner application INTAKE pipeline
// (metadata + document checklist + consent + attestation). No I/O, no Firebase,
// fully unit-testable. The onCall wrappers in index.ts enforce auth and persist
// via the Admin SDK; this module owns validation + the status state machine +
// the review→provisioning-handoff decision.
//
// AUTHORITY INVARIANTS (do not weaken):
//   - Submitting an application NEVER grants partner status. Approval only marks
//     the submission ready for STAFF-controlled provisioning (handoff), it does
//     not assign b2b_partners status.
//   - Binary file upload is NOT part of intake yet (no Storage). Intake captures
//     the applicant's ATTESTATION that they hold each document.
// ==========================================

/** Canonical submission lifecycle. */
export const SUBMISSION_STATUSES = [
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'info_needed',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Documents an applicant attests to holding (no bytes uploaded yet). */
export const REQUIRED_DOCUMENTS = [
  'business_registration',
  'ownership_or_authorization',
  'responsible_person_id',
] as const;
export type RequiredDocument = (typeof REQUIRED_DOCUMENTS)[number];

/** Staff review decisions. */
export const REVIEW_DECISIONS = ['begin_review', 'approve', 'reject', 'request_info'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface SubmissionInput {
  /** Applicant-attested checklist: which required documents they hold. */
  checklist?: Partial<Record<RequiredDocument, boolean>>;
  consentAccepted?: boolean;
  attestationAccepted?: boolean;
  note?: unknown;
  locale?: unknown;
}

export interface CleanSubmission {
  checklist: Record<RequiredDocument, boolean>;
  consentAccepted: true;
  attestationAccepted: true;
  note: string;
  missingDocuments: RequiredDocument[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  clean?: CleanSubmission;
}

/**
 * Validate an intake submission. Consent AND attestation are mandatory to submit.
 * The checklist may be partial (missing docs are recorded, not blocking) so an
 * applicant can submit and staff can request the remainder via `info_needed`.
 */
export function validateSubmission(input: SubmissionInput | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['A submission payload is required.'] };
  }
  if (input.consentAccepted !== true) errors.push('Consent must be accepted.');
  if (input.attestationAccepted !== true) errors.push('Attestation must be accepted.');

  const rawChecklist = (input.checklist && typeof input.checklist === 'object') ? input.checklist : {};
  const checklist = {} as Record<RequiredDocument, boolean>;
  for (const doc of REQUIRED_DOCUMENTS) checklist[doc] = rawChecklist[doc] === true;
  const missingDocuments = REQUIRED_DOCUMENTS.filter((d) => !checklist[d]);

  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 2000) : '';

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    clean: { checklist, consentAccepted: true, attestationAccepted: true, note, missingDocuments },
  };
}

export function isSubmissionStatus(v: unknown): v is SubmissionStatus {
  return typeof v === 'string' && (SUBMISSION_STATUSES as readonly string[]).includes(v);
}

export function isReviewDecision(v: unknown): v is ReviewDecision {
  return typeof v === 'string' && (REVIEW_DECISIONS as readonly string[]).includes(v);
}

/** Status assigned when an applicant submits (or resubmits). */
export function statusOnSubmit(): SubmissionStatus {
  return 'submitted';
}

/** An applicant may (re)submit only from these states. */
export function canSubmit(current: SubmissionStatus | null | undefined): boolean {
  if (!current) return true; // no prior submission
  return current === 'draft' || current === 'info_needed' || current === 'rejected';
}

/** States a staff reviewer may act on. */
export function canReview(current: SubmissionStatus | null | undefined): boolean {
  return current === 'submitted' || current === 'under_review' || current === 'info_needed';
}

export interface ReviewOutcome {
  ok: boolean;
  error?: string;
  status?: SubmissionStatus;
  /** True only on approval — signals STAFF provisioning is now warranted.
   *  This is a HANDOFF flag; it does not itself grant partner status. */
  readyForProvisioning?: boolean;
}

/**
 * Apply a staff review decision to the current status. Returns the next status
 * and, on approval, a provisioning-handoff flag (staff still provisions
 * separately — approval never assigns partner status here).
 */
export function applyReview(
  current: SubmissionStatus | null | undefined,
  decision: ReviewDecision,
): ReviewOutcome {
  if (!isReviewDecision(decision)) return { ok: false, error: 'Unknown review decision.' };
  if (!canReview(current)) return { ok: false, error: `Cannot review a submission in status "${current}".` };
  switch (decision) {
    case 'begin_review': return { ok: true, status: 'under_review' };
    case 'approve': return { ok: true, status: 'approved', readyForProvisioning: true };
    case 'reject': return { ok: true, status: 'rejected' };
    case 'request_info': return { ok: true, status: 'info_needed' };
  }
}
