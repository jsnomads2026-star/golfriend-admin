import { functions } from '../../../firebaseConfig';
import {httpsCallable} from "firebase/functions";
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

type Callable = <T>(name: string, payload: Record<string, unknown>) => Promise<T>;
const firebaseCall: Callable = async <T>(name: string, payload: Record<string, unknown>) =>
  (await httpsCallable(functions, name)(payload)).data as T;
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
  };
}

export const organizationAuthorityService = createOrganizationAuthorityService();
