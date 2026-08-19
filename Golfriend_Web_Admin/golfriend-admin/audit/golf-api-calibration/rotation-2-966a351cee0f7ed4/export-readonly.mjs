#!/usr/bin/env node
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),PROJECT='golfriend-v2',REGION='asia-southeast1',SECRET_VERSION='2',ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`,RECEIPT_ID='rotation-2-966a351cee0f7ed4',PREVIOUS_RECEIPT_ID='rotation-2-e9095a6dda494571';
const providerFunctions=['scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries','scheduledGolfApiCatalogueCanary','runGolfApiCalibrationCanary'],schedulerFunctions=['scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries','scheduledGolfApiCatalogueCanary'],armFunction='armGolfApiCalibrationCanary';
const auth=require(process.env.FIREBASE_TOOLS_AUTH_MODULE||'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth'),account=auth.getGlobalDefaultAccount(),scopes=Array.isArray(account.tokens.scopes)?account.tokens.scopes:String(account.tokens.scope||'').split(/\s+/).filter(Boolean),credential=await auth.getAccessToken(account.tokens.refresh_token,scopes),access=credential.access_token;
const decode=value=>value?.stringValue??value?.booleanValue??value?.timestampValue??(value?.integerValue!==undefined?Number(value.integerValue):value?.doubleValue??(value?.nullValue===null?null:value?.mapValue?Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)])):value?.arrayValue?(value.arrayValue.values||[]).map(decode):undefined));
async function google(url){const response=await fetch(url,{headers:{Authorization:`Bearer ${access}`}}),body=await response.text();if(!response.ok)throw Error(`GOOGLE_${response.status}:${body.slice(0,160)}`);return body?JSON.parse(body):{};}
async function document(collection,id){const value=await google(`${ROOT}/${collection}/${id}`);return{path:`${collection}/${id}`,createTime:value.createTime,updateTime:value.updateTime,fields:Object.fromEntries(Object.entries(value.fields||{}).map(([key,item])=>[key,decode(item)]))};}
const [secret,functions,jobs,activation,previousActivation,config,checkpoint]=await Promise.all([
  google(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GOLF_API_KEY/versions/${SECRET_VERSION}`),
  google(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100`),
  google(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs?pageSize=100`),
  document('course_catalogue_activation_receipts',RECEIPT_ID),
  document('course_catalogue_activation_receipts',PREVIOUS_RECEIPT_ID),
  document('platform','golfApiCatalogueConfig'),
  document('course_acquisition_checkpoints','golf-api'),
]);
const deployedFunctions={};
for(const name of [...providerFunctions,armFunction]){const fn=(functions.functions||[]).find(item=>item.name.endsWith(`/functions/${name}`));if(!fn)throw Error(`FUNCTION_MISSING:${name}`);const service=fn.serviceConfig?.service?.split('/').pop(),runService=await google(`https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${service}`);deployedFunctions[name]={name:fn.name,state:fn.state,updateTime:fn.updateTime,service,revisionResource:runService.latestReadyRevision,secretBindings:(fn.serviceConfig?.secretEnvironmentVariables||[]).filter(item=>item.key==='GOLF_API_KEY').map(item=>({key:item.key,secret:item.secret,version:item.version}))};}
const schedulers={};
for(const name of schedulerFunctions){const matches=(jobs.jobs||[]).filter(item=>item.name.toLowerCase().includes(name.toLowerCase()));if(matches.length!==1)throw Error(`SCHEDULER_SET_INVALID:${name}`);const job=matches[0];schedulers[name]={name:job.name,state:job.state,schedule:job.schedule,timeZone:job.timeZone,lastAttemptTime:job.lastAttemptTime??null};}
const calibrationSchedulerMatches=(jobs.jobs||[]).filter(item=>item.name.toLowerCase().includes('calibration')).map(item=>({name:item.name,state:item.state,schedule:item.schedule}));
console.log(JSON.stringify({schema:'golfriend.golf-api-calibration-deployment-export.v1',capturedAt:new Date().toISOString(),projectId:PROJECT,region:REGION,providerRequests:0,calibrationCalls:0,canaryCalls:0,secretValueAccessed:false,secret:{name:'GOLF_API_KEY',version:SECRET_VERSION,state:secret.state,createTime:secret.createTime},documents:{activation,previousActivation,config,checkpoint},deployedFunctions,schedulers,calibrationSchedulerMatches},null,2));
