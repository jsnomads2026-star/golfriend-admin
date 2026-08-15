import type {AuthorityScope, EnterpriseRole} from "./organizationAuthorityModel.ts";

export const MEMBER_LINKING_SCHEMA = "golfriend.enterprise-member-linking.v1" as const;
export type MemberLinkState = "invited" | "accepted" | "declined" | "expired" | "revoked" | "unlinked";
export type MemberLinkingViewState = "loading" | "empty" | "current" | "stale" | "suspended" | "unavailable";

export interface MemberLinkingContext {
  actorMembershipId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  role: EnterpriseRole;
  scope: AuthorityScope;
  organizationStatus: "pending" | "active" | "suspended" | "unavailable";
  courseStatus: "pending" | "active" | "suspended" | "unavailable";
}

/** Minimum Portal projection: deliberately excludes private profile, notes, location, friends and bookings. */
export interface ConsentedMemberLink {
  linkId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  memberReference: string;
  golferDisplayLabel: string;
  state: MemberLinkState;
  consentVersion: number;
  expiresAt: string | null;
  updatedAt: string;
}

export interface ImmutableConsentReceipt {
  receiptId: string;
  linkId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  action: "invited" | "accepted" | "declined" | "expired" | "revoked" | "unlinked";
  consentVersion: number;
  actorKind: "verified_golfer" | "verified_course_staff" | "system";
  occurredAt: string;
  immutable: true;
}

export interface MemberLinkingProjection {
  schema: typeof MEMBER_LINKING_SCHEMA;
  producerSchema: typeof MEMBER_LINKING_SCHEMA;
  state: MemberLinkingViewState;
  sourceUpdatedAt: string | null;
  retryable: boolean;
  supportReference: string | null;
  links: readonly ConsentedMemberLink[];
  receipts: readonly ImmutableConsentReceipt[];
}

export interface InviteKnownGolferCommand {
  commandId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  knownGolferId: string;
  consentVersion: number;
}

export interface UnlinkMemberCommand {
  commandId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  linkId: string;
  consentVersion: number;
}

export function hasExactMemberLinkingScope(context: MemberLinkingContext): boolean {
  return context.organizationStatus === "active" && context.courseStatus === "active"
    && context.role === "course_manager"
    && context.scope.kind === "course"
    && context.scope.organizationId === context.organizationId
    && context.scope.propertyId === context.propertyId
    && context.scope.courseId === context.courseId;
}

export function unavailableMemberLinkingProjection(supportReference = "GF-EN-006:MEMBER_LINKING_PRODUCER_UNAVAILABLE"): MemberLinkingProjection {
  return Object.freeze({schema: MEMBER_LINKING_SCHEMA, producerSchema: MEMBER_LINKING_SCHEMA, state: "unavailable", sourceUpdatedAt: null, retryable: true, supportReference, links: Object.freeze([]), receipts: Object.freeze([])});
}
