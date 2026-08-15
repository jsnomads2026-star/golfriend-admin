import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAdminRecord,
  adminCommandDocumentId,
  adminReceiptId,
  ADMIN_DECISIONS,
  ADMIN_MEMBER_SCHEMA,
  decisionAllowed,
  LOCALES,
  MAX_BATCH_ROWS,
  normalizeCsvResolutions,
  normalizeDecision,
  normalizeDelivery,
  outboxId,
  unconfiguredDeliveryProvider,
} from "./enterpriseMemberAdminDomain.js";
test("schema and eight locales", () => {
  assert.equal(
    ADMIN_MEMBER_SCHEMA,
    "golfriend.enterprise-member-admin-resolution.v1",
  );
  assert.equal(LOCALES.length, 8);
});
test("strict effective Admin authority", () => {
  assert.equal(
    activeAdminRecord({
      role: "partner_reviewer",
      status: "active",
      enabled: true,
    }),
    true,
  );
  assert.equal(
    activeAdminRecord({ role: "Support", status: "active", enabled: true }),
    false,
  );
  assert.equal(
    activeAdminRecord({
      role: "partner_reviewer",
      status: "active",
      enabled: true,
      suspendedAt: "x",
    }),
    false,
  );
  assert.equal(
    activeAdminRecord({
      role: "partner_reviewer",
      status: "active",
      enabled: true,
      expiresAt: "2000-01-01",
    }),
    false,
  );
});
test("decision allowlist and hostile shapes", () => {
  assert.equal(
    normalizeDecision({
      decision: "reject",
      reason: "policy",
      existingMemberReference: null,
      policyVersion: "policy_1",
      evidenceDigest: "a".repeat(64),
    }).decision,
    "reject",
  );
  assert.throws(
    () =>
      normalizeDecision({
        decision: "approve_delivery",
        reason: "",
        policyVersion: "policy_1",
        evidenceDigest: "a".repeat(64),
        role: "admin",
      }),
    /UNDECLARED/,
  );
  assert.throws(
    () =>
      normalizeDecision({
        decision: "link_existing",
        reason: "ok",
        policyVersion: "policy_1",
        evidenceDigest: "a".repeat(64),
      }),
    /MEMBER_REFERENCE/,
  );
});
test("terminal and conflict transitions", () => {
  assert.equal(
    decisionAllowed("conflict_review", "mark_duplicate"),
    "conflict_review",
  );
  assert.throws(
    () => decisionAllowed("resolved", "approve_delivery"),
    /TERMINAL/,
  );
  assert.throws(
    () => decisionAllowed("change_requested", "mark_duplicate"),
    /TRANSITION/,
  );
});
test("delivery template locale binding", () => {
  assert.equal(
    normalizeDelivery({
      channel: "email",
      templateId: "invite_1",
      templateVersion: "v1_1",
      locale: "th",
      legalBasisReference: "basis_1",
    }).locale,
    "th",
  );
  assert.throws(() =>
    normalizeDelivery({
      channel: "email",
      templateId: "invite_1",
      templateVersion: "v1_1",
      locale: "it",
      legalBasisReference: "basis_1",
    }),
  );
  assert.throws(
    () =>
      normalizeDelivery({
        channel: "email",
        templateId: "invite_1",
        templateVersion: "v1_1",
        locale: "en",
        legalBasisReference: "basis_1",
        body: "secret",
      }),
    /UNDECLARED/,
  );
});
test("CSV bounded explicit unique", () => {
  assert.equal(
    normalizeCsvResolutions([{ row: 1, decision: "reject" }]).length,
    1,
  );
  assert.throws(
    () =>
      normalizeCsvResolutions(
        Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => ({
          row: i + 1,
          decision: "reject",
        })),
      ),
    /BATCH/,
  );
  assert.throws(
    () =>
      normalizeCsvResolutions([
        { row: 1, decision: "reject" },
        { row: 1, decision: "reject" },
      ]),
    /ROW/,
  );
});
test("stable replay identifiers", () => {
  assert.equal(
    adminCommandDocumentId("admin_1", "command_1"),
    adminCommandDocumentId("admin_1", "command_1"),
  );
  assert.equal(
    adminReceiptId("request_1", "command_1", "reject"),
    adminReceiptId("request_1", "command_1", "reject"),
  );
  assert.notEqual(
    outboxId("request_1", "email", "command_1"),
    outboxId("request_1", "sms", "command_1"),
  );
  assert.equal(ADMIN_DECISIONS.length, 7);
});
test("uncommissioned provider fails closed", async () => {
  const p = unconfiguredDeliveryProvider();
  assert.equal(p.configured, false);
  await assert.rejects(() => p.enqueue({}), /UNCONFIGURED/);
});
