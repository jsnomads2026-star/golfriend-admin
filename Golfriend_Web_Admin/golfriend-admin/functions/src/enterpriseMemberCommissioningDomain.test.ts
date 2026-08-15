import assert from "node:assert/strict";
import test from "node:test";
import {
  canActivateTemplate,
  commissioningCommandId,
  COMMISSIONING_SCHEMA,
  JHCC_PORT_SCHEMA,
  nextApprovalState,
  nonLiveJHCCPort,
  normalizeApproval,
  normalizeReportEventIds,
  normalizeTemplateProposal,
  privacySafeReportSummary,
  templateApprovalId,
} from "./enterpriseMemberCommissioningDomain.js";
const proposal = {
  templateId: "invite_template",
  templateVersion: "version_1",
  kind: "invitation",
  locale: "th",
  jurisdiction: "TH",
  contentDigest: "a".repeat(64),
  policyVersion: "policy_1",
  customerApprovalRequired: true,
  effectiveAt: "2026-09-01T00:00:00Z",
  expiresAt: "2027-09-01T00:00:00Z",
};
test("proposal contains metadata only and exact locale", () => {
  assert.equal(normalizeTemplateProposal(proposal).locale, "th");
  assert.throws(
    () => normalizeTemplateProposal({ ...proposal, locale: "it" }),
    /LOCALE/,
  );
  assert.throws(
    () => normalizeTemplateProposal({ ...proposal, legalText: "invented" }),
    /UNDECLARED/,
  );
});
test("approval receipts are external opaque references", () => {
  assert.equal(
    normalizeApproval({
      approvalKind: "legal",
      approvalReceiptRef: "legal_receipt_1",
      approvalDigest: "b".repeat(64),
    }).approvalKind,
    "legal",
  );
  assert.throws(
    () =>
      normalizeApproval({
        approvalKind: "legal",
        approvalReceiptRef: "r",
        approvalDigest: "x",
      }),
    /INVALID/,
  );
});
test("approval is versioned and cannot overwrite", () => {
  const x = { status: "pending_approval", version: 1 };
  assert.equal(nextApprovalState(x, "legal").version, 2);
  assert.throws(
    () =>
      nextApprovalState(
        { ...x, legalApprovalReceiptRef: "receipt_1" },
        "legal",
      ),
    /ALREADY/,
  );
});
test("activation requires legal customer and separation", () => {
  const x = {
    status: "pending_approval",
    legalApprovalReceiptRef: "legal_1",
    customerApprovalRequired: true,
    customerApprovalReceiptRef: "customer_1",
    proposedByReviewerRef: "admin_a",
    legalApprovedByReviewerRef: "admin_b",
    customerApprovedByReviewerRef: "admin_c",
  };
  assert.equal(canActivateTemplate(x), true);
  assert.throws(
    () => canActivateTemplate({ ...x, legalApprovalReceiptRef: null }),
    /INCOMPLETE/,
  );
  assert.throws(
    () => canActivateTemplate({ ...x, legalApprovedByReviewerRef: "admin_a" }),
    /SEPARATION/,
  );
});
test("identifiers and schema are deterministic", () => {
  assert.equal(
    COMMISSIONING_SCHEMA,
    "golfriend.enterprise-member-commissioning.v1",
  );
  assert.equal(
    templateApprovalId("t", "v", "en", "US"),
    templateApprovalId("t", "v", "en", "US"),
  );
  assert.equal(
    commissioningCommandId("u", "command_1"),
    commissioningCommandId("u", "command_1"),
  );
});
test("report event set is bounded unique", () => {
  assert.deepEqual(normalizeReportEventIds(["event_2", "event_1"]), [
    "event_1",
    "event_2",
  ]);
  assert.throws(
    () => normalizeReportEventIds(["event_1", "event_1"]),
    /DUPLICATE/,
  );
});
test("report summary rejects private financial or transmitted events", () => {
  const e = {
    schema: "golfriend.enterprise-member-report-ready.v1",
    immutable: true,
    transmitted: false,
    contactData: false,
    csvContents: false,
    economyEvent: false,
    event: "reject",
    status: "unavailable",
  };
  assert.equal(privacySafeReportSummary([e]).eventCount, 1);
  assert.throws(
    () => privacySafeReportSummary([{ ...e, contactData: true }]),
    /INVALID/,
  );
  assert.throws(
    () => privacySafeReportSummary([{ ...e, economyEvent: true }]),
    /INVALID/,
  );
});
test("JHCC port validates without commission or transmission", () => {
  const p = nonLiveJHCCPort();
  assert.equal(p.commissioned, false);
  assert.equal(JHCC_PORT_SCHEMA, "golfriend.admin.operations-report.v1");
  assert.deepEqual(p.validate({ count: 1 }), {
    valid: true,
    transmitted: false,
  });
});
test("effective window and jurisdiction are immutable identity inputs", () => {
  assert.throws(
    () =>
      normalizeTemplateProposal({
        ...proposal,
        expiresAt: proposal.effectiveAt,
      }),
    /EFFECTIVE/,
  );
  assert.notEqual(
    templateApprovalId("template_1", "version_1", "en", "US"),
    templateApprovalId("template_1", "version_1", "en", "TH"),
  );
});
test("legal and customer reviewers must remain distinct", () => {
  const x = {
    status: "pending_approval",
    legalApprovalReceiptRef: "legal_1",
    customerApprovalRequired: true,
    customerApprovalReceiptRef: "customer_1",
    proposedByReviewerRef: "admin_a",
    legalApprovedByReviewerRef: "admin_b",
    customerApprovedByReviewerRef: "admin_b",
  };
  assert.throws(() => canActivateTemplate(x), /SEPARATION/);
});
