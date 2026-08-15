import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ui = read(
    "src/components/B2B/enterpriseCourseMembers/EnterpriseCourseMemberManagement.tsx",
  ),
  service = read(
    "src/components/B2B/enterpriseCourseMembers/enterpriseCourseMemberService.ts",
  ),
  copy = read("src/i18n/partner/enterpriseCourseMembers.ts"),
  mount = read(
    "src/components/B2B/enterpriseCourseMember/EnterpriseCourseMemberOperations.tsx",
  );
const checks = [
  [
    "mounted on active dashboard course operations",
    mount.includes("<EnterpriseCourseMemberManagement"),
  ],
  [
    "course-only discovery warning",
    copy.includes("not Golfriend user discovery") &&
      !service.includes("searchUsers"),
  ],
  [
    "exact authority scope",
    ["actorMembershipId", "organizationId", "propertyId", "courseId"].every(
      (x) => service.includes(x),
    ),
  ],
  [
    "server filtering and opaque paging",
    service.includes("cursor") &&
      service.includes("filter") &&
      ui.includes("nextCursor"),
  ],
  [
    "all member states",
    [
      "invitation_draft",
      "awaiting_delivery_provider",
      "invited",
      "joined",
      "active",
      "inactive",
      "change_requested",
      "conflict_review",
      "unavailable",
    ].every((x) => service.includes(x) && copy.includes(x)),
  ],
  [
    "producer contract compatibility",
    [
      "getEnterpriseCourseMembersV1",
      "getEnterpriseCourseMemberV1",
      "createEnterpriseMemberInvitationDraftV1",
      "createEnterpriseMemberResendDraftV1",
      "submitEnterpriseMemberInvitationRequestV1",
      "submitEnterpriseMemberChangeRequestV1",
      "previewEnterpriseMemberCsvImportV1",
      "submitEnterpriseMemberCsvImportRequestV1",
    ].every((x) => service.includes(x)),
  ],
  [
    "projection contract compatibility",
    [
      "context",
      "state",
      "entitlement",
      "courseVersion",
      "members",
      "nextCursor",
      "requests",
      "receipts",
      "deliveryProviderStatus",
      "policy",
    ].every((x) => service.includes(x)),
  ],
  [
    "honest delivery boundary",
    copy.includes("sends no notification") &&
      copy.includes("creates no Auth account"),
  ],
  [
    "no direct datastore or auth creation",
    !service.includes("firestore") &&
      !service.includes("createUser") &&
      !ui.includes("sendEmail"),
  ],
  [
    "stable retry command IDs",
    ui.includes("commands.current") && ui.includes("stable("),
  ],
  [
    "csv bounded preview and confirmation",
    ui.includes("maxLength={65536}") &&
      /previewId:\s*preview\.previewId/.test(ui) &&
      /confirmed:\s*true/.test(ui) &&
      copy.includes("Maximum 100 rows"),
  ],
  [
    "invitation draft explicitly submitted",
    ui.includes("draftResult.version") &&
      service.includes("submitEnterpriseMemberInvitationRequestV1"),
  ],
  [
    "accessible directory and live states",
    ui.includes('role="region"') &&
      ui.includes("aria-live") &&
      ui.includes('<th scope="row"'),
  ],
  ["48px controls", /minHeight:\s*48/.test(ui)],
  [
    "loading empty offline unavailable retry",
    ["loading", "empty", "offline", "unavailable", "retry"].every((x) =>
      copy.includes(`${x}:`),
    ),
  ],
  [
    "eight exact locales",
    ["en", "th", "ko", "ja", "zh", "es", "fr", "de"].every((x) =>
      copy.includes(`\"${x}\"`),
    ),
  ],
  [
    "independent localized records without English fill",
    !copy.includes("...en, ...") &&
      (copy.match(/= record\(/g) || []).length === 8,
  ],
  [
    "privacy-safe resend shape",
    ui.includes("currentMemberVersion: m.version") &&
      !ui.includes("contactReference: m.memberReference"),
  ],
  [
    "preview command rotates only after validation",
    /validCsvPreview\(next, view\.courseVersion\)[\s\S]{0,180}commands\.current\.delete\("preview"\);[\s\S]{0,100}\} catch/.test(ui),
  ],
];
for (const [n, ok] of checks) {
  assert.ok(ok, n);
  console.log(`PASS ${n}`);
}
console.log(
  `${checks.length}/${checks.length} member-management UI checks passed`,
);
