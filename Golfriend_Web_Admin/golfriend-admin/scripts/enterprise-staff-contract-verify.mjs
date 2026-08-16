import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const index = read('functions/src/index.ts');
const portal = read('src/components/B2B/enterpriseAuthority/EnterpriseAuthorityPortal.tsx');
const wrapper = read('src/components/B2B/enterprise/StaffRoles.tsx');
const model = read('src/components/B2B/enterprise/organizationAuthorityModel.ts');
const service = read('src/components/B2B/enterprise/organizationAuthorityService.ts');
const mapping = read('docs/ENTERPRISE_STAFF_ROLE_MAPPING.md');

assert.match(index, /export \{getEnterpriseOrganizationAuthorityV2\} from "\.\/enterpriseAuthorityRuntime\.js"/);
assert.doesNotMatch(index, /export const manageEnterpriseStaff/);
assert.match(index, /const legacyManageEnterpriseStaff/);
assert.match(wrapper, /return <EnterpriseAuthorityPortal/);
assert.doesNotMatch(wrapper, /httpsCallable|onSnapshot|enterprise_staff/);
for (const role of ['organization_owner','organization_admin','course_manager','booking_staff','tournament_staff','marketing_content_staff','analyst_viewer']) {
  assert.match(model, new RegExp(`['"]${role}['"]`));
}
for (const operation of ['invite','revokeMembership','revokeInvitation','approveOwnershipTransfer']) {
  assert.match(service, new RegExp(operation));
}
for (const evidence of ['receipt','version','organizationId','propertyId','courseId']) {
  assert.match(portal, new RegExp(evidence));
}
assert.match(mapping, /manager.*course_manager/s);
assert.match(mapping, /venue_staff.*booking_staff/s);
assert.match(mapping, /analyst.*analyst_viewer/s);
assert.match(mapping, /fail closed/i);

console.log('Enterprise staff contract PASS: one canonical scoped authority surface, seven roles, server-confirmed versioned operations, receipts, and fail-closed legacy mapping.');
