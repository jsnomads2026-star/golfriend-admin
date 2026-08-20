export type AdminUserDoc = { role?: string; status?: string };

/** Director is staff; missing, suspended, and role-less records fail closed. */
export function isActiveStaffOrDirector(doc: AdminUserDoc | null | undefined): boolean {
  return Boolean(doc && doc.status !== 'Suspended' && typeof doc.role === 'string' && doc.role.trim());
}
