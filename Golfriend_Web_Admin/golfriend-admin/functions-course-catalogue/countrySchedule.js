'use strict';

const HOUR=60*60*1000, DAY=24*HOUR;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const asMs=value=>{if(value&&typeof value.toMillis==='function')return value.toMillis();const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
function priority(coverage,now=Date.now()){
  const fetched=Date.parse(String(coverage?.latestGolfriendFetchTime||''));
  const staleDays=Number.isFinite(fetched)?Math.max(0,Math.floor((now-fetched)/DAY)):90;
  return number(coverage?.coursesMissingCoordinates)*100+number(coverage?.providerEvidenceMissingCount)*25+Math.min(90,staleDays)*10+Math.min(99,number(coverage?.totalCourses));
}
function dueDelayMs(priorityScore,remaining){
  const urgency=Math.min(10000,Math.max(0,number(priorityScore)));
  const quota=Math.max(0,number(remaining));
  if(quota<=0)return 6*HOUR;
  return Math.max(6*HOUR,Math.min(30*DAY,30*DAY-Math.min(24*DAY,urgency*2*HOUR)-Math.min(6*DAY,quota*HOUR)));
}
function nextDue(coverage,quota,now=Date.now()){
  const priorityScore=priority(coverage,now),remaining=number(quota?.providerReportedRemaining),fetched=Date.parse(String(coverage?.latestGolfriendFetchTime||''));
  const nextDueAtMs=now+dueDelayMs(priorityScore,remaining);
  return Object.freeze({priorityScore,nextDueAtMs,staleAgeDays:Number.isFinite(fetched)?Math.max(0,Math.floor((now-fetched)/DAY)):90});
}
function quotaEligible(quota,cost=.1){return quota?.allowed===true&&number(quota?.providerReportedRemaining)>=cost;}
function nextCycle(existing,coverage,quota,now=Date.now()){
  const due=nextDue(coverage,quota,now);
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
module.exports=Object.freeze({priority,nextDue,quotaEligible,nextCycle,eligibility,receiptId,HOUR,DAY});
