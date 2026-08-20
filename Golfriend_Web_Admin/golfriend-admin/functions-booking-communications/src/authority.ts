export interface AdminUserDoc { role?: string; status?: string; }
export function isActiveStaff(value: AdminUserDoc | null | undefined) {
  return Boolean(value && value.status !== "Suspended" && typeof value.role === "string" && value.role.trim());
}
