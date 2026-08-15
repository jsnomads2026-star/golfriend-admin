import {createHash} from "node:crypto";
export const ACTIVATION_SCHEMA = "golfriend.partner-activation.v1";
export const STAFF_ROLES = ["primary_owner", "manager", "course_staff", "support", "analyst"] as const;
export const CLAIM_STATES = ["pending_admin", "approved", "rejected", "disputed", "suspended"] as const;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const safe = (value: unknown, pattern: RegExp) => {const text = String(value || "").trim(); if (!pattern.test(text)) throw new Error("INVALID_ID"); return text;};
export const organizationId = (applicationId: string) => `org_${hash(applicationId).slice(0, 24)}`;
export const activationId = (applicationId: string, commandId: string) => `act_${hash(`${applicationId}|${commandId}`).slice(0, 32)}`;
export const claimId = (organization: string, courseId: string) => `claim_${hash(`${organization}|${courseId}`).slice(0, 32)}`;
export const receiptId = (scope: string, commandId: string) => `par_${hash(`${scope}|${commandId}`).slice(0, 32)}`;
export const invitationId = (organization: string, email: string) => `invite_${hash(`${organization}|${email.toLowerCase()}`).slice(0, 32)}`;
export const identityHash = (email: string) => hash(email.trim().toLowerCase());
export const validateCommand = (value: unknown) => safe(value, /^[A-Za-z0-9_-]{8,80}$/);
export const validateVersion = (value: unknown) => {const version = Number(value); if (!Number.isInteger(version) || version < 0) throw new Error("INVALID_VERSION"); return version;};
export const validateRole = (value: unknown) => {const role = String(value); if (!STAFF_ROLES.includes(role as any) || role === "primary_owner") throw new Error("INVALID_ROLE"); return role;};
export function canManage(role: string) {return role === "primary_owner" || role === "manager";}
export function canApproveClaim(role: string) {return role === "Director" || role === "Manager";}
export function transitionClaim(from: string, to: string, adminRole: string) {if (!canApproveClaim(adminRole)) return false; return (from === "pending_admin" && ["approved", "rejected", "disputed"].includes(to)) || (from === "disputed" && ["approved", "rejected"].includes(to)) || (from === "approved" && to === "suspended") || (from === "suspended" && to === "approved");}
export function nextVersion(current: number, expected: number) {if (current !== expected) throw new Error("VERSION_CONFLICT"); return current + 1;}
export const immutableReceipt = (scope: string, commandId: string, kind: string) => ({schema: "golfriend.partner-authority-receipt.v1", receiptId: receiptId(scope, commandId), scope, commandId, kind});
