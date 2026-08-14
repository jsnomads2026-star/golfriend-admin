import {createHash} from "node:crypto";

export const PARTNER_SCHEMA = "golfriend.partner-application.v2";
export const PARTNER_LOCALES = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"] as const;
export const PARTNER_STATES = ["draft", "submitted", "under_review", "info_needed", "approved", "rejected"] as const;
export const EVIDENCE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

const clean = (value: unknown, length = 160) => String(value || "").trim().slice(0, length);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const applicationId = (uid: string) => uid ? `pa_${hash(uid).slice(0, 24)}` : "";
export const auditId = (appId: string, commandId: string) => `paa_${hash(`${appId}|${commandId}`).slice(0, 32)}`;
export const evidenceId = (appId: string, checksum: string) => `pae_${hash(`${appId}|${checksum}`).slice(0, 32)}`;

export function validateDraft(input: any) {
  const organization = clean(input?.organization);
  const organizationType = clean(input?.organizationType);
  const country = clean(input?.country, 2).toUpperCase();
  const region = clean(input?.region);
  const contactName = clean(input?.contactName);
  const contactEmail = clean(input?.contactEmail, 180).toLowerCase();
  const contactPhone = clean(input?.contactPhone, 40);
  const locale = clean(input?.locale, 2);
  const courseName = clean(input?.courseName);
  const courseAddress = clean(input?.courseAddress, 300);
  const courseWebsite = clean(input?.courseWebsite, 300);
  const consent = input?.consent === true;
  const terms = input?.terms === true;
  if (!organization || !organizationType || !/^[A-Z]{2}$/.test(country) || !contactName || !/^\S+@\S+\.\S+$/.test(contactEmail) || !PARTNER_LOCALES.includes(locale as any)) throw new Error("DRAFT_INVALID");
  return {organization, organizationType, country, region, contactName, contactEmail, contactPhone, locale, course: {name: courseName, address: courseAddress, website: courseWebsite}, consent, terms};
}

export const validateSubmit = (draft: any) => Boolean(draft?.consent && draft?.terms && draft?.course?.name);
export function validateEvidence(input: any) {
  const fileName = clean(input?.fileName, 180);
  const contentType = clean(input?.contentType, 120);
  const sizeBytes = Number(input?.sizeBytes);
  const checksum = clean(input?.checksum, 64).toLowerCase();
  if (!fileName || !EVIDENCE_TYPES.includes(contentType as any) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_EVIDENCE_BYTES || !/^[a-f0-9]{64}$/.test(checksum)) throw new Error("EVIDENCE_INVALID");
  return {fileName, contentType, sizeBytes, checksum};
}
export function canReview(from: string, to: string, role: string) {
  if (!["Director", "Manager", "Support"].includes(role)) return false;
  if (from === "submitted" && to === "under_review") return true;
  if (["submitted", "under_review"].includes(from) && ["info_needed", "rejected"].includes(to)) return true;
  return from === "under_review" && to === "approved" && ["Director", "Manager"].includes(role);
}
export const immutableReceipt = (appId: string, commandId: string, kind: string, at: number) => ({schema: "golfriend.partner-audit.v2", id: auditId(appId, commandId), applicationId: appId, commandId, kind, at});
