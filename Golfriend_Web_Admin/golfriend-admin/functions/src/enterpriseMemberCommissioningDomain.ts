import { createHash } from "node:crypto";
import { LOCALES } from "./enterpriseMemberAdminDomain.js";
export const COMMISSIONING_SCHEMA =
  "golfriend.enterprise-member-commissioning.v1" as const;
export const TEMPLATE_KINDS = [
  "invitation",
  "resend",
  "correction_requested",
  "request_rejected",
  "request_expired",
  "support_response",
] as const;
export const APPROVAL_KINDS = ["legal", "customer"] as const;
export const MAX_REPORT_EVENTS = 100;
export const JHCC_PORT_SCHEMA = "golfriend.admin.operations-report.v1" as const;
const id = (v: unknown, label: string) => {
  const x = String(v || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(x))
    throw Error(`${label}_INVALID`);
  return x;
};
const sha = (v: unknown, label: string) => {
  const x = String(v || "");
  if (!/^[a-f0-9]{64}$/.test(x)) throw Error(`${label}_INVALID`);
  return x;
};
export const commissioningDigest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const templateApprovalId = (
  templateId: string,
  version: string,
  locale: string,
  jurisdiction: string,
) =>
  `emta_${commissioningDigest([templateId, version, locale, jurisdiction]).slice(0, 32)}`;
export const commissioningCommandId = (uid: string, command: string) =>
  `emcc_${commissioningDigest([uid, id(command, "COMMAND")]).slice(0, 32)}`;
export const commissioningReceiptId = (
  subject: string,
  command: string,
  action: string,
) => `emcr_${commissioningDigest([subject, command, action]).slice(0, 32)}`;
export function normalizeTemplateProposal(raw: any) {
  const allowed = new Set([
    "templateId",
    "templateVersion",
    "kind",
    "locale",
    "jurisdiction",
    "contentDigest",
    "policyVersion",
    "customerApprovalRequired",
    "effectiveAt",
    "expiresAt",
  ]);
  if (!raw || Object.keys(raw).some((k) => !allowed.has(k)))
    throw Error("UNDECLARED_FIELD");
  const locale = String(raw.locale || ""),
    kind = String(raw.kind || "");
  if (!LOCALES.includes(locale as any)) throw Error("LOCALE_INVALID");
  if (!TEMPLATE_KINDS.includes(kind as any)) throw Error("KIND_INVALID");
  const effectiveAt = new Date(String(raw.effectiveAt || "")),
    expiresAt = new Date(String(raw.expiresAt || ""));
  if (
    !Number.isFinite(effectiveAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= effectiveAt
  )
    throw Error("EFFECTIVE_WINDOW_INVALID");
  return {
    templateId: id(raw.templateId, "TEMPLATE"),
    templateVersion: id(raw.templateVersion, "TEMPLATE_VERSION"),
    kind,
    locale,
    jurisdiction: (() => {
      const x = String(raw.jurisdiction || "");
      if (!/^[A-Z]{2}(?:-[A-Z0-9]{2,8})?$/.test(x))
        throw Error("JURISDICTION_INVALID");
      return x;
    })(),
    contentDigest: sha(raw.contentDigest, "CONTENT_DIGEST"),
    policyVersion: id(raw.policyVersion, "POLICY_VERSION"),
    customerApprovalRequired: raw.customerApprovalRequired === true,
    effectiveAt: effectiveAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
export function normalizeApproval(raw: any) {
  const allowed = new Set([
    "approvalKind",
    "approvalReceiptRef",
    "approvalDigest",
  ]);
  if (!raw || Object.keys(raw).some((k) => !allowed.has(k)))
    throw Error("UNDECLARED_FIELD");
  const approvalKind = String(raw.approvalKind || "");
  if (!APPROVAL_KINDS.includes(approvalKind as any))
    throw Error("APPROVAL_KIND_INVALID");
  return {
    approvalKind,
    approvalReceiptRef: id(raw.approvalReceiptRef, "APPROVAL_RECEIPT"),
    approvalDigest: sha(raw.approvalDigest, "APPROVAL_DIGEST"),
  };
}
export function nextApprovalState(raw: any, kind: string) {
  if (
    !raw ||
    raw.status !== "pending_approval" ||
    !Number.isSafeInteger(raw.version) ||
    raw.version < 1
  )
    throw Error("APPROVAL_STATE_INVALID");
  if (
    (kind === "legal" && raw.legalApprovalReceiptRef) ||
    (kind === "customer" && raw.customerApprovalReceiptRef)
  )
    throw Error("APPROVAL_ALREADY_RECORDED");
  return {
    version: raw.version + 1,
    legalApproved: kind === "legal" || Boolean(raw.legalApprovalReceiptRef),
    customerApproved:
      kind === "customer" || Boolean(raw.customerApprovalReceiptRef),
  };
}
export function canActivateTemplate(raw: any) {
  if (
    !raw ||
    raw.status !== "pending_approval" ||
    !raw.legalApprovalReceiptRef ||
    (raw.customerApprovalRequired === true && !raw.customerApprovalReceiptRef)
  )
    throw Error("APPROVAL_INCOMPLETE");
  if (
    raw.proposedByReviewerRef === raw.legalApprovedByReviewerRef ||
    (raw.proposedByReviewerRef === raw.customerApprovedByReviewerRef &&
      raw.customerApprovalRequired === true) ||
    (raw.customerApprovalRequired === true &&
      raw.legalApprovedByReviewerRef === raw.customerApprovedByReviewerRef)
  )
    throw Error("SEPARATION_OF_DUTIES");
  return true;
}
export function normalizeReportEventIds(raw: any) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_REPORT_EVENTS)
    throw Error("EVENT_LIMIT");
  const ids = raw.map((x) => id(x, "EVENT"));
  if (new Set(ids).size !== ids.length) throw Error("EVENT_DUPLICATE");
  return ids.sort();
}
export function privacySafeReportSummary(events: any[]) {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (
      !e ||
      e.schema !== "golfriend.enterprise-member-report-ready.v1" ||
      e.immutable !== true ||
      e.transmitted !== false ||
      e.contactData !== false ||
      e.csvContents !== false ||
      e.economyEvent !== false
    )
      throw Error("REPORT_EVENT_INVALID");
    const key = `${String(e.event)}:${String(e.status)}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    eventCount: events.length,
    counts,
    containsContactData: false,
    containsCsvContents: false,
    economyEvents: 0,
  };
}
export interface NonLiveJHCCPort {
  commissioned: false;
  validate(payload: unknown): { valid: true; transmitted: false };
}
export function nonLiveJHCCPort(): NonLiveJHCCPort {
  return {
    commissioned: false,
    validate(payload) {
      if (!payload || typeof payload !== "object")
        throw Error("REPORT_PAYLOAD_INVALID");
      return { valid: true, transmitted: false };
    },
  };
}
