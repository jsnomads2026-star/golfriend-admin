import { functions } from '../../firebaseConfig';
import {httpsCallable} from "firebase/functions";

// Transport only. Every authority decision belongs to the callable on the other end: this file
// never selects a collection, never derives a status and never decides what an applicant may do.

const call = async <T>(name: string, payload: Record<string, unknown> = {}) => (await httpsCallable(functions, name)(payload)).data as T;
export const commandId = () => crypto.randomUUID().replaceAll("-", "_");

const checksumOf = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)))
    .map((value) => value.toString(16).padStart(2, "0")).join("");

const base64Of = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

export const partnerApplicationService = {
  load: () => call<any>("getMyPartnerApplicationV2"),
  /** The exact agreement version and digest the applicant is asked to accept. */
  agreement: () => call<any>("getPartnerAgreementV2"),
  save: (draft: Record<string, unknown>) => call<any>("savePartnerApplicationDraftV2", {...draft, commandId: commandId()}),
  /** Explicit acceptance of an exact agreement version/digest by the authorized representative. */
  acceptAgreement: (representative: Record<string, unknown>, agreement: Record<string, unknown>) =>
    call<any>("acceptVerifiedCourseOnboardingAgreementV2", {representative, agreement, commandId: commandId()}),
  submit: () => call<any>("submitPartnerApplicationV2", {commandId: commandId()}),
  message: (message: string) => call<any>("sendPartnerSupportMessageV2", {message, commandId: commandId()}),
  /** The document KIND travels with the upload: proportionality is decided from kinds. */
  upload: async (file: File, kind: string) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return call<any>("uploadPartnerApplicationEvidenceV2", {
      commandId: commandId(), kind, fileName: file.name, contentType: file.type,
      sizeBytes: file.size, checksum: await checksumOf(bytes), base64: base64Of(bytes),
    });
  },
};

export const partnerAdminService = {
  list: () => call<any>("listPartnerApplicationsV2"),
  detail: (applicationId: string) => call<any>("getPartnerApplicationAdminV2", {applicationId}),
  review: (applicationId: string, status: string, note: string, contractApprovalId?: string) =>
    call<any>("reviewPartnerApplicationV2", {applicationId, status, note, ...(contractApprovalId ? {contractApprovalId} : {}), commandId: commandId()}),
  message: (applicationId: string, message: string) => call<any>("sendAdminPartnerSupportMessageV2", {applicationId, message, commandId: commandId()}),
  /** Verify, reject or ask for an alternative. The server owns every field of the decision. */
  reviewEvidence: (applicationId: string, evidenceId: string, decision: string, reason: string, expectedRevision: number) =>
    call<any>("reviewPartnerApplicationEvidenceV2", {applicationId, evidenceId, decision, reason, expectedRevision, commandId: commandId()}),
  /** Legal and commercial approval; writes the immutable contract approval record. */
  approveContract: (applicationId: string, input: {scope: string; effectiveFrom: string; commissionBps: number; legalReviewComplete: boolean; legalReviewReference: string}) =>
    call<any>("approvePartnerContractV2", {applicationId, ...input, commandId: commandId()}),
};
