import {getFunctions, httpsCallable} from "firebase/functions";

const call = async <T>(name: string, payload: Record<string, unknown> = {}) => (await httpsCallable(getFunctions(), name)(payload)).data as T;
export const commandId = () => crypto.randomUUID().replaceAll("-", "_");
export const partnerApplicationService = {
  load: () => call<any>("getMyPartnerApplicationV2"),
  save: (draft: Record<string, unknown>) => call<any>("savePartnerApplicationDraftV2", {...draft, commandId: commandId()}),
  submit: () => call<any>("submitPartnerApplicationV2", {commandId: commandId()}),
  message: (message: string) => call<any>("sendPartnerSupportMessageV2", {message, commandId: commandId()}),
  upload: async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((value) => value.toString(16).padStart(2, "0")).join("");
    let binary = ""; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return call<any>("uploadPartnerApplicationEvidenceV2", {commandId: commandId(), fileName: file.name, contentType: file.type, sizeBytes: file.size, checksum, base64: btoa(binary)});
  },
};

export const partnerAdminService = {
  list: () => call<any>("listPartnerApplicationsV2"),
  detail: (applicationId: string) => call<any>("getPartnerApplicationAdminV2", {applicationId}),
  review: (applicationId: string, status: string, note: string) => call<any>("reviewPartnerApplicationV2", {applicationId, status, note, commandId: commandId()}),
  message: (applicationId: string, message: string) => call<any>("sendAdminPartnerSupportMessageV2", {applicationId, message, commandId: commandId()}),
};
