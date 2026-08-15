export const ORGANIZATION_AUTHORITY_SCHEMA = "golfriend.enterprise-organization-authority.v1" as const;
export const INVITATION_TTL_DAYS = 7 as const;

export type EnterpriseRole =
  | "organization_owner"
  | "organization_admin"
  | "course_manager"
  | "booking_staff"
  | "tournament_staff"
  | "marketing_content_staff"
  | "analyst_viewer";

export type AuthorityScope =
  | {kind: "organization"; organizationId: string}
  | {kind: "course"; organizationId: string; propertyId: string; courseId: string};

export type OrganizationStatus = "pending" | "active" | "suspended" | "unavailable";
export type MembershipStatus = "pending" | "active" | "suspended" | "revoked";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked" | "unavailable";

export interface EnterpriseCourseProjection {
  courseId: string;
  propertyId: string;
  organizationId: string;
  displayName: string;
  status: OrganizationStatus;
}

export interface EnterprisePropertyProjection {
  propertyId: string;
  organizationId: string;
  displayName: string;
  status: OrganizationStatus;
  courses: EnterpriseCourseProjection[];
}

export interface EnterpriseOrganizationProjection {
  organizationId: string;
  displayName: string;
  status: OrganizationStatus;
  version: number;
  properties: EnterprisePropertyProjection[];
}

export interface StaffMembershipProjection {
  membershipId: string;
  organizationId: string;
  verifiedStaffId: string;
  role: EnterpriseRole;
  scope: AuthorityScope;
  status: MembershipStatus;
  version: number;
}

export interface StaffInvitationProjection {
  invitationId: string;
  organizationId: string;
  role: EnterpriseRole;
  scope: AuthorityScope;
  status: InvitationStatus;
  version: number;
  expiresAt: string;
  retryable: boolean;
}

export interface OwnershipTransferProjection {
  transferId: string;
  organizationId: string;
  outgoingOwnerApprovedAt?: string;
  incomingOwnerApprovedAt?: string;
  actorApproval: "outgoing_owner" | "incoming_owner" | null;
  status: "pending_outgoing" | "pending_incoming" | "approved" | "expired" | "revoked" | "unavailable";
  version: number;
}

export interface ImmutableAuthorityReceipt {
  receiptId: string;
  commandId: string;
  organizationId: string;
  action: string;
  actorMembershipId: string;
  occurredAt: string;
  authorityVersion: number;
  immutable: true;
}

export interface EnterpriseAuthorityProjection {
  schema: typeof ORGANIZATION_AUTHORITY_SCHEMA;
  selectedOrganizationId: string | null;
  actorMembershipIds: string[];
  organizations: EnterpriseOrganizationProjection[];
  memberships: StaffMembershipProjection[];
  invitations: StaffInvitationProjection[];
  ownershipTransfers: OwnershipTransferProjection[];
  receipts: ImmutableAuthorityReceipt[];
  producerStatus: "available" | "unavailable";
}

export const ROLE_GRANT_RANK: Readonly<Record<EnterpriseRole, number>> = Object.freeze({
  organization_owner: 70,
  organization_admin: 60,
  course_manager: 50,
  booking_staff: 40,
  tournament_staff: 40,
  marketing_content_staff: 40,
  analyst_viewer: 10,
});

export type OperationalCapability = "booking" | "tournament" | "marketing_content" | "analytics";

export const ROLE_OPERATIONAL_CAPABILITIES: Readonly<Record<EnterpriseRole, readonly OperationalCapability[]>> = Object.freeze({
  organization_owner: [],
  organization_admin: [],
  course_manager: ["booking", "tournament", "marketing_content", "analytics"],
  booking_staff: ["booking"],
  tournament_staff: ["tournament"],
  marketing_content_staff: ["marketing_content"],
  analyst_viewer: ["analytics"],
});

export function isCourseScopedRole(role: EnterpriseRole): boolean {
  return role !== "organization_owner" && role !== "organization_admin";
}

export function canGrantRole(actor: StaffMembershipProjection, targetRole: EnterpriseRole, targetScope: AuthorityScope): boolean {
  if (actor.status !== "active" || actor.organizationId !== targetScope.organizationId) return false;
  if (ROLE_GRANT_RANK[actor.role] <= ROLE_GRANT_RANK[targetRole]) return false;
  if (isCourseScopedRole(targetRole) !== (targetScope.kind === "course")) return false;
  if (actor.scope.kind === "course") {
    return targetScope.kind === "course" && actor.scope.courseId === targetScope.courseId && actor.scope.propertyId === targetScope.propertyId;
  }
  return true;
}

