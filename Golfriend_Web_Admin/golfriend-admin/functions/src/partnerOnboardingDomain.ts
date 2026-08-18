import {createHash} from "node:crypto";
import {BOOKING_COMMISSION_BPS} from "./partnerBillingDomain.js";

export const PARTNER_SCHEMA = "golfriend.partner-application.v2";
export const PARTNER_LOCALES = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"] as const;
export const PARTNER_STATES = ["draft", "submitted", "under_review", "info_needed", "approved", "rejected", "suspended"] as const;
export const PARTNER_AGREEMENT_VERSION = "golfriend.course-partner.v1";
export const PARTNER_AGREEMENT_DIGEST = "e16d5070c66bbf4b89beade4407b415def779076c71dbb48237db7b1157adc11";
/**
 * Re-exported, never re-declared. A second literal here could silently diverge from the
 * central pricing authority, so the rate has exactly one definition inside functions/.
 */
export const FOUNDING_COMMISSION_BPS = BOOKING_COMMISSION_BPS;
export const PILOT_DAYS = 90;
export const EVIDENCE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

const clean = (value: unknown, length = 160) => String(value || "").trim().slice(0, length);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const applicationId = (uid: string) => uid ? `pa_${hash(uid).slice(0, 24)}` : "";
export const auditId = (appId: string, commandId: string, kind = "legacy") => `paa_${hash(`${appId}|${kind}|${commandId}`).slice(0, 32)}`;
export const evidenceId = (appId: string, checksum: string) => `pae_${hash(`${appId}|${checksum}`).slice(0, 32)}`;
export const agreementReceiptId = (appId: string, version: string) => `pag_${hash(`${appId}|${version}`).slice(0, 32)}`;

const isoDate = (value: unknown) => {
  const text = clean(value, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) throw new Error("DATE_INVALID");
  return text;
};

export function validateRepresentative(input: any) {
  const name = clean(input?.name);
  const title = clean(input?.title);
  const email = clean(input?.email, 180).toLowerCase();
  const authorityEvidenceId = clean(input?.authorityEvidenceId, 80);
  if (!name || !title || !/^\S+@\S+\.\S+$/.test(email) || !/^pae_[a-f0-9]{32}$/.test(authorityEvidenceId) || input?.authorityConfirmed !== true) throw new Error("REPRESENTATIVE_INVALID");
  return {name, title, email, authorityEvidenceId, authorityConfirmed: true};
}

export function validateAgreementAcceptance(input: any, appId: string) {
  const version = clean(input?.version, 80);
  const digest = clean(input?.digest, 64).toLowerCase();
  if (version !== PARTNER_AGREEMENT_VERSION || digest !== PARTNER_AGREEMENT_DIGEST || input?.explicitlyAccepted !== true || input?.signerIsAuthorizedRepresentative !== true) throw new Error("AGREEMENT_INVALID");
  return {version, digest, explicitlyAccepted: true, signerIsAuthorizedRepresentative: true, receiptId: agreementReceiptId(appId, version)};
}

export function validateContractConfiguration(input: any) {
  const effectiveFrom = isoDate(input?.effectiveFrom);
  const approvalId = clean(input?.approvalId, 100);
  if (!/^pca_[a-f0-9]{32}$/.test(approvalId) || input?.status !== "approved" || Number(input?.commissionBps) !== FOUNDING_COMMISSION_BPS) throw new Error("CONTRACT_INVALID");
  return {approvalId, contractuallyApproved: true, commissionBps: FOUNDING_COMMISSION_BPS, effectiveFrom};
}

export function commercialEligibility(input: any) {
  const signed = input?.agreement?.explicitlyAccepted === true && input?.agreement?.signerIsAuthorizedRepresentative === true;
  const contracted = input?.contract?.contractuallyApproved === true && input?.contract?.commissionBps === FOUNDING_COMMISSION_BPS;
  const activatedAt = input?.verifiedActivationAt ? isoDate(input.verifiedActivationAt) : "";
  const pilotEndsAt = activatedAt ? new Date(Date.parse(activatedAt) + PILOT_DAYS * 86400000).toISOString() : null;
  const active = input?.status === "approved" && signed && contracted && Boolean(activatedAt) && input?.suspended !== true;
  return {isPartner: active, invoiceEligible: false, invoiceState: "external_authority_required", availabilityState: input?.suspended ? "suspended" : active ? "active" : "unavailable", pilotStartsAt: activatedAt || null, pilotEndsAt};
}

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
  const legalName = clean(input?.organizationIdentity?.legalName || organization);
  const registrationId = clean(input?.organizationIdentity?.registrationId, 100);
  const jurisdiction = clean(input?.organizationIdentity?.jurisdiction || country, 2).toUpperCase();
  const holes = Number(input?.courseProfile?.holes || 0);
  const timeZone = clean(input?.courseProfile?.timeZone, 80);
  const catalogueLocales = Array.isArray(input?.courseProfile?.catalogueLocales) ? [...new Set(input.courseProfile.catalogueLocales.map((x: unknown) => clean(x, 2)))].filter((x) => PARTNER_LOCALES.includes(x as any)) : [];
  return {organization, organizationType, country, region, contactName, contactEmail, contactPhone, locale, organizationIdentity: {legalName, registrationId, jurisdiction}, course: {name: courseName, address: courseAddress, website: courseWebsite}, courseProfile: {name: clean(input?.courseProfile?.name || courseName), address: clean(input?.courseProfile?.address || courseAddress, 300), website: clean(input?.courseProfile?.website || courseWebsite, 300), holes: [9, 18, 27, 36].includes(holes) ? holes : null, timeZone, catalogueLocales}, consent, terms};
}

export const validateSubmit = (draft: any) => Boolean(draft?.consent && draft?.terms && draft?.course?.name && draft?.organizationIdentity?.legalName);
export const hasCompleteCatalogueLocales = (draft: any) => PARTNER_LOCALES.every((locale) => draft?.courseProfile?.catalogueLocales?.includes(locale)) && draft?.courseProfile?.catalogueLocales?.length === PARTNER_LOCALES.length;
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
  if (from === "approved" && to === "suspended") return ["Director", "Manager"].includes(role);
  return from === "under_review" && to === "approved" && ["Director", "Manager"].includes(role);
}
export const immutableReceipt = (appId: string, commandId: string, kind: string, at: number) => ({schema: "golfriend.partner-audit.v2", id: auditId(appId, commandId, kind), applicationId: appId, commandId, kind, at});
