import EnterpriseAuthorityPortal from '../enterpriseAuthority/EnterpriseAuthorityPortal';

// Preserve the Portal line's organization, property and course scopes. Staff
// mutations remain server-confirmed; the integrated intake security validates
// removal commands and audit fingerprints in Functions.
export default function StaffRoles(_props: {partnerUid: string}) {
  return <EnterpriseAuthorityPortal />;
}
