import {createHash} from "node:crypto";

export const ENTERPRISE_SUPPORT_SCHEMA="golfriend.enterprise-partner-support.v1" as const;
export const SUPPORT_TYPES=["onboarding_help","course_profile_correction","trial_question","member_management_help","tournament_support","booking_coordination","commission_clarification","technical_issue","general_support"] as const;
export const SUPPORT_STATUSES=["draft","submitted","acknowledged","needs_information","under_review","resolved","closed","withdrawn"] as const;
export const SUPPORT_LOCALES=["en","th","ko","ja","zh","es","fr","de"] as const;
export type SupportStatus=typeof SUPPORT_STATUSES[number];
const allowedEvidence=new Set(["document","image","log","receipt"]);
const safeId=(v:unknown,label:string)=>{const x=String(v||"");if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(x))throw new Error(`${label}_INVALID`);return x};
const safeText=(v:unknown,label:string,max:number)=>{const x=String(v||"").trim();if(!x||x.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(x))throw new Error(`${label}_INVALID`);return x};
export const supportDigest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const supportRequestId=(organizationId:string,propertyId:string,courseId:string,commandId:string)=>`esr_${supportDigest([organizationId,propertyId,courseId,commandId]).slice(0,32)}`;
export const supportCommandId=(uid:string,commandId:string,action:string)=>`esc_${supportDigest([uid,commandId,action]).slice(0,32)}`;
export const supportReceiptId=(requestId:string,commandId:string,action:string)=>`esrct_${supportDigest([requestId,commandId,action]).slice(0,32)}`;
export function normalizeSupportDraft(raw:any){
 const allowed=new Set(["type","subject","body","locale","notificationPreferences"]);for(const k of Object.keys(raw||{}))if(!allowed.has(k))throw new Error("UNDECLARED_FIELD");
 const type=String(raw?.type||"");if(!SUPPORT_TYPES.includes(type as any))throw new Error("TYPE_INVALID");const locale=String(raw?.locale||"");if(!SUPPORT_LOCALES.includes(locale as any))throw new Error("LOCALE_INVALID");
 const p=raw?.notificationPreferences;if(!p||Object.keys(p).some(k=>!["locale","email","sms","push"].includes(k))||p.locale!==locale||[p.email,p.sms,p.push].some(x=>typeof x!=="boolean"))throw new Error("PREFERENCES_INVALID");
 return{type,subject:safeText(raw.subject,"SUBJECT",160),body:safeText(raw.body,"BODY",5000),locale,notificationPreferences:{locale,email:p.email,sms:p.sms,push:p.push}};
}
export function normalizeEvidence(raw:any){const allowed=new Set(["type","referenceId","label"]);for(const k of Object.keys(raw||{}))if(!allowed.has(k))throw new Error("UNDECLARED_FIELD");if(!allowedEvidence.has(String(raw?.type||"")))throw new Error("EVIDENCE_TYPE_INVALID");return{type:String(raw.type),referenceId:safeId(raw.referenceId,"EVIDENCE_REFERENCE"),label:safeText(raw.label,"EVIDENCE_LABEL",160)}}
export function normalizeReply(raw:any){if(!raw||Object.keys(raw).some(k=>k!=="body"))throw new Error("UNDECLARED_FIELD");return{body:safeText(raw.body,"REPLY",5000)}}
export function requireTransition(status:unknown,action:"submit"|"reply"|"withdraw"|"reopen"|"close",policy?:{resolvedAtMs?:number;nowMs?:number;reopenCount?:number}){
 const s=String(status)as SupportStatus;if(!SUPPORT_STATUSES.includes(s))throw new Error("STATUS_INVALID");
 const allowed:Record<typeof action,SupportStatus[]>={submit:["draft"],reply:["needs_information"],withdraw:["draft","submitted","acknowledged","needs_information","under_review"],reopen:["resolved","closed"],close:["resolved"]};if(!allowed[action].includes(s))throw new Error("TRANSITION_INVALID");
 if(action==="reopen"){const now=policy?.nowMs??Date.now(),resolved=policy?.resolvedAtMs;if(!Number.isFinite(resolved)||now-Number(resolved)>30*86400000||(policy?.reopenCount??0)>=3)throw new Error("REOPEN_POLICY_DENIED")}
 return action==="submit"||action==="reply"||action==="reopen"?"submitted":action==="withdraw"?"withdrawn":"closed";
}
export function assertSupportDocument(raw:any,scope:{organizationId:string;propertyId:string;courseId:string;membershipId:string}){if(!raw||raw.schema!==ENTERPRISE_SUPPORT_SCHEMA||raw.organizationId!==scope.organizationId||raw.propertyId!==scope.propertyId||raw.courseId!==scope.courseId||raw.representativeMembershipId!==scope.membershipId||!SUPPORT_STATUSES.includes(raw.status)||!Number.isSafeInteger(raw.version)||raw.version<1)throw new Error("REQUEST_UNAVAILABLE");return raw}
