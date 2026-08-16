import assert from "node:assert/strict";
import {ENTERPRISE_ROLES, REMOVAL_REASONS, isCommandId, isEnterpriseRole, isRemovalReason, rejectSurplus, removalFingerprint} from "./enterpriseCourseIntakeSecurity.js";

let checks=0;
for(const role of ENTERPRISE_ROLES){assert.equal(isEnterpriseRole(role),true);checks++}
for(const role of ["Director","Partner","admin","",null]){assert.equal(isEnterpriseRole(role),false);checks++}
for(const reason of REMOVAL_REASONS){assert.equal(isRemovalReason(reason),true);checks++}
for(const reason of ["because","Access_Review","",null]){assert.equal(isRemovalReason(reason),false);checks++}
assert.equal(isCommandId("remove_123456"),true);checks++;
for(const id of ["short","has space","",null]){assert.equal(isCommandId(id),false);checks++}
assert.deepEqual(Object.keys(rejectSurplus({action:"remove",staffUid:"u",reason:"access_review",commandId:"remove_123456"},"remove")).sort(),["action","commandId","reason","staffUid"]);checks++;
for(const extra of ["organizationId","membershipVersion","role","status"]){assert.throws(()=>rejectSurplus({action:"remove",staffUid:"u",reason:"access_review",commandId:"remove_123456",[extra]:"forged"},"remove"),/SURPLUS_FIELD/);checks++}
const base={enterpriseUid:"ent",organizationId:"org",staffUid:"staff",membershipVersion:2,reason:"access_review",commandId:"remove_123456"};
assert.equal(removalFingerprint(base),removalFingerprint(base));checks++;
assert.notEqual(removalFingerprint(base),removalFingerprint({...base,reason:"security_concern"}));checks++;
console.log(`Enterprise Course Intake security PASS: ${checks}/${checks}`);
