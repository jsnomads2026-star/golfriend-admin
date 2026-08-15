import {createHash} from "node:crypto";

export const ENTERPRISE_ROLES = Object.freeze(["manager", "venue_staff", "analyst"] as const);
export const REMOVAL_REASONS = Object.freeze([
  "left_organization", "role_no_longer_required", "access_review",
  "requested_by_staff", "security_concern",
] as const);
export const MEMBERSHIP_REGISTRY_VERSION = "2026-08-15.course-intake.v1";
export const MEMBERSHIP_REGISTRY_COLLECTION = "enterprise_staff_memberships";

export const isEnterpriseRole = (value: unknown): value is typeof ENTERPRISE_ROLES[number] =>
  typeof value === "string" && (ENTERPRISE_ROLES as readonly string[]).includes(value);
export const isRemovalReason = (value: unknown): value is typeof REMOVAL_REASONS[number] =>
  typeof value === "string" && (REMOVAL_REASONS as readonly string[]).includes(value);
export const isCommandId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);

export function rejectSurplus(payload: unknown, action: "invite"|"remove"): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("PAYLOAD_INVALID");
  const row = payload as Record<string, unknown>;
  const allowed = action === "remove" ? ["action", "staffUid", "reason", "commandId"] : ["action", "email", "role"];
  if (Object.keys(row).some((key) => !allowed.includes(key))) throw new Error("SURPLUS_FIELD");
  return row;
}

export function removalFingerprint(input: {enterpriseUid:string; organizationId:string; staffUid:string; membershipVersion:number; reason:string; commandId:string}) {
  const material = Object.values(input).map((value) => `${String(value).length}:${String(value)}`).join("|");
  return createHash("sha256").update(material).digest("hex");
}
