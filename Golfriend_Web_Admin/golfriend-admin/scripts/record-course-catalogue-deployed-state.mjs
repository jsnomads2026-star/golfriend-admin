#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),PROJECT='golfriend-v2',REGION='asia-southeast1',SECRET_VERSION='2',ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const auth=require(process.env.FIREBASE_TOOLS_AUTH_MODULE||'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
const account=auth.getGlobalDefaultAccount(),scopes=Array.isArray(account.tokens.scopes)?account.tokens.scopes:String(account.tokens.scope||'').split(/\s+/).filter(Boolean),credential=await auth.getAccessToken(account.tokens.refresh_token,scopes),access=credential.access_token;
const canonicalize=value=>Array.isArray(value)?value.map(canonicalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])])):value;
const canonicalJson=value=>JSON.stringify(canonicalize(value));
const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const encode=value=>value===null?{nullValue:null}:typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?(Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}):Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
async function google(url,init={}){const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',...(init.headers||{})}}),body=await response.text();if(!response.ok)throw Error(`GOOGLE_${response.status}:${body.slice(0,160)}`);return body?JSON.parse(body):{};}
const requiredFunctions=['scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries'];
const [secret,functions,jobs,...indexPages]=await Promise.all([
  google(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GOLF_API_KEY/versions/${SECRET_VERSION}`),
  google(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100`),
  google(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs?pageSize=100`),
  google(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/course_catalogue_failures/indexes`),
  google(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/golf_api_quota_reservations/indexes`),
]);
const indexes={indexes:indexPages.flatMap(page=>page.indexes||[])};
if(secret.state!=='ENABLED')throw Error('SECRET_VERSION_NOT_ENABLED');
const providerFunctions={};
for(const name of requiredFunctions){const fn=(functions.functions||[]).find(item=>item.name.endsWith(`/functions/${name}`));if(!fn)throw Error(`FUNCTION_MISSING:${name}`);const binding=(fn.serviceConfig?.secretEnvironmentVariables||[]).find(item=>item.key==='GOLF_API_KEY');if(!binding||binding.secret!=='GOLF_API_KEY'||binding.version!==SECRET_VERSION)throw Error(`FUNCTION_SECRET_VERSION_MISMATCH:${name}`);providerFunctions[name]={secretVersion:binding.version,revision:fn.serviceConfig.revision,service:fn.serviceConfig.service};}
const schedulerStates={};
for(const name of requiredFunctions){const job=(jobs.jobs||[]).find(item=>item.name.toLowerCase().includes(name.toLowerCase()));if(!job||job.state!=='PAUSED')throw Error(`SCHEDULER_NOT_PAUSED:${name}`);schedulerStates[name]={name:job.name,state:job.state,schedule:job.schedule,timeZone:job.timeZone};}
const expectedIndexes=[['course_catalogue_failures','retryState','nextRetryAt'],['golf_api_quota_reservations','status','expiresAt']];
const indexStates=expectedIndexes.map(([collectionGroup,first,second])=>{const index=(indexes.indexes||[]).find(item=>item.name.includes(`/collectionGroups/${collectionGroup}/`)&&item.fields?.[0]?.fieldPath===first&&item.fields?.[1]?.fieldPath===second);if(!index||index.state!=='READY')throw Error(`INDEX_NOT_READY:${collectionGroup}`);return{collectionGroup,fields:[first,second],state:index.state,name:index.name};});
const createdAt=new Date().toISOString(),evidence={schema:'golfriend.course-catalogue-deployed-state-evidence.v1',projectId:PROJECT,region:REGION,secret:{name:'GOLF_API_KEY',version:SECRET_VERSION,state:secret.state},providerFunctions,schedulers:schedulerStates,indexes:indexStates,createdAt,providerRequests:0,secretValueAccessed:false};
const evidenceDigest=digest(evidence),receiptId=`${Date.now()}-${evidenceDigest.slice(0,16)}`,receipt={...evidence,receiptId,evidenceDigest,canonicalization:'recursive-lexicographic-json-v1',immutable:true,signingAuthority:'firebase-admin-service-identity'};
await google(`${ROOT}/course_catalogue_deployed_state_receipts?documentId=${encodeURIComponent(receiptId)}`,{method:'POST',body:JSON.stringify({fields:Object.fromEntries(Object.entries(receipt).map(([key,value])=>[key,encode(value)]))})});
console.log(JSON.stringify({...receipt,canonicalEvidence:canonicalJson(evidence)}));
