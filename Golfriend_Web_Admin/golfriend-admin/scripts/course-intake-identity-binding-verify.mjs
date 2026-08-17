import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../functions/src/enterpriseMembershipRegistry.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/B2B/enterprise/StaffRoles.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/components/B2B/enterprise/organizationAuthorityService.ts', import.meta.url), 'utf8');
const invariants = [
  [runtime, /request\.auth\.uid/],
  [runtime, /email_verified === true/],
  [runtime, /pData\?\.status === 'active_partner'[\s\S]*?pData\?\.tier === 'enterprise'/],
  [runtime, /actorOrganizationId = String\(pData\?\.organizationId \|\| pSnap\.id\)/],
  [runtime, /MEMBERSHIP_REGISTRY_COLLECTION/],
  [registry, /record\.enterpriseUid !== input\.callerUid/],
  [registry, /record\.organizationId !== input\.callerOrganizationId/],
  [runtime, /enforceAppCheck: true/],
];
let checks = 0;
for (const [source, pattern] of invariants) { assert.match(source, pattern); checks += 1; }
assert.match(ui, /return <EnterpriseAuthorityPortal \/>/); checks += 1;
assert.match(service, /revokeMembership:[\s\S]*?\.\.\.envelope\(organizationId, expectedVersion[\s\S]*?membershipId, membershipVersion/); checks += 1;
assert.doesNotMatch(`${ui}\n${service}`, /setDoc\(|updateDoc\(|deleteDoc\(/); checks += 1;
console.log(`Course Intake identity binding PASS: ${checks}/${checks}`);
