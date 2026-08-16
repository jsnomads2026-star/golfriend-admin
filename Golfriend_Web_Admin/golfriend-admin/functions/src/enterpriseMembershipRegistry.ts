// ==========================================
// FILE: functions/src/enterpriseMembershipRegistry.ts
//
// The vocabulary for enterprise staff membership: which document paths are membership
// records at all, which fields one may carry, what a candidate document means once
// read, and how a removal command is identified.
//
// WHY. The cross-enterprise safety question — "is this person already active staff
// somewhere else?" — can only be asked of a collection-group query, and a
// collection-group query matches a subcollection NAME, not a location. A `members`
// document under any other root, in any other domain, comes back looking exactly like
// enterprise staff. So the answer must be qualified by PATH and by an authoritative
// per-principal registry document, never by the shape of what a name-match returned.
//
// Nothing here touches Firestore, so every rule below is unit-testable without
// infrastructure and the callable cannot disagree with the tests about what a
// membership is.
// ==========================================

/** Bumped when the membership record shape changes. A record without it is pre-registry. */
export const MEMBERSHIP_REGISTRY_VERSION = '2026-08-15.v1';

/** The registry: one document per principal, naming their current enterprise binding. */
export const MEMBERSHIP_REGISTRY_COLLECTION = 'enterprise_staff_memberships';

/** Immutable evidence of a granted / revoked authority, and the monotonic counter. */
export const GRANT_AUDIT_COLLECTION = 'enterprise_staff_grant_audits';
export const REMOVAL_AUDIT_COLLECTION = 'enterprise_staff_removal_audits';
export const GRANT_COUNTER_COLLECTION = 'enterprise_staff_grant_counters';

/**
 * The ONLY shape a membership document may have. Anchored at both ends: a document is
 * a membership because of WHERE it is, never because of what it is called.
 */
export const CANONICAL_MEMBERSHIP_PATH = /^enterprise_staff\/([^/]+)\/members\/([^/]+)$/;

export const MEMBERSHIP_STATUSES: readonly string[] = Object.freeze(['active', 'removed']);

/**
 * The enterprise staff role vocabulary. Distinct from the ADMIN role registry in
 * authority.ts — these are a partner's own staff, not Golfriend platform staff.
 * Derived from what the callable has always written.
 */
export const ENTERPRISE_STAFF_ROLES: readonly string[] = Object.freeze([
  'manager', 'venue_staff', 'analyst',
]);

export function isEnterpriseStaffRole(value: unknown): boolean {
  return typeof value === 'string' && ENTERPRISE_STAFF_ROLES.indexOf(value) !== -1;
}

/**
 * Every field a membership may carry. A surplus field means something wrote to this
 * collection that is not this code, and the safe reading of that is "I do not
 * understand this record", not "the parts I recognize look fine".
 */
export const MEMBERSHIP_FIELDS: readonly string[] = Object.freeze([
  'staffUid', 'contactAddress', 'role', 'status', 'enterpriseUid', 'organizationId',
  'grantSeq', 'invitedAt', 'invitedBy', 'registryVersion',
  'removedAt', 'removedBy', 'removalCommandId', 'removalReason', 'removalSeq', 'previousRole',
]);

/**
 * Removal reasons are a CLOSED VOCABULARY, not free text. A free-text reason on a
 * staff record is a private note about a named person, and this lane does not create
 * those.
 */
export const REMOVAL_REASONS: readonly string[] = Object.freeze([
  'left_organization',
  'role_no_longer_required',
  'access_review',
  'requested_by_staff',
  'security_concern',
]);

export function isRemovalReason(value: unknown): boolean {
  return typeof value === 'string' && REMOVAL_REASONS.indexOf(value) !== -1;
}

/** Command ids are caller-supplied, so they are bounded before being used as a key. */
export function isValidCommandId(value: unknown): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export type PathClassification =
  | { kind: 'enterprise_membership'; enterpriseUid: string; staffUid: string }
  | { kind: 'foreign_domain'; path: string };

/**
 * Is this path an enterprise membership? A `members` subcollection under any other
 * root belongs to another domain and is not evidence about enterprise staffing in
 * either direction.
 */
export function classifyMembershipPath(path: unknown): PathClassification {
  if (typeof path !== 'string') return { kind: 'foreign_domain', path: String(path) };
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  const match = CANONICAL_MEMBERSHIP_PATH.exec(trimmed);
  if (!match) return { kind: 'foreign_domain', path: trimmed };
  return { kind: 'enterprise_membership', enterpriseUid: match[1], staffUid: match[2] };
}

export type MembershipVerdict =
  | 'foreign_ignore'
  | 'own_active'
  | 'own_inactive'
  | 'cross_enterprise'
  | 'cross_organization'
  | 'legacy_unregistered'
  | 'malformed';

export type CandidateInput = {
  path: unknown;
  data: unknown;
  expectedStaffUid: string;
  callerUid: string;
  callerOrganizationId: string;
};

/**
 * What one candidate document means. Only `foreign_ignore`, `own_active` and
 * `own_inactive` are safe to continue past; every other verdict is a refusal,
 * including every case where the record cannot be understood.
 */
