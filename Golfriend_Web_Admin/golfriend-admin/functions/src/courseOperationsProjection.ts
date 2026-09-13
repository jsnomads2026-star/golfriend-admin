import {createHash} from "node:crypto";

export const COURSE_OPERATIONS_SCHEMA = "golfriend.course-operations/v1";
export const COURSE_RETRY_SCHEMA = "golfriend.course-ingestion-retry/v1";

export function countryCode(value: unknown): string {
  const normalized = String(value || "").normalize("NFC").trim().replace(/\s+/g," ").toUpperCase();
  return normalized && normalized.length <= 64 && !/[<>\x00-\x1F]/.test(normalized) ? normalized : "ZZ";
}

export function projectCountryGrowth(courses: any[], receipts: any[]): Array<{country:string;total:number;added:number;updated:number;failed:number;lastSuccessfulIngestionAt:string|null}> {
  const rows = new Map<string, {country:string;total:number;added:number;updated:number;failed:number;lastSuccessfulIngestionAt:string|null}>();
  const row = (country: string) => rows.get(country) || {country,total:0,added:0,updated:0,failed:0,lastSuccessfulIngestionAt:null};
  for (const course of courses) { const key=countryCode(course?.country); const value=row(key); value.total++; rows.set(key,value); }
  for (const receipt of receipts) {
    const at=typeof receipt?.createdAt==="string"?receipt.createdAt:null;
    for (const [rawCountry, counts] of Object.entries(receipt?.result?.countryBreakdown || {})) {
      const key=countryCode(rawCountry);const value=row(key);const data=counts as any;
      value.added+=Math.max(0,Number(data?.added)||0);value.updated+=Math.max(0,Number(data?.updated)||0);value.failed+=Math.max(0,Number(data?.failed)||0);
      if(receipt?.status==="completed"&&at&&(!value.lastSuccessfulIngestionAt||at>value.lastSuccessfulIngestionAt))value.lastSuccessfulIngestionAt=at;
      rows.set(key,value);
    }
  }
  return [...rows.values()].sort((a,b)=>a.country.localeCompare(b.country));
}

export function projectQuota(value: any): {state:"ready"|"unconfigured";source?:"server_quota_ledger";used?:number;remaining?:number;limit?:number;resetPeriod?:string;resetsAt?:string;warning?:"normal"|"warning"|"critical"} {
  const limit=Number(value?.monthlyLimit),used=Number(value?.estimatedCallsUsed);
  const resetPeriod=String(value?.resetPeriod||""),resetsAt=String(value?.resetsAt||"");
  if(!Number.isFinite(limit)||limit<=0||!Number.isFinite(used)||used<0||!/^\d{4}-\d{2}$/.test(resetPeriod)||!Number.isFinite(Date.parse(resetsAt)))return {state:"unconfigured"};
  const ratio=used/limit;return {state:"ready",source:"server_quota_ledger",used,remaining:Math.max(0,limit-used),limit,resetPeriod,resetsAt,warning:ratio>=.95?"critical":ratio>=.8?"warning":"normal"};
}

export function deterministicRetryJobId(sourceJobId:string):string{return `retry_${createHash("sha256").update(sourceJobId).digest("hex").slice(0,32)}`;}
export function retryableStatus(status:unknown):boolean{return status==="completed_with_errors"||status==="recovered";}
export function retryCandidates(candidates:any[],existingIds:Set<string>):any[]{return candidates.filter(item=>typeof item?.courseID==="string"&&!existingIds.has(item.courseID)).sort((a,b)=>a.courseID.localeCompare(b.courseID));}
