// ==========================================
// FILE: functions/src/authority.ts
// Server-owned staff authority, matching the approved portal role journey
// (src/auth/roleJourney.js): admin access = an admin_users/{uid} document that
// exists, carries a CANONICAL ACTIVE status, and carries an assigned role.
// Pure + testable. NO God-Mode literal, NO client role assignment, NO environment
// bypass. Fail-closed for missing / inactive / suspended / unknown / role-less records.
//
// THIS IS AN ALLOWLIST, NOT A DENYLIST.
//
// It used to deny only the literal status 'Suspended' and permit everything else,
// including a MISSING status. That is backwards for an authorization predicate: it
// means any status value the system has never heard of — 'Inactive', 'Deactivated',
// 'Revoked', a typo, a partially-written document, or no status at all — granted
// platform staff authority. A predicate that must be told about every way to be
// unauthorized will always be one deployment behind.
//
// The canonical vocabulary is derived from the code that WRITES the document, not
// invented here:
//   - the hire-staff callable (index.ts) writes status: 'Active' on creation;
//   - setEmployeeStatus (index.ts) refuses any value other than 'Active' or
//     'Suspended' before it will write.
// So 'Active' is the one and only status that has ever meant authorized, and it is
// the one and only value this file accepts.
//
// STATUS AND ROLE ARE SEPARATE CONCERNS. Status is employment/account standing;
// role is what that person may decide. Status is evaluated FIRST and a valid role
// can never override an inactive status.
// ==========================================

export interface AdminUserDoc {
  role?: string;
  status?: string;
}

/**
 * The canonical ACTIVE statuses, in normalized form. Exactly one value, because
 * exactly one value is ever written. Extending this list widens who may act as
 * platform staff and must be a deliberate, reviewed change.
 */
export const ACTIVE_STAFF_STATUSES: readonly string[] = Object.freeze(['active']);

/**
 * Statuses that are KNOWN to mean "not authorized". This list is documentation and
 * defence in depth — it is NOT what makes them fail. They fail because they are not
 * in ACTIVE_STAFF_STATUSES. Anything absent from both lists also fails.
 */
export const KNOWN_INACTIVE_STATUSES: readonly string[] = Object.freeze([
  'suspended', 'inactive', 'deactivated', 'revoked', 'expired',
  'disabled', 'deleted', 'removed', 'terminated', 'pending', 'unknown',
]);

/**
 * THE ROLE REGISTRY.
 *
 * Status was already an allowlist; the ROLE was not. "Any non-empty string" was
 * accepted as an assigned role, so a record carrying a typo, a legacy title, a role
 * from another product's vocabulary, or a value someone simply made up counted as
 * platform staff with a role. An authorization predicate must know the whole
 * vocabulary it accepts, for the same reason it must know every status.
 *
 * The vocabulary is DERIVED FROM THE CODE THAT WRITES IT, not invented here:
 *   - the hire surface (src/components/admin/HRManagement.tsx) offers exactly
 *     'Manager' and 'Support';
 *   - 'Director' is the founding tier, deliberately never hireable from the UI;
 *   - isActiveDirector compares against 'Director' exactly.
 * Adding a value here widens who may act as staff and is a reviewed change.
 */
export const ADMIN_ROLE_REGISTRY_VERSION = '2026-08-15.v1';

export const CANONICAL_ADMIN_ROLES: readonly string[] = Object.freeze([
  'Director', 'Manager', 'Support',
]);

/**
 * Roles that once existed and must now fail closed. Empty today; it exists so that
 * retiring a role is a one-line, testable change rather than a silent deletion from
 * the list above — a deleted role would fail closed either way, but recording it
 * says the retirement was deliberate.
 */
export const OBSOLETE_ADMIN_ROLES: readonly string[] = Object.freeze([]);

/**
 * Exact membership of the registry. NOT case-folded: folding a role WIDENS authority
 * ('director' would begin to grant Director powers where it never has), and widening
 * is not a hardening change. A non-canonical spelling fails closed.
 */
export function isCanonicalAdminRole(value: unknown): boolean {
  return typeof value === 'string' && CANONICAL_ADMIN_ROLES.indexOf(value) !== -1;
}

/**
 * Normalize a status for comparison: NFC, trimmed, lower-cased.
 *
 * This folds only CANONICALLY EQUIVALENT spellings — ' Active ' and 'ACTIVE' are the
 * same status. It deliberately does NOT fold confusables: 'Аctive' with a Cyrillic А
 * is a different string under NFC and is therefore rejected, which is the correct
 * outcome for a value that merely looks right.
 *
 * A non-string, or a value that is empty once trimmed, normalizes to null — which
 * every caller treats as "unknown", never as "fine".
 */
export function normalizeStaffStatus(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

/**
 * Active platform staff: the admin_users doc exists, presents a canonical active
 * status, and carries a non-empty assigned role. Every other input — null/undefined,
 * an array, a missing or blank status, a status of any other value, or no role —
 * fails closed. This is the sole authorization signal; there is no break-glass.
 */
export function isActiveStaff(adminDoc: AdminUserDoc | null | undefined): boolean {
  if (!adminDoc || typeof adminDoc !== 'object') return false;   // missing → deny
  if (Array.isArray(adminDoc)) return false;                     // malformed type → deny

  // STATUS FIRST. A valid role must never be able to rescue an inactive account.
  const status = normalizeStaffStatus(adminDoc.status);
  if (status === null) return false;                             // blank/absent/malformed → deny
  if (adminDoc.status === 'Suspended') return false;             // suspended → deny (explicit)
  if (KNOWN_INACTIVE_STATUSES.indexOf(status) !== -1) return false; // known-inactive → deny
  if (ACTIVE_STAFF_STATUSES.indexOf(status) === -1) return false;   // anything unrecognized → deny

  // ROLE SECOND, and only as a separate question: is a role assigned at all, and is
  // it a role this system actually recognizes?
  if (typeof adminDoc.role !== 'string' || adminDoc.role.trim() === '') return false; // no role → deny
  if (OBSOLETE_ADMIN_ROLES.indexOf(adminDoc.role) !== -1) return false;               // retired → deny
  if (!isCanonicalAdminRole(adminDoc.role)) return false;                             // out of registry → deny
  return true;
}

/**
 * Director-tier authority (a strict subset of active staff).
 *
 * The role comparison stays EXACT on purpose. Case-folding a role would widen
 * authority — 'director' would begin to grant Director powers where it never has —
 * and widening is not a hardening change. A non-canonical spelling fails closed.
 */
export function isActiveDirector(adminDoc: AdminUserDoc | null | undefined): boolean {
  return isActiveStaff(adminDoc) && adminDoc!.role === 'Director';
}
