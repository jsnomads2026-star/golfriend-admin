import { createHash } from "node:crypto";
export const ADMIN_MEMBER_SCHEMA =
  "golfriend.enterprise-member-admin-resolution.v1" as const;
export const ADMIN_DECISIONS = [
  "mark_duplicate",
  "link_existing",
  "reject",
  "request_correction",
  "escalate_identity_consent",
  "approve_delivery",
  "cancel_before_delivery",
] as const;
export const DELIVERY_CHANNELS = ["email", "sms", "push"] as const;
export const ADMIN_ROLES = [
  "super_admin",
  "operations_admin",
  "partner_reviewer",
  "member_reviewer",
] as const;
export const LOCALES = [
  "en",
  "th",
  "ko",
  "ja",
  "zh",
  "es",
  "fr",
  "de",
] as const;
export const MAX_BATCH_ROWS = 50,
  MAX_DELIVERY_ATTEMPTS = 5;
const id = (v: unknown, label: string) => {
  const x = String(v || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(x))
    throw Error(`${label}_INVALID`);
  return x;
};
const bounded = (v: unknown, label: string, max: number, required = true) => {
  const x = String(v ?? "").trim();
  if (
    (required && !x) ||
    x.length > max ||
    /[\u0000-\u001f\u007f]/.test(x) ||
    /<script|javascript:|\bon\w+\s*=/i.test(x)
  )
    throw Error(`${label}_INVALID`);
  return x;
};
export const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const adminCommandDocumentId = (uid: string, command: string) =>
  `emac_${digest([uid, strictId(command, "COMMAND")]).slice(0, 32)}`;
export const adminReceiptId = (
  requestId: string,
  command: string,
  action: string,
) => `emar_${digest([requestId, command, action]).slice(0, 32)}`;
export const outboxId = (requestId: string, channel: string, command: string) =>
  `emao_${digest([requestId, channel, command]).slice(0, 32)}`;
