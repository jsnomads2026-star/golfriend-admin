'use strict';

const HOUR=60*60*1000, DAY=24*HOUR;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const asMs=value=>{if(value&&typeof value.toMillis==='function')return value.toMillis();const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
function priorityEvidence(coverage,now=Date.now(),policy={}){
  const fetched=Date.parse(String(coverage?.latestGolfriendFetchTime||''));
  const staleDays=Number.isFinite(fetched)?Math.max(0,Math.floor((now-fetched)/DAY)):90;
  const override=Number(coverage?.priorityOverride),marketWeight=number(policy?.marketWeights?.[coverage?.country]);
  if(Number.isFinite(override))return Object.freeze({score:override,reason:'EXPLICIT_PRIORITY_OVERRIDE',sourceFields:Object.freeze({priorityOverride:override})});
  const sourceFields=Object.freeze({country:String(coverage?.country||'UNKNOWN'),marketWeight,coursesMissingCoordinates:number(coverage?.coursesMissingCoordinates),providerEvidenceMissingCount:number(coverage?.providerEvidenceMissingCount),staleAgeDays:staleDays,totalCourses:number(coverage?.totalCourses)});
  const components=Object.freeze({thailandBoost:coverage?.country==='TH'?1000000:0,marketWeight:marketWeight*1000,missingCoordinates:sourceFields.coursesMissingCoordinates*100,providerEvidenceMissing:sourceFields.providerEvidenceMissingCount*25,staleness:Math.min(90,staleDays)*10,catalogueCount:Math.min(99,sourceFields.totalCourses)});
  return Object.freeze({score:Object.values(components).reduce((sum,value)=>sum+value,0),reason:'AUTHORITATIVE_COVERAGE_PRIORITY',sourceFields,components});
}
function priority(coverage,now=Date.now(),policy={}){return priorityEvidence(coverage,now,policy).score;}
function dueDelayMs(priorityScore,remaining){
  const urgency=Math.min(10000,Math.max(0,number(priorityScore)));
  const quota=Math.max(0,number(remaining));
  if(quota<=0)return 6*HOUR;
  return Math.max(6*HOUR,Math.min(30*DAY,30*DAY-Math.min(24*DAY,urgency*2*HOUR)-Math.min(6*DAY,quota*HOUR)));
}
function nextDue(coverage,quota,now=Date.now(),policy={}){
  const ranking=priorityEvidence(coverage,now,policy),priorityScore=ranking.score,remaining=number(quota?.providerReportedRemaining),fetched=Date.parse(String(coverage?.latestGolfriendFetchTime||''));
  const nextDueAtMs=now+dueDelayMs(priorityScore,remaining);
  return Object.freeze({priorityScore,nextDueAtMs,staleAgeDays:Number.isFinite(fetched)?Math.max(0,Math.floor((now-fetched)/DAY)):90,ranking});
}
function quotaEligible(quota,cost=.1){return quota?.allowed===true&&number(quota?.providerReportedRemaining)>=cost;}
function nextCycle(existing,coverage,quota,now=Date.now(),policy={}){
  const due=nextDue({...coverage,priorityOverride:existing?.priorityOverride},quota,now,policy);
  return Object.freeze({state:'completed',cycle:Math.max(1,number(existing?.cycle)),priorityScore:due.priorityScore,staleAgeDays:due.staleAgeDays,nextDueAtMs:due.nextDueAtMs,nextDueAt:new Date(due.nextDueAtMs).toISOString(),pauseReason:null,retryAtMs:null});
}
function eligibility(job,quota,now=Date.now()){
  if(!job||job.country==='UNKNOWN'||job.state==='failed'||job.pauseReason==='ADMIN_PAUSED')return{eligible:false,reason:'NOT_ELIGIBLE'};
  if(job.state==='queued')return{eligible:true,reason:'QUEUED'};
  if(job.state==='running')return{eligible:asMs(job.leaseExpiresAtMs)<=now,reason:asMs(job.leaseExpiresAtMs)<=now?'LEASE_EXPIRED':'LEASE_ACTIVE'};
  const due=asMs(job.retryAtMs||job.nextDueAtMs);
  if(job.state==='paused'&&job.pauseReason!=='PROVIDER_429'&&job.pauseReason!=='QUOTA_EXHAUSTED')return{eligible:false,reason:'PAUSED'};
  if((job.state==='completed'||job.state==='paused')&&due>now)return{eligible:false,reason:'NOT_DUE'};
  if((job.state==='completed'||job.state==='paused')&&!quotaEligible(quota))return{eligible:false,reason:'QUOTA_NOT_ELIGIBLE'};
  return{eligible:job.state==='completed'||job.state==='paused',reason:'DUE'};
}
function receiptId(job){return `${job.jobId}-cycle-${Math.max(1,number(job.cycle))}`;}
module.exports=Object.freeze({priority,priorityEvidence,nextDue,quotaEligible,nextCycle,eligibility,receiptId,HOUR,DAY});
