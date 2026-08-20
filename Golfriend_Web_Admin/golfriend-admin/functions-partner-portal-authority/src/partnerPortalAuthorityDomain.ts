export const PARTNER_PORTAL_REGION = "asia-southeast1";

const PARTNER_ROLES = [
  "primary_owner",
  "manager",
  "course_staff",
  "support",
  "analyst",
] as const;

export type PartnerRole = (typeof PARTNER_ROLES)[number];

export type PartnerPortalDenialCode =
  | "PARTNER_CONTEXT_UNLINKED"
  | "PARTNER_CONTEXT_PENDING"
  | "PARTNER_CONTEXT_INACTIVE"
  | "PARTNER_CONTEXT_UNAUTHORIZED";

export interface PartnerIdentityBinding {
  organizationId?: unknown;
  verifiedAuthUid?: unknown;
}

export interface PartnerMembership {
  organizationId?: unknown;
  uid?: unknown;
  role?: unknown;
  status?: unknown;
}

export interface PartnerOrganization {
  organizationId?: unknown;
  status?: unknown;
}

export interface PartnerPortalContext {
  organizationId: string;
  membershipRole: PartnerRole;
  approvalState: "approved";
  capabilities: readonly string[];
}

export type PartnerPortalContextResolution =
  | {kind: "approved"; context: PartnerPortalContext}
  | {kind: "denied"; code: PartnerPortalDenialCode};

const ROLE_CAPABILITIES: Readonly<Record<PartnerRole, readonly string[]>> = {
  primary_owner: [
    "partner_portal.context.read",
    "partner_organization.read",
    "partner_organization.manage",
    "partner_onboarding.read",
    "partner_support.read",
    "partner_support.write",
  ],
  manager: [
    "partner_portal.context.read",
    "partner_organization.read",
    "partner_onboarding.read",
    "partner_support.read",
    "partner_support.write",
  ],
  course_staff: [
    "partner_portal.context.read",
    "partner_organization.read",
    "partner_onboarding.read",
    "partner_support.read",
    "partner_support.write",
  ],
  support: [
    "partner_portal.context.read",
    "partner_support.read",
    "partner_support.write",
  ],
  analyst: [
    "partner_portal.context.read",
    "partner_organization.read",
    "partner_onboarding.read",
  ],
};

function isPartnerRole(value: unknown): value is PartnerRole {
  return typeof value === "string" && PARTNER_ROLES.includes(value as PartnerRole);
}

function isActive(value: unknown): boolean {
  return value === "active";
}

export function resolvePartnerPortalContext(input: {
  uid: string;
  binding: PartnerIdentityBinding | null;
  membership: PartnerMembership | null;
  organization: PartnerOrganization | null;
}): PartnerPortalContextResolution {
  const {uid, binding, membership, organization} = input;

  if (binding === null) {
    return {kind: "denied", code: "PARTNER_CONTEXT_UNLINKED"};
  }

  const organizationId = binding.organizationId;
  if (typeof organizationId !== "string" || organizationId.length === 0 ||
      binding.verifiedAuthUid !== uid) {
    return {kind: "denied", code: "PARTNER_CONTEXT_UNAUTHORIZED"};
  }

  if (membership === null || membership.status === "pending") {
    return {kind: "denied", code: "PARTNER_CONTEXT_PENDING"};
  }

  if (membership.organizationId !== organizationId || membership.uid !== uid ||
      !isPartnerRole(membership.role)) {
    return {kind: "denied", code: "PARTNER_CONTEXT_UNAUTHORIZED"};
  }

  if (organization === null || organization.organizationId !== organizationId) {
    return {kind: "denied", code: "PARTNER_CONTEXT_UNAUTHORIZED"};
  }

  if (!isActive(membership.status)) {
    return {kind: "denied", code: "PARTNER_CONTEXT_PENDING"};
  }

  if (!isActive(organization.status)) {
    return {kind: "denied", code: "PARTNER_CONTEXT_INACTIVE"};
  }

  return {
    kind: "approved",
    context: {
      organizationId,
      membershipRole: membership.role,
      approvalState: "approved",
      capabilities: ROLE_CAPABILITIES[membership.role],
    },
  };
}