export function canOperateCourse(
  membership: StaffMembershipProjection,
  course: EnterpriseCourseProjection,
  capability: OperationalCapability,
): boolean {
  return membership.status === "active"
    && course.status === "active"
    && membership.organizationId === course.organizationId
    && membership.scope.kind === "course"
    && membership.scope.propertyId === course.propertyId
    && membership.scope.courseId === course.courseId
    && ROLE_OPERATIONAL_CAPABILITIES[membership.role].includes(capability);
}

export function selectOrganization(projection: EnterpriseAuthorityProjection, organizationId: string): EnterpriseAuthorityProjection {
  const authorized = projection.memberships.some((item) => projection.actorMembershipIds.includes(item.membershipId) && item.organizationId === organizationId && item.status === "active");
  const organization = projection.organizations.find((item) => item.organizationId === organizationId);
  if (!authorized || !organization || organization.status !== "active" || projection.producerStatus !== "available") {
    return {...projection, selectedOrganizationId: null};
  }
  return {...projection, selectedOrganizationId: organizationId};
}

export function invitationIsUsable(invitation: StaffInvitationProjection, now: Date): boolean {
  return invitation.status === "pending" && Date.parse(invitation.expiresAt) > now.getTime();
}

export function emptyUnavailableProjection(): EnterpriseAuthorityProjection {
  return {schema: ORGANIZATION_AUTHORITY_SCHEMA, selectedOrganizationId: null, actorMembershipIds: [], organizations: [], memberships: [], invitations: [], ownershipTransfers: [], receipts: [], producerStatus: "unavailable"};
}

export function isEnterpriseAuthorityProjection(value: unknown): value is EnterpriseAuthorityProjection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EnterpriseAuthorityProjection>;
  if (!(item.schema === ORGANIZATION_AUTHORITY_SCHEMA
    && item.producerStatus === "available"
    && (typeof item.selectedOrganizationId === "string" || item.selectedOrganizationId === null)
    && Array.isArray(item.actorMembershipIds)
    && item.actorMembershipIds.every((id) => typeof id === "string" && id.length > 0)
    && Array.isArray(item.organizations)
    && Array.isArray(item.memberships)
    && Array.isArray(item.invitations)
    && Array.isArray(item.ownershipTransfers)
    && Array.isArray(item.receipts))) return false;
  const organizations = item.organizations;
  const memberships = item.memberships;
  return item.organizations.every((organization) => typeof organization?.organizationId === "string" && organization.organizationId.length > 0 && Number.isInteger(organization?.version)
      && Array.isArray(organization.properties) && organization.properties.every((property) => property.organizationId === organization.organizationId && typeof property.propertyId === "string" && property.propertyId.length > 0
        && Array.isArray(property.courses) && property.courses.every((course) => course.organizationId === organization.organizationId && course.propertyId === property.propertyId && typeof course.courseId === "string" && course.courseId.length > 0)))
    && item.memberships.every((membership) => typeof membership?.membershipId === "string" && typeof membership?.organizationId === "string"
      && Object.hasOwn(ROLE_GRANT_RANK, membership.role) && scopeMatchesHierarchy(organizations, membership.scope, membership.organizationId))
    && item.actorMembershipIds.every((id) => memberships.some((membership) => membership.membershipId === id && membership.status === "active"))
    && item.invitations.every((invitation) => typeof invitation?.invitationId === "string" && typeof invitation?.expiresAt === "string" && !Number.isNaN(Date.parse(invitation.expiresAt))
      && Object.hasOwn(ROLE_GRANT_RANK, invitation.role) && scopeMatchesHierarchy(organizations, invitation.scope, invitation.organizationId))
    && item.ownershipTransfers.every((transfer) => typeof transfer?.transferId === "string"
      && (transfer.actorApproval === "outgoing_owner" || transfer.actorApproval === "incoming_owner" || transfer.actorApproval === null))
    && item.receipts.every((receipt) => receipt?.immutable === true && typeof receipt?.receiptId === "string");
}

function scopeMatchesHierarchy(organizations: EnterpriseOrganizationProjection[], scope: AuthorityScope, organizationId: string): boolean {
  if (!scope || scope.organizationId !== organizationId) return false;
  const organization = organizations.find((candidate) => candidate.organizationId === organizationId);
  if (!organization) return false;
  if (scope.kind === "organization") return true;
  return organization.properties.some((property) => property.propertyId === scope.propertyId
    && property.courses.some((course) => course.courseId === scope.courseId));
}