export function evaluateMembershipCandidate(
  input: CandidateInput,
): { verdict: MembershipVerdict; detail: string } {
  const classified = classifyMembershipPath(input.path);
  if (classified.kind === 'foreign_domain') {
    return { verdict: 'foreign_ignore', detail: `not an enterprise membership path: ${classified.path}` };
  }

  const data = input.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { verdict: 'malformed', detail: 'membership document is not an object' };
  }
  const record = data as Record<string, unknown>;

  const surplus = Object.keys(record).filter((key) => MEMBERSHIP_FIELDS.indexOf(key) === -1);
  if (surplus.length > 0) {
    return { verdict: 'malformed', detail: `undeclared field(s): ${surplus.sort().join(', ')}` };
  }

  // The document must agree with its own location. A record claiming an enterprise
  // other than the one it is filed under is misplaced or tampered with; either way it
  // is not something to reason about.
  if (typeof record.staffUid !== 'string' || record.staffUid !== classified.staffUid) {
    return { verdict: 'malformed', detail: 'staffUid does not match the document id' };
  }
  if (typeof record.enterpriseUid !== 'string' || record.enterpriseUid !== classified.enterpriseUid) {
    return { verdict: 'malformed', detail: 'enterpriseUid does not match the document path' };
  }
  if (record.staffUid !== input.expectedStaffUid) {
    return { verdict: 'malformed', detail: 'membership belongs to a different principal than the one queried' };
  }
  if (typeof record.status !== 'string' || MEMBERSHIP_STATUSES.indexOf(record.status) === -1) {
    return { verdict: 'malformed', detail: `unrecognized status: ${String(record.status)}` };
  }
  // PRE-REGISTRY RECORDS FAIL CLOSED. A membership written before the registry existed
  // carries no organization binding, so it cannot be shown to be safe — and silently
  // treating it as unattached is exactly how a principal gets re-homed.
  if (record.registryVersion !== MEMBERSHIP_REGISTRY_VERSION) {
    return {
      verdict: record.registryVersion === undefined ? 'legacy_unregistered' : 'malformed',
      detail: `registryVersion ${String(record.registryVersion)} is not ${MEMBERSHIP_REGISTRY_VERSION}`,
    };
  }
  if (typeof record.organizationId !== 'string' || record.organizationId.trim() === '') {
    return { verdict: 'malformed', detail: 'membership carries no organization binding' };
  }

  if (record.status !== 'active') {
    return { verdict: 'own_inactive', detail: `status ${record.status}` };
  }
  if (record.enterpriseUid !== input.callerUid) {
    return { verdict: 'cross_enterprise', detail: `active staff of enterprise ${record.enterpriseUid}` };
  }
  if (record.organizationId !== input.callerOrganizationId) {
    return { verdict: 'cross_organization', detail: `bound to organization ${record.organizationId}` };
  }
  return { verdict: 'own_active', detail: 'active staff of this enterprise' };
}

export type AdmissionDecision = {
  decision: 'proceed' | 'refuse';
  code: string;
  reason: string;
  counts: Record<string, number>;
};

/**
 * The whole-evidence decision. `saturated` means the page came back full: the query
 * could not be shown to have returned everything, so the absence of a foreign
 * membership within it proves nothing.
 */
export function decideMembershipAdmission(input: {
  registry: { verdict: MembershipVerdict; detail: string } | null;
  candidates: { verdict: MembershipVerdict; detail: string }[];
  saturated: boolean;
}): AdmissionDecision {
  const counts: Record<string, number> = {};
  const all = input.registry ? [input.registry, ...input.candidates] : [...input.candidates];
  for (const entry of all) counts[entry.verdict] = (counts[entry.verdict] || 0) + 1;

  if (input.saturated) {
    return {
      decision: 'refuse', code: 'unavailable',
      reason: 'Too many existing membership records to evaluate safely. No change was made.',
      counts,
    };
  }
  const refusals: [MembershipVerdict, string, string][] = [
    ['malformed', 'failed-precondition', 'An existing membership record could not be understood. No change was made.'],
    ['legacy_unregistered', 'failed-precondition', 'An existing membership record predates the membership registry and carries no organization binding. No change was made.'],
    ['cross_enterprise', 'already-exists', 'That account is already active staff of another enterprise.'],
    ['cross_organization', 'already-exists', 'That account is bound to a different organization.'],
  ];
  for (const [verdict, code, reason] of refusals) {
    if (counts[verdict]) return { decision: 'refuse', code, reason, counts };
  }
  return { decision: 'proceed', code: 'ok', reason: 'no conflicting membership', counts };
}

/**
 * The identity of a removal COMMAND, length-prefixed so that no two different
 * removals can produce the same fingerprint by shifting where one field ends and the
 * next begins. An exact replay reproduces it; an altered replay does not, and must
 * not be accepted under the original command id.
 */
export function removalFingerprint(input: {
  enterpriseUid: string; staffUid: string; reason: string; commandId: string;
}): string {
  const part = (value: string) => `${value.length}:${value}`;
  return [input.enterpriseUid, input.staffUid, input.reason, input.commandId].map(part).join('|');
}
