#!/usr/bin/env node
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const PROJECT='golfriend-v2';
const REGION='asia-southeast1';
const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ACTIVATION_ID='rotation-2-e9095a6dda494571';
const CANARY_ID='canary-1787109317706-8f431958';
const EVIDENCE_ID='canary-1787109317706-8f431958-20291da5-c734-41ed-9d62-cc6600a69466';
const REQUESTED_RESERVATION_ID='20291da5-20291da5-c734-41ed-9d62-cc6600a69466';
const functionsRequired=['scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries','scheduledGolfApiCatalogueCanary'];
const auth=require(process.env.FIREBASE_TOOLS_AUTH_MODULE||'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
const account=auth.getGlobalDefaultAccount();
const scopes=Array.isArray(account.tokens.scopes)?account.tokens.scopes:String(account.tokens.scope||'').split(/\s+/).filter(Boolean);
const credential=await auth.getAccessToken(account.tokens.refresh_token,scopes);
const access=credential.access_token;

const decode=value=>value?.stringValue??value?.booleanValue??value?.timestampValue??(value?.integerValue!==undefined?Number(value.integerValue):value?.doubleValue??(value?.nullValue===null?null:value?.mapValue?Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)])):value?.arrayValue?(value.arrayValue.values||[]).map(decode):undefined));
async function google(url){const response=await fetch(url,{headers:{Authorization:`Bearer ${access}`}}),body=await response.text();if(!response.ok)throw Error(`GOOGLE_${response.status}:${body.slice(0,160)}`);return body?JSON.parse(body):{};}
async function document(collection,id,optional=false){const response=await fetch(`${ROOT}/${collection}/${id}`,{headers:{Authorization:`Bearer ${access}`}}),body=await response.text();if(optional&&response.status===404)return{path:`${collection}/${id}`,found:false};if(!response.ok)throw Error(`GOOGLE_${response.status}:${body.slice(0,160)}`);const value=JSON.parse(body);return{path:`${collection}/${id}`,found:true,createTime:value.createTime,updateTime:value.updateTime,fields:Object.fromEntries(Object.entries(value.fields||{}).map(([key,item])=>[key,decode(item)]))};}

const [activation,canary,quotaEvidence,requestedReservation,ledger,config,checkpoint,functions,jobs]=await Promise.all([
  document('course_catalogue_activation_receipts',ACTIVATION_ID),
  document('golf_api_canary_receipts',CANARY_ID),
  document('golf_api_quota_evidence',EVIDENCE_ID),
  document('golf_api_quota_reservations',REQUESTED_RESERVATION_ID,true),
  document('golf_api_quota','2026-08'),
  document('platform','golfApiCatalogueConfig'),
  document('course_acquisition_checkpoints','golf-api'),
  google(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100`),
  google(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs?pageSize=100`),
]);
const actualReservationId=quotaEvidence.fields.reservationId;
if(typeof actualReservationId!=='string'||!actualReservationId)throw Error('EVIDENCE_RESERVATION_ID_MISSING');
const reservation=actualReservationId===REQUESTED_RESERVATION_ID?requestedReservation:await document('golf_api_quota_reservations',actualReservationId);
const providerFunctions={};
for(const name of functionsRequired){
  const fn=(functions.functions||[]).find(item=>item.name.endsWith(`/functions/${name}`));
  if(!fn)throw Error(`FUNCTION_MISSING:${name}`);
  const service=fn.serviceConfig?.service?.split('/').pop();
  const runService=await google(`https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${service}`);
  const bindings=(fn.serviceConfig?.secretEnvironmentVariables||[]).filter(item=>item.key==='GOLF_API_KEY').map(item=>({key:item.key,secret:item.secret,version:item.version}));
  providerFunctions[name]={name:fn.name,state:fn.state,updateTime:fn.updateTime,service,revisionResource:runService.latestReadyRevision,secretBindings:bindings};
}
const schedulers={};
for(const name of functionsRequired){
  const matches=(jobs.jobs||[]).filter(item=>item.name.toLowerCase().includes(name.toLowerCase()));
  if(matches.length!==1)throw Error(`SCHEDULER_SET_INVALID:${name}`);
  const job=matches[0];
  schedulers[name]={name:job.name,state:job.state,schedule:job.schedule,timeZone:job.timeZone,lastAttemptTime:job.lastAttemptTime??null};
}
console.log(JSON.stringify({schema:'golfriend.golf-api-canary-operational-evidence-export.v1',exportedAt:new Date().toISOString(),projectId:PROJECT,region:REGION,providerRequests:0,secretValueAccessed:false,documents:{activation,canary,quotaEvidence,requestedReservation,reservation,ledger,config,checkpoint},deployedMetadata:{providerFunctions,schedulers}},null,2));
