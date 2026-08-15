import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const dashboard=read("src/components/B2B/EnterpriseDashboard.tsx");
const mount=read("src/components/B2B/enterpriseCourseMember/EnterpriseCourseMemberOperations.tsx");
const profile=read("src/components/B2B/enterpriseCourseProfile/EnterpriseCourseProfileOperations.tsx");
const member=read("src/components/B2B/enterpriseMemberLinking/EnterpriseMemberLinking.tsx");
const profileCopy=read("src/i18n/partner/enterpriseCourseProfile.ts");
const memberCopy=read("src/i18n/partner/enterpriseMemberLinking.ts");
const checks=[
 ["mounted course/member surface",dashboard.includes("<EnterpriseCourseMemberOperations")],
 ["legacy organization panel is not mounted",!dashboard.includes("<OrgProfile")],
 ["GF-EN-004 stable ID scope",mount.includes("organizationId")&&mount.includes("propertyId")&&mount.includes("courseId")],
 ["course-scoped actor membership",mount.includes('member.scope.kind==="course"')],
 ["canonical profile ID presented",profile.includes("copy.canonical")&&profile.includes("context?.courseId")],
 ["approved profile remains visible",profile.includes("projection?.approvedProfile")],
 ["all eight profile locales edited",profile.includes("ENTERPRISE_COURSE_PROFILE_LOCALES.map")],
 ["known golfer only",member.includes("knownGolferId")&&!member.includes("searchUsers")],
 ["explicit consent boundary",member.includes("copy.consent")],
 ["course suspension reaches member context",member.includes("courseStatus:course?.status")],
 ["immutable consent receipts presented",member.includes("projection.receipts.map")],
 ["localized accessible action",member.includes("scopeCopy.action")],
 ["honest producer unavailable",member.includes("MEMBER_LINKING_PRODUCER_UNAVAILABLE")&&profile.includes("state===\"unavailable\"")],
 ["eight profile copy records",["en","th","ko","ja","zh","es","fr","de"].every(locale=>profileCopy.includes(`${locale}:`))],
 ["eight member copy records",["en","th","ko","ja","zh","es","fr","de"].every(locale=>memberCopy.includes(`${locale}:`))],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log(`PASS ${name}`)}
console.log(`${checks.length}/${checks.length} enterprise course/member UI checks passed`);
