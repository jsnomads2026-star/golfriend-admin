import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const src = readFileSync(
    resolve(process.cwd(), "src/enterpriseMemberAdminRuntime.ts"),
    "utf8",
  ),
  rules = readFileSync(
    resolve(process.cwd(), "../enterprise-authority.firestore.rules"),
    "utf8",
  ),
  index = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
test("Admin callables require App Check", () =>
  assert.equal(
    (src.match(/onCall\(\s*\{\s*enforceAppCheck:\s*true\s*\}/g) || []).length,
    6,
  ));
test("verified strict server Admin and separation", () => {
  assert.match(src, /email_verified\s*!==\s*true/);
  assert.match(src, /admin_users/);
  assert.match(src, /activeAdminRecord/);
  assert.match(src, /SEPARATION_OF_DUTIES/);
});
test("provider cannot claim delivery consent or membership", () => {
  assert.match(
    src,
    /providerConfigured:\s*false[\s\S]*sent:\s*false[\s\S]*delivered:\s*false[\s\S]*consentAccepted:\s*false[\s\S]*membershipActivated:\s*false/,
  );
  assert.doesNotMatch(src, /sendMail|sendSms|messaging\(\)\.send/);
});
test("privacy and economy minimized", () => {
  assert.match(src, /internalNotesExcluded:\s*true/);
  assert.match(src, /contactDataExcluded:\s*true/);
  assert.match(src, /economyEvent:\s*false/);
  assert.match(src, /transmitted:\s*false/);
  assert.doesNotMatch(
    src,
    /applicantEmail|phoneNumber|messageBody|providerSecret|TeeBalance|wallet/,
  );
});
test("replay stale DNC template failures", () =>
  [
    "COMMAND_REPLAY_CONFLICT",
    "STALE_REQUEST",
    "DELIVERY_SUPPRESSED",
    "TEMPLATE_UNAVAILABLE",
    "CSV_PREVIEW_STALE",
  ].forEach((x) => assert.match(src, new RegExp(x))));
test("rules deny producer collections", () =>
  [
    "enterprise_member_admin_commands",
    "enterprise_member_admin_receipts",
    "enterprise_member_delivery_outbox",
    "enterprise_member_delivery_workflows",
    "enterprise_member_delivery_templates",
    "enterprise_member_delivery_policies",
    "enterprise_member_delivery_suppressions",
    "enterprise_member_report_ready_events",
  ].forEach((x) => assert.match(rules, new RegExp(`match /${x}`))));
test("callable exports", () =>
  [
    "getEnterpriseMemberRequestsAdminV1",
    "getEnterpriseMemberRequestAdminV1",
    "decideEnterpriseMemberRequestAdminV1",
    "resolveEnterpriseMemberCsvConflictsAdminV1",
    "prepareEnterpriseMemberDeliveryAdminV1",
    "getEnterpriseMemberDeliveryOutboxAdminV1",
  ].forEach((x) => assert.match(index, new RegExp(x))));
