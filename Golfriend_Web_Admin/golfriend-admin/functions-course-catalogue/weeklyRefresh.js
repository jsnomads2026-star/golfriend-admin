'use strict';

const {LAUNCH_MARKETS}=require('./launchMarkets');
const {WEEK,asMs}=require('./countrySchedule');

const number=value=>Number.isFinite(Number(value))?Number(value):NaN;
function validQuota(value,{configuredBudget,emergencyReserve}){
  const budget=number(value?.configuredBudget),reserve=number(value?.emergencyReserve),remaining=number(value?.providerReportedRemaining);
  return budget===configuredBudget&&reserve===emergencyReserve&&budget>reserve&&remaining>=reserve&&['weightedCompleted','weightedFailed','weightedReserved'].every(key=>Number.isFinite(number(value?.[key]??0))&&number(value?.[key]??0)>=0);
}
function nextWeeklyDue(job,now=Date.now()){
  const last=asMs(job?.lastProviderRequestAtMs||job?.lastSuccessfulRefreshAtMs||job?.lastReceiptAtMs);
  return Math.max(now+WEEK,last?last+WEEK:0);
}
function weeklyJob(job,country,now=Date.now()){
  const nextDueAtMs=nextWeeklyDue(job,now);
  return {country,jobId:job?.jobId||`country-${country.toLocaleLowerCase()}`,state:'completed',cycle:Math.max(1,Number(job?.cycle||0)),weeklyEnabled:true,weeklyCadenceDays:7,nextDueAtMs,nextDueAt:new Date(nextDueAtMs).toISOString(),retryAtMs:null,pauseReason:null,leaseOwner:null,leaseExpiresAtMs:null,updatedAtMs:now};
}
module.exports=Object.freeze({LAUNCH_MARKETS,validQuota,nextWeeklyDue,weeklyJob});
