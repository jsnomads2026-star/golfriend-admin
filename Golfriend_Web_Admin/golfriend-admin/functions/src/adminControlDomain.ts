import {createHash} from "node:crypto";
export const CONTROL_LOCALES=["en","th","ko","ja","zh","es","fr","de"] as const;
export const TRIAL_DURATIONS=[30,90] as const;
export const TEE_COST_KEYS=["booking_request","priority_match","round_join"] as const;
export const TEE_REWARD_KEYS=["completed_round","verified_review","referral"] as const;
export const BUSINESS_RATE_KEYS=["booking_commission_bps","small_business_promotion_bps","enterprise_service_bps"] as const;
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const strictId=(v:unknown,label="ID")=>{const x=String(v||"");if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(x))throw new Error(`${label}_INVALID`);return x};
export const strictVersion=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw new Error("VERSION_INVALID");return Number(v)};
const exactIntegers=(raw:any,keys:readonly string[],max:number)=>{if(!raw||Object.keys(raw).sort().join("|")!==[...keys].sort().join("|"))throw new Error("CONFIG_KEYS_INVALID");return Object.fromEntries(keys.map(k=>{const n=raw[k];if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error("CONFIG_VALUE_INVALID");return[k,n]}))};
export function normalizeEconomyValues(raw:any){if(!raw||Object.keys(raw).sort().join("|")!=="businessRates|teeActionCosts|teeRewards")throw new Error("CONFIG_GROUPS_INVALID");return Object.freeze({teeActionCosts:exactIntegers(raw.teeActionCosts,TEE_COST_KEYS,10000),teeRewards:exactIntegers(raw.teeRewards,TEE_REWARD_KEYS,10000),businessRates:exactIntegers(raw.businessRates,BUSINESS_RATE_KEYS,10000)});}
export const economyValuesDigest=(raw:any)=>hash(normalizeEconomyValues(raw));
export const commandKey=(uid:string,commandId:string,action:string)=>`acc_${hash([uid,strictId(commandId,"COMMAND"),action]).slice(0,40)}`;
export const receiptKey=(subject:string,commandId:string,action:string)=>`acr_${hash([subject,strictId(commandId,"COMMAND"),action]).slice(0,40)}`;
export function trialDecision(raw:any){const action=String(raw?.action),duration=Number(raw?.durationDays);if(!["approve","start","revoke"].includes(action))throw new Error("ACTION_INVALID");if(action==="approve"&&!TRIAL_DURATIONS.includes(duration as any))throw new Error("DURATION_INVALID");if(action!=="approve"&&raw?.durationDays!==undefined)throw new Error("DURATION_FORBIDDEN");return{action,durationDays:action==="approve"?duration:null,applicationId:strictId(raw?.applicationId,"APPLICATION"),organizationId:strictId(raw?.organizationId,"ORGANIZATION"),expectedApplicationVersion:strictVersion(raw?.expectedApplicationVersion),expectedOrganizationVersion:strictVersion(raw?.expectedOrganizationVersion),writtenApprovalRef:action==="approve"?strictId(raw?.writtenApprovalRef,"APPROVAL"):null};}
export function trialWindow(startMs:number,days:number){if(!Number.isFinite(startMs)||!TRIAL_DURATIONS.includes(days as any))throw new Error("TRIAL_WINDOW_INVALID");return{startsAtMs:startMs,endsAtMs:startMs+days*86400000};}
export function effectiveTrial(raw:any,nowMs:number){if(raw?.revokedAt)return"revoked";const start=raw?.startsAt?.toMillis?.()??Date.parse(raw?.startsAt),end=raw?.endsAt?.toMillis?.()??Date.parse(raw?.endsAt);if(!Number.isFinite(start))return"approved";if(nowMs<start)return"approved";if(nowMs>=end)return"expired";return end-nowMs<=7*86400000?"expiring":"active";}
