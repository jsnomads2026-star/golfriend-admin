import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const src = readFileSync(
    resolve(process.cwd(), "src/enterpriseMemberCommissioningRuntime.ts"),
    "utf8",
  ),
  rules = readFileSync(
    resolve(process.cwd(), "../enterprise-authority.firestore.rules"),
    "utf8",
  ),
  index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
test("all eight callables require App Check and strict shared reviewer", () => {
  assert.equal(
    (src.match(/onCall\(\s*\{\s*enforceAppCheck:\s*true\s*\}/g) || []).length,
    8,
  );
  assert.equal(
    (src.match(/resolveEnterpriseMemberAdminReviewer/g) || []).length,
    8,
  );
});
test("legal content and automatic approval are absent", () => {
  assert.match(src, /legalTextStored:\s*false/);
  assert.match(src, /EXTERNAL_APPROVAL_UNAVAILABLE/);
  assert.match(src, /SEPARATION_OF_DUTIES/);
  assert.doesNotMatch(src, /legalText:|messageBody:|htmlBody:/);
  assert.match(src, /enterprise_member_template_approval_policies/);
  assert.match(src, /customerApprovalRequired:\s*ps\.customerApprovalRequired/);
});
test("provider dry run cannot call or transmit", () => {
  assert.match(src, /providerCalled:\s*false/);
  assert.match(src, /credentialsRead:\s*false/);
  assert.match(src, /messageRendered:\s*false/);
  assert.match(src, /destinationResolved:\s*false/);
  assert.match(src, /transmitted:\s*false/);
  assert.doesNotMatch(src, /sendMail|sendSms|messaging\(\)\.send|fetch\(/);
});
test("JHCC validator is non-live privacy-minimized", () => {
  const jhcc = src.slice(
    src.indexOf("validateEnterpriseMemberJHCCPortAdminV1"),
  );
  assert.match(jhcc, /validated_not_transmitted/);
  assert.match(jhcc, /endpointConfigured:\s*false/);
  assert.match(jhcc, /eventSetDigest/);
  assert.match(jhcc, /JHCC_SCHEMA_UNAVAILABLE/);
  assert.doesNotMatch(
    jhcc,
    /contactReference|destinationReference|csvRows|TeeBalance|wallet|ledger/,
  );
});
test("retirement is append-only and active artifact is not mutated", () => {
  assert.match(src, /enterprise_member_delivery_template_retirements/);
  assert.doesNotMatch(
    src,
    /collection\("enterprise_member_delivery_templates"\)[\s\S]{0,200}tx\.update/,
  );
});
test("replay commands and receipts are immutable", () => {
  assert.match(src, /COMMAND_REPLAY_CONFLICT/);
  assert.match(src, /commissioningCommandId/);
  assert.match(src, /immutable:\s*true/);
});
test("all direct collections are denied", () =>
  [
    "enterprise_member_template_approvals",
    "enterprise_member_template_approval_policies",
    "enterprise_member_delivery_template_retirements",
    "enterprise_member_commissioning_commands",
    "enterprise_member_commissioning_receipts",
    "enterprise_legal_approval_receipts",
    "enterprise_customer_template_approval_receipts",
    "enterprise_member_delivery_dry_runs",
    "enterprise_member_delivery_provider_compositions",
    "enterprise_member_jhcc_validations",
  ].forEach((x) => assert.match(rules, new RegExp(`match /${x}`))));
test("all callable exports are mounted", () =>
  [
    "getEnterpriseMemberCommissioningAdminV1",
    "proposeEnterpriseMemberDeliveryTemplateAdminV1",
    "recordEnterpriseMemberTemplateApprovalAdminV1",
    "activateEnterpriseMemberDeliveryTemplateAdminV1",
    "rejectEnterpriseMemberDeliveryTemplateAdminV1",
    "retireEnterpriseMemberDeliveryTemplateAdminV1",
    "runEnterpriseMemberDeliveryDryRunAdminV1",
    "validateEnterpriseMemberJHCCPortAdminV1",
  ].forEach((x) => assert.match(index, new RegExp(x))));