export function strictId(v: unknown, label = "ID") {
  return id(v, label);
}
export function strictVersion(v: unknown) {
  if (!Number.isSafeInteger(v) || Number(v) < 1) throw Error("VERSION_INVALID");
  return Number(v);
}
export function adminRoleAllowed(v: unknown) {
  return ADMIN_ROLES.includes(String(v) as any);
}
export function activeAdminRecord(raw: any, now = Date.now()) {
  const t = (v: any) => v?.toMillis?.() ?? Date.parse(String(v || ""));
  return Boolean(
    raw &&
      adminRoleAllowed(raw.role) &&
      ["active", "Active"].includes(raw.status) &&
      raw.enabled === true &&
      !raw.suspendedAt &&
      !raw.revokedAt &&
      (!raw.effectiveAt || t(raw.effectiveAt) <= now) &&
      (!raw.expiresAt || t(raw.expiresAt) > now),
  );
}
export function normalizeDecision(raw: any) {
  const allowed = new Set([
    "decision",
    "reason",
    "existingMemberReference",
    "policyVersion",
    "evidenceDigest",
  ]);
  if (!raw || Object.keys(raw).some((k) => !allowed.has(k)))
    throw Error("UNDECLARED_FIELD");
  const decision = String(raw.decision || "");
  if (!ADMIN_DECISIONS.includes(decision as any))
    throw Error("DECISION_INVALID");
  const existing =
    raw.existingMemberReference == null
      ? null
      : id(raw.existingMemberReference, "MEMBER_REFERENCE");
  if (
    ["mark_duplicate", "link_existing"].includes(decision) !== Boolean(existing)
  )
    throw Error("MEMBER_REFERENCE_INVALID");
  return {
    decision,
    reason: bounded(
      raw.reason,
      "REASON",
      1000,
      decision !== "approve_delivery",
    ),
    existingMemberReference: existing,
    policyVersion: id(raw.policyVersion, "POLICY_VERSION"),
    evidenceDigest: bounded(raw.evidenceDigest, "EVIDENCE_DIGEST", 64),
  };
}
export function decisionStatus(decision: string) {
  const m: Record<string, string> = {
    mark_duplicate: "conflict_review",
    link_existing: "conflict_review",
    reject: "unavailable",
    request_correction: "conflict_review",
    escalate_identity_consent: "conflict_review",
    approve_delivery: "awaiting_delivery_provider",
    cancel_before_delivery: "unavailable",
  };
  if (!m[decision]) throw Error("DECISION_INVALID");
  return m[decision];
}
export function decisionAllowed(status: string, decision: string) {
  const open = [
    "awaiting_delivery_provider",
    "change_requested",
    "conflict_review",
    "unavailable",
    "stale",
    "needs_information",
  ];
  if (!open.includes(status)) throw Error("REQUEST_TERMINAL");
  if (
    decision === "cancel_before_delivery" &&
    status !== "awaiting_delivery_provider"
  )
    throw Error("TRANSITION_INVALID");
  if (
    ["mark_duplicate", "link_existing"].includes(decision) &&
    status !== "conflict_review"
  )
    throw Error("TRANSITION_INVALID");
  return decisionStatus(decision);
}
export function normalizeDelivery(raw: any) {
  const allowed = new Set([
    "channel",
    "templateId",
    "templateVersion",
    "locale",
    "legalBasisReference",
  ]);
  if (!raw || Object.keys(raw).some((k) => !allowed.has(k)))
    throw Error("UNDECLARED_FIELD");
  const channel = String(raw.channel || ""),
    locale = String(raw.locale || "");
  if (
    !DELIVERY_CHANNELS.includes(channel as any) ||
    !LOCALES.includes(locale as any)
  )
    throw Error("DELIVERY_INVALID");
  return {
    channel,
    templateId: id(raw.templateId, "TEMPLATE"),
    templateVersion: id(raw.templateVersion, "TEMPLATE_VERSION"),
    locale,
    legalBasisReference: id(raw.legalBasisReference, "LEGAL_BASIS"),
  };
}
export function normalizeCsvResolutions(raw: any) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_BATCH_ROWS)
    throw Error("BATCH_LIMIT");
  const seen = new Set<number>();
  return raw.map((x) => {
    const allowed = new Set(["row", "decision", "existingMemberReference"]);
    if (!x || Object.keys(x).some((k) => !allowed.has(k)))
      throw Error("UNDECLARED_FIELD");
    const row = Number(x.row),
      decision = String(x.decision || "");
    if (
      !Number.isSafeInteger(row) ||
      row < 1 ||
      seen.has(row) ||
      !["approve_delivery", "mark_duplicate", "reject"].includes(decision)
    )
      throw Error("ROW_RESOLUTION_INVALID");
    seen.add(row);
    const existing =
      x.existingMemberReference == null
        ? null
        : id(x.existingMemberReference, "MEMBER_REFERENCE");
    if ((decision === "mark_duplicate") !== Boolean(existing))
      throw Error("MEMBER_REFERENCE_INVALID");
    return { row, decision, existingMemberReference: existing };
  });
}
export function minimumAdminRequest(raw: any) {
  return {
    requestId: id(raw.requestId, "REQUEST"),
    organizationId: id(raw.organizationId, "ORGANIZATION"),
    propertyId: id(raw.propertyId, "PROPERTY"),
    courseId: id(raw.courseId, "COURSE"),
    action: String(raw.action),
    status: String(raw.status),
    adminResolutionStatus: raw.adminResolutionStatus
      ? String(raw.adminResolutionStatus)
      : null,
    remainingRows: Number.isSafeInteger(raw.remainingRows)
      ? raw.remainingRows
      : null,
    version: strictVersion(raw.version),
    memberReference: raw.memberReference
      ? id(raw.memberReference, "MEMBER_REFERENCE")
      : null,
    locale: raw.locale && LOCALES.includes(raw.locale) ? raw.locale : null,
    purpose: raw.purpose ? bounded(raw.purpose, "PURPOSE", 500) : null,
    rowCount: Number.isSafeInteger(raw.rowCount) ? raw.rowCount : null,
    expiresAt: raw.expiresAt?.toDate?.()?.toISOString?.() ?? null,
  };
}
export function minimumOutbox(raw: any) {
  return {
    outboxId: id(raw.outboxId, "OUTBOX"),
    requestId: id(raw.requestId, "REQUEST"),
    channel: raw.channel,
    locale: raw.locale,
    templateId: raw.templateId,
    templateVersion: raw.templateVersion,
    status: raw.status,
    attempts: Number(raw.attempts || 0),
    providerConfigured: false,
    expiresAt: raw.expiresAt?.toDate?.()?.toISOString?.() ?? null,
  };
}
export interface DeliveryProviderPort {
  configured: boolean;
  enqueue(_: unknown): Promise<never>;
}
export function unconfiguredDeliveryProvider(): DeliveryProviderPort {
  return {
    configured: false,
    async enqueue() {
      throw Error("DELIVERY_PROVIDER_UNCONFIGURED");
    },
  };
}
