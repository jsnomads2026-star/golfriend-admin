import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
const requiredSecurityInvariants = [
  /Object\.keys\(payload\)\.filter[\s\S]*?ALLOWED_FIELDS\[action\]/,
  /REMOVAL_REASONS\.join/,
  /removalFingerprint\(/,
  /tx\.create\(removalAuditRef/,
  /tx\.set\(targetRef,\s*\{\s*status:\s*'removed'/s,
  /tx\.set\(removalRegistryRef,\s*\{[\s\S]*?status:\s*'removed'/,
  /if \(priorAudit\.exists\)/,
  /currentData\.enterpriseUid[\s\S]*?callerUid/,
  /currentData\.organizationId[\s\S]*?actorOrganizationId/,
];

let checks = 0;
for (const invariant of requiredSecurityInvariants) {
  assert.match(source, invariant);
  checks += 1;
}
assert.doesNotMatch(source, /membersCol\.doc\(staffUid\)\.delete/);
checks += 1;

console.log(`Course Intake security regression PASS: ${checks}/${checks}`);
