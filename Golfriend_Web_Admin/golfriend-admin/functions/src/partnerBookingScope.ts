import { createHash } from "node:crypto";

export const BOOKING_SCOPE_PROJECTION_VERSION =
  "golfriend.partner-booking-scope.v1";
export const PARTNER_BOOKING_ROLES = [
  "primary_owner",
  "manager",
  "course_staff",
  "support",
  "analyst",
] as const;

type Role = (typeof PARTNER_BOOKING_ROLES)[number];
type RecordLike = Record<string, unknown>;
export type BookingScopeInput = {
  callerUid: string;
  binding: RecordLike | null;
  membership: RecordLike | null;
  organization: RecordLike | null;
  operators: RecordLike[];
  courses: RecordLike[];
  generatedAtMs?: number;
  ttlMs?: number;
};
export type PartnerBookingScope = {
  organizationId: string;
  role: Role;
  courseIds: readonly string[];
  delegatedCourseIds?: readonly string[];
  propertyIds: readonly string[];
  canMutate: boolean;
  projectionVersion: typeof BOOKING_SCOPE_PROJECTION_VERSION;
  sourceVersion: string;
  generatedAt: string;
  expiresAt: string;
  freshness: "fresh";
};

export class BookingScopeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BookingScopeError";
  }
}

const ID = /^[A-Za-z0-9_-]{1,160}$/;
const id = (value: unknown) => {
  const normalized = typeof value === "string" ? value : "";
  return ID.test(normalized) ? normalized : "";
};
const version = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 1 ? Number(value) : 0;
const uniqueIds = (value: unknown) => {
  if (!Array.isArray(value)) throw new BookingScopeError("SCOPE_INVALID");
  const normalized = value.map(id);
  if (normalized.some((entry) => !entry))
    throw new BookingScopeError("SCOPE_INVALID");
  return [...new Set(normalized)].sort();
};
const source = (parts: unknown[]) =>
  createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");

export function derivePartnerBookingScope(
  input: BookingScopeInput,
): PartnerBookingScope {
  const callerUid = id(input.callerUid),
    bindingOrg = id(input.binding?.organizationId),
    membershipOrg = id(input.membership?.organizationId),
    organizationId = id(input.organization?.organizationId),
    membershipUid = id(input.membership?.uid),
    verifiedAuthUid = id(input.binding?.verifiedAuthUid);
  if (
    !callerUid ||
    !input.binding ||
    !input.membership ||
    !input.organization ||
    verifiedAuthUid !== callerUid ||
    membershipUid !== callerUid ||
    !bindingOrg ||
    bindingOrg !== membershipOrg ||
    bindingOrg !== organizationId
  )
    throw new BookingScopeError("AUTHORITY_MISMATCH");
  if (input.membership.status !== "active")
    throw new BookingScopeError("MEMBERSHIP_INACTIVE");
  if (input.organization.status !== "active")
    throw new BookingScopeError("ORGANIZATION_INACTIVE");
  const roleValue = String(input.membership.role || "");
  if (!PARTNER_BOOKING_ROLES.includes(roleValue as Role))
    throw new BookingScopeError("ROLE_INVALID");
  const role = roleValue as Role,
    authorized = uniqueIds(input.organization.authorizedCourseIds);
  if (!version(input.membership.version) || !version(input.organization.version))
    throw new BookingScopeError("SOURCE_VERSION_INVALID");

  const courseById = new Map(
    input.courses
      .map((course) => [id(course.courseId), course] as const)
      .filter(([courseId]) => Boolean(courseId)),
  );
  const activeOperatorIds = new Set(
    input.operators
      .filter(
        (operator) =>
          operator.status === "active" &&
          id(operator.organizationId) === organizationId &&
          version(operator.version) > 0,
      )
      .map((operator) => id(operator.courseId))
      .filter(Boolean),
  );
  const approved = authorized.filter(
    (courseId) => activeOperatorIds.has(courseId) && courseById.has(courseId),
  );
  let courseIds = approved;
  let delegatedCourseIds: readonly string[] | undefined;
  if (role === "course_staff") {
    if (!Array.isArray(input.membership.courseIds) || !input.membership.courseIds.length)
      throw new BookingScopeError("COURSE_GRANT_REQUIRED");
    const delegated = uniqueIds(input.membership.courseIds);
    courseIds = approved.filter((courseId) => delegated.includes(courseId));
    if (!courseIds.length) throw new BookingScopeError("COURSE_GRANT_UNAVAILABLE");
    delegatedCourseIds = Object.freeze([...courseIds]);
  }
  const propertyIds = [
    ...new Set(
      courseIds
        .map((courseId) => id(courseById.get(courseId)?.propertyId))
        .filter(Boolean),
    ),
  ].sort();
  const generatedAtMs = input.generatedAtMs ?? Date.now(),
    ttlMs = input.ttlMs ?? 5 * 60 * 1000;
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(ttlMs) || ttlMs <= 0)
    throw new BookingScopeError("FRESHNESS_INVALID");
  const sourceVersion = source([
    organizationId,
    version(input.organization.version),
    version(input.membership.version),
    role,
    authorized,
    courseIds,
    input.operators
      .map((operator) => [
        id(operator.courseId),
        id(operator.organizationId),
        operator.status,
        version(operator.version),
      ])
      .sort(),
    input.courses
      .map((course) => [
        id(course.courseId),
        id(course.propertyId),
        version(course.version),
      ])
      .sort(),
  ]);
  return Object.freeze({
    organizationId,
    role,
    courseIds: Object.freeze([...courseIds]),
    ...(delegatedCourseIds ? { delegatedCourseIds } : {}),
    propertyIds: Object.freeze(propertyIds),
    canMutate: ["primary_owner", "manager", "course_staff"].includes(role),
    projectionVersion: BOOKING_SCOPE_PROJECTION_VERSION,
    sourceVersion,
    generatedAt: new Date(generatedAtMs).toISOString(),
    expiresAt: new Date(generatedAtMs + ttlMs).toISOString(),
    freshness: "fresh",
  });
}
