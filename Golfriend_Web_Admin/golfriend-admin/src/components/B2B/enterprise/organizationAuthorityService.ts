import {getFunctions, httpsCallable} from "firebase/functions";
import {emptyUnavailableProjection, isEnterpriseAuthorityProjection, type AuthorityScope, type EnterpriseAuthorityProjection, type EnterpriseRole} from "./organizationAuthorityModel";

export const ORGANIZATION_AUTHORITY_CALLABLES = Object.freeze({
  projection: "getEnterpriseOrganizationAuthorityV2",
  invite: "inviteEnterpriseOrganizationStaffV2",
  acceptInvitation: "acceptEnterpriseOrganizationInvitationV2",
  revokeInvitation: "revokeEnterpriseOrganizationInvitationV2",
  revokeMembership: "revokeEnterpriseOrganizationMembershipV2",
  transferOwnership: "transferEnterpriseOrganizationOwnershipV2",
} as const);

export interface AuthorityCommandEnvelope {
  schema: "golfriend.enterprise-organization-authority.command.v1";
  commandId: string;
  organizationId: string;
  expectedVersion: number;
}

export interface AuthorityCommandResult {
  status: "accepted" | "pending";
  receiptId: string;
  authorityVersion: number;
}

export interface CourseIntakeCandidate {
  candidateId: string; version: number; status: string; name: string; city: string | null; country: string;
  coordinatesStatus: string; reviewDecisionId: string | null; reviewDecisionVersion: number | null;
}
export interface CourseIntakeProjection {
  schema: "golfriend.course-acquisition-dashboard.v1"; organizationId: string;
  mutationAllowed: boolean;
  quota: null | {configuredBudget:number; emergencyReserve:number; reserved:number; completed:number; failed:number; released:number};
  countries: Array<{country:string; canonical:number; active:number; fresh:number; missingCoordinates:number}>;
  candidates: CourseIntakeCandidate[];
}
export interface CourseIntakePlan {schema:"golfriend.course-acquisition-plan.v1"; providerCalls:0; writes:0; estimatedCalls:number}

type Callable = <T>(name: string, payload: Record<string, unknown>) => Promise<T>;
const firebaseCall: Callable = async <T>(name: string, payload: Record<string, unknown>) =>
  (await httpsCallable(getFunctions(), name)(payload)).data as T;
export const newAuthorityCommandId = () => crypto.randomUUID().replaceAll("-", "_");
const envelope = (organizationId: string, expectedVersion: number, stableCommandId = newAuthorityCommandId()): AuthorityCommandEnvelope => ({
  schema: "golfriend.enterprise-organization-authority.command.v1",
  commandId: stableCommandId, organizationId, expectedVersion,
});

export function createOrganizationAuthorityService(call: Callable = firebaseCall) {
  return {
    async load(selectedOrganizationId?: string): Promise<EnterpriseAuthorityProjection> {
      try {
        const result = await call<EnterpriseAuthorityProjection>(ORGANIZATION_AUTHORITY_CALLABLES.projection, selectedOrganizationId ? {selectedOrganizationId} : {});
        return isEnterpriseAuthorityProjection(result) ? result : emptyUnavailableProjection();
      } catch {
        return emptyUnavailableProjection();
      }
    },
    invite: (organizationId: string, expectedVersion: number, email: string, role: EnterpriseRole, scope: AuthorityScope, stableCommandId?: string) =>
      call<AuthorityCommandResult>(ORGANIZATION_AUTHORITY_CALLABLES.invite, {...envelope(organizationId, expectedVersion, stableCommandId), email, role, scope, expiresInDays: 7}),
    acceptInvitation: (invitationId: string, invitationVersion: number, stableCommandId = newAuthorityCommandId()) =>
      call<AuthorityCommandResult>(ORGANIZATION_AUTHORITY_CALLABLES.acceptInvitation, {schema: "golfriend.enterprise-organization-authority.invitation-accept.v1", commandId: stableCommandId, invitationId, invitationVersion}),
    revokeInvitation: (organizationId: string, expectedVersion: number, invitationId: string, invitationVersion: number, stableCommandId?: string) =>
      call<AuthorityCommandResult>(ORGANIZATION_AUTHORITY_CALLABLES.revokeInvitation, {...envelope(organizationId, expectedVersion, stableCommandId), invitationId, invitationVersion}),
    revokeMembership: (organizationId: string, expectedVersion: number, membershipId: string, membershipVersion: number, stableCommandId?: string) =>
      call<AuthorityCommandResult>(ORGANIZATION_AUTHORITY_CALLABLES.revokeMembership, {...envelope(organizationId, expectedVersion, stableCommandId), membershipId, membershipVersion}),
    approveOwnershipTransfer: (organizationId: string, expectedVersion: number, transferId: string, transferVersion: number, stableCommandId?: string) =>
      call<AuthorityCommandResult>(ORGANIZATION_AUTHORITY_CALLABLES.transferOwnership, {...envelope(organizationId, expectedVersion, stableCommandId), transferId, transferVersion}),
    async loadCourseIntake(organizationId: string): Promise<CourseIntakeProjection> {
      const value = await call<CourseIntakeProjection>("getCourseAcquisitionDashboard", {organizationId});
      if (value?.schema !== "golfriend.course-acquisition-dashboard.v1" || value.organizationId !== organizationId || typeof value.mutationAllowed !== "boolean" || !Array.isArray(value.candidates) || !Array.isArray(value.countries)) throw new Error("COURSE_INTAKE_PROJECTION_INVALID");
      return value;
    },
    async previewCourseIntake(organizationId: string, expectedVersion: number, coverage: unknown[], manual: unknown[]): Promise<CourseIntakePlan> {
      const value = await call<CourseIntakePlan>("previewCourseAcquisitionPlan", {...envelope(organizationId, expectedVersion), coverage, manual});
      if (value?.schema !== "golfriend.course-acquisition-plan.v1" || value.providerCalls !== 0 || value.writes !== 0) throw new Error("COURSE_INTAKE_PLAN_INVALID");
      return value;
    },
    decideCourseCandidate: (organizationId: string, expectedVersion: number, candidateId: string, candidateVersion: number, action: "confirm_new"|"reject", stableCommandId?: string) =>
      call<Record<string, unknown>>("decideCourseCandidate", {...envelope(organizationId, expectedVersion, stableCommandId), candidateId, candidateVersion, action, fieldChoices:{}}),
    publishCourseCandidate: (organizationId: string, expectedVersion: number, candidateId: string, candidateVersion: number, decisionId: string, decisionVersion: number, stableCommandId?: string) =>
      call<Record<string, unknown>>("publishCourseCandidate", {...envelope(organizationId, expectedVersion, stableCommandId), candidateId, candidateVersion, decisionId, decisionVersion, confirmed:true}),
  };
}

export const organizationAuthorityService = createOrganizationAuthorityService();
