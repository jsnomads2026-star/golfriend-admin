import EnterpriseAuthorityPortal from '../enterpriseAuthority/EnterpriseAuthorityPortal';

// EnterpriseAuthorityPortal is the single staff-authority presentation. It
// owns organization/property/course scopes, canonical roles, versioned
// invitations and revocations, ownership transfers, and audited receipts.
export default function StaffRoles(_props: {partnerUid: string}) {
  return <EnterpriseAuthorityPortal />;
}
