'use strict';
const d=require('./domain');
const COUNTRY='TH',WEIGHT=.1;
const bindingPayload=value=>({projectId:value.projectId,workerService:value.workerService,workerRevision:value.workerRevision,secretName:value.secretName,secretVersion:value.secretVersion,secretVersionState:value.secretVersionState,verifiedAt:value.verifiedAt});
const bindingMatches=value=>value?.immutable===true&&typeof value?.digest==='string'&&d.digest(bindingPayload(value))===value.digest;
function arm({country,confirmed,config={},policy={},binding,runId}){
  if(country!=='TH'||confirmed!==true)throw Error('THAILAND_EXPLICIT_APPROVAL_REQUIRED');
  if(config.enabled===true||config.providerRequestsAllowed===true||config.canaryRequestsAllowed===true||config.calibrationRequestsAllowed===true)throw Error('GLOBAL_PROVIDER_AUTHORITY_MUST_REMAIN_DISABLED');
  if(policy.enabled===true&&policy.enrollmentComplete===true)throw Error('GLOBAL_REFRESH_MUST_REMAIN_DISABLED');
  if(!bindingMatches(binding))throw Error('THAILAND_ACTIVATION_BINDING_INVALID');
  return Object.freeze({country:COUNTRY,runId,state:'armed',providerRequestsAllowed:false,thailandQuotaEvidenceAllowed:true,refreshSlo:d.REFRESH_SLO});
}
function claim({config={},binding,runId}){
  if(config.enabled===true||config.providerRequestsAllowed===true||config.thailandQuotaEvidenceAllowed!==true||config.thailandQuotaEvidenceState!=='armed'||config.thailandQuotaEvidenceCountry!==COUNTRY||config.thailandQuotaEvidenceRunId!==runId||!bindingMatches(binding))throw Error('THAILAND_QUOTA_EVIDENCE_CLAIM_REJECTED');
  return Object.freeze({country:COUNTRY,runId,requestCount:1,weight:WEIGHT,endpoint:'/api/v2.3/clubs?country=TH&pageSize=200'});
}
function receipt({binding,runId,requestIdentity,httpStatus,providerRemaining,responseDigest,quotaBefore,quotaAfter,failure=null}){
  const payload={schema:'golfriend.thailand-quota-evidence-receipt.v1',country:COUNTRY,runId,bindingReceiptId:binding.receiptId,workerRevision:binding.workerRevision,requestIdentity,httpStatus,providerRemaining,responseDigest,requestCount:1,weight:WEIGHT,quotaBefore,quotaAfter,courseWrites:0,globalRefreshEnabled:false,failure};
  return Object.freeze({...payload,digest:d.digest(payload),immutable:true});
}
module.exports=Object.freeze({COUNTRY,WEIGHT,arm,bindingMatches,bindingPayload,claim,receipt});
