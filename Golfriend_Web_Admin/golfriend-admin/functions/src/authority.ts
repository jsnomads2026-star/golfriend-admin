// ==========================================
// FILE: functions/src/authority.ts
// Server-owned staff authority, matching the approved portal role journey
// (src/auth/roleJourney.js): admin access = an admin_users/{uid} document that
// exists, is NOT Suspended, and carries an assigned role. Pure + testable.
// NO email/God-Mode literal, NO client role assignment, NO environment bypass.
// Fail-closed for missing / inactive / suspended / role-less records.
// ==========================================

export interface AdminUserDoc {
  role?: string;
  status?: string;
}

/**
 * Active platform staff: the admin_users doc exists, is not Suspended, and has a
 * non-empty assigned role. Any other input (null/undefined, suspended, no role)
 * fails closed. This is the sole authorization signal — there is no break-glass.
 */
export function isActiveStaff(adminDoc: AdminUserDoc | null | undefined): boolean {
  if (!adminDoc || typeof adminDoc !== 'object') return false;   // missing → deny
  if (adminDoc.status === 'Suspended') return false;             // suspended → deny
  if (typeof adminDoc.role !== 'string' || adminDoc.role.trim() === '') return false; // no role → deny
  return true;
}

/** Director-tier authority (a strict subset of active staff). */
export function isActiveDirector(adminDoc: AdminUserDoc | null | undefined): boolean {
  return isActiveStaff(adminDoc) && adminDoc!.role === 'Director';
}
