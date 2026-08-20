export type AdminUserDoc = { role?: string; status?: string };
export function isActiveDirector(adminDoc: AdminUserDoc | null | undefined): boolean {
  return Boolean(adminDoc && adminDoc.status !== 'Suspended' && adminDoc.role === 'Director');
}
