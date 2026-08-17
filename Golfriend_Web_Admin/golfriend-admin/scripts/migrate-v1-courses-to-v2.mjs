#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {planMigration, SOURCE_PROJECT, TARGET_PROJECT, MIGRATION_VERSION} from './course-v1-v2-migration-domain.mjs';

const require=createRequire(import.meta.url), args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
const mode=args.mode, backup=args.backup, migratedAt=args['migrated-at'];
if(!['backup','dry-run','apply','verify'].includes(mode)||!backup)throw Error('USAGE: --mode=backup|dry-run|apply|verify --backup=ABSOLUTE_PATH [--migrated-at=ISO]');
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;

async function token(){
  if(process.env.GOOGLE_OAUTH_ACCESS_TOKEN)return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const location=process.env.FIREBASE_TOOLS_AUTH_MODULE||'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth';
  const auth=require(location),account=auth.getGlobalDefaultAccount();
  if(!account?.tokens?.refresh_token)throw Error('AUTHORIZED_FIREBASE_CLI_ACCOUNT_REQUIRED');
  const scopes=Array.isArray(account.tokens.scopes)?[...account.tokens.scopes]:String(account.tokens.scope||'').split(/\s+/).filter(Boolean);
  const credential=await auth.getAccessToken(account.tokens.refresh_token,scopes);
  if(!credential?.access_token)throw Error('ACCESS_TOKEN_UNAVAILABLE');
  return credential.access_token;
}
async function api(url,access,init={}){const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',...(init.headers||{})}});if(!response.ok){const body=await response.text();throw Error(`FIRESTORE_${response.status}:${body.slice(0,500)}`)}return response.status===204?{}:response.json();}
const root=project=>`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
async function list(project,collection,access){let pageToken=null,documents=[];do{const url=new URL(`${root(project)}/${collection}`);url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);const page=await api(url,access);documents.push(...(page.documents||[]));pageToken=page.nextPageToken||null;}while(pageToken);return documents;}
function decode(v){if(!v)return null;if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));return null;}
function encode(v){if(v===null||v===undefined)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};throw Error('UNSUPPORTED_FIELD');}
const docId=value=>decodeURIComponent((typeof value==='string'?value:value.name).split('/').pop());
const decoded=doc=>({id:docId(doc.name),data:Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)]))});
const document=(collection,id,value)=>({name:`projects/${TARGET_PROJECT}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))});
async function loadBackup(){const raw=await readFile(backup,'utf8'),expected=(await readFile(`${backup}.sha256`,'utf8')).trim();if(sha(raw)!==expected)throw Error('BACKUP_HASH_MISMATCH');const parsed=JSON.parse(raw);if(parsed.sourceProject!==SOURCE_PROJECT||parsed.sourceCollection!=='courses'||parsed.documents.length!==3266)throw Error('BACKUP_INVARIANT_FAILED');return{raw,parsed,rows:parsed.documents.map(decoded)};}
function summary(plan){return{schema:'golfriend.course-migration-summary.v1',sourceProject:SOURCE_PROJECT,targetProject:TARGET_PROJECT,input:plan.input,canonicalCandidates:plan.canonical.length,quarantine:plan.quarantine.length,duplicateProviderIds:plan.duplicates.length,missingCoordinates:plan.canonical.filter(x=>x.value.coordinateValidity!=='valid').length,unknownFreshness:plan.canonical.filter(x=>x.value.freshnessState==='unknown').length,sourceDigest:plan.digest,providerRequests:0};}

const access=await token();
if(mode==='backup'){
  const documents=await list(SOURCE_PROJECT,'courses',access),payload=JSON.stringify({schema:'golfriend.course-v1-backup.v1',sourceProject:SOURCE_PROJECT,sourceCollection:'courses',exportedAt:new Date().toISOString(),documents});
  await writeFile(backup,payload,{flag:'wx'});await writeFile(`${backup}.sha256`,`${sha(payload)}\n`,{flag:'wx'});console.log(JSON.stringify({mode,documents:documents.length,sha256:sha(payload),providerRequests:0}));process.exit(0);
}
const loaded=await loadBackup(),fixedMigratedAt=migratedAt||loaded.parsed.exportedAt,plan=planMigration(loaded.rows,fixedMigratedAt),report=summary(plan);
if(report.input!==3266||report.canonicalCandidates!==3265||report.quarantine!==1||report.duplicateProviderIds!==0||report.missingCoordinates!==10)throw Error(`DRY_RUN_INVARIANT_FAILED:${JSON.stringify(report)}`);
if(mode==='dry-run'){console.log(JSON.stringify({mode,...report}));process.exit(0);}
const targetCourses=await list(TARGET_PROJECT,'courses',access),targetSources=await list(TARGET_PROJECT,'course_migration_sources',access),targetReceipts=await list(TARGET_PROJECT,'course_migration_receipts',access),targetQuarantine=await list(TARGET_PROJECT,'course_migration_quarantine',access);
const existing={courses:new Set(targetCourses.map(docId)),sources:new Set(targetSources.map(docId)),receipts:new Set(targetReceipts.map(docId)),quarantine:new Set(targetQuarantine.map(docId))};
if(mode==='verify'){
  const actual={courses:existing.courses.size,sources:existing.sources.size,receipts:existing.receipts.size,quarantine:existing.quarantine.size};
  const decodedCourses=new Map(targetCourses.map(x=>{const row=decoded(x);return[row.id,row.data]})),decodedSources=new Map(targetSources.map(x=>{const row=decoded(x);return[row.id,row.data]}));
  const digestMatches=plan.canonical.filter(item=>decodedCourses.get(item.id)?.preservedSourceDigest===item.value.preservedSourceDigest&&decodedSources.get(item.rawId)?.preservedSourceDigest===item.value.preservedSourceDigest&&JSON.stringify(stable(decodedSources.get(item.rawId)?.raw))===JSON.stringify(stable(item.raw))).length;
  const representativeCountries=['Thailand','United States','Japan','South Korea','United Kingdom'].map(country=>({country,count:[...decodedCourses.values()].filter(x=>x.country===country).length}));
  const verified=actual.courses===3265&&actual.sources===3266&&actual.receipts===3266&&actual.quarantine===1&&digestMatches===3265&&representativeCountries.every(x=>x.count>0);
  console.log(JSON.stringify({mode,...report,actual,digestMatches,representativeCountries,verified,providerRequests:0}));process.exit(verified?0:2);
}
const writes=[];
for(const item of [...plan.canonical,...plan.quarantine]){
  const targetCollection=item.kind==='canonical'?'courses':'course_migration_quarantine';
  const receiptId=sha([MIGRATION_VERSION,item.kind,item.id]).slice(0,40);
  if(!existing.sources.has(item.rawId))writes.push({update:document('course_migration_sources',item.rawId,{schema:'golfriend.course-migration-source.v1',sourceProject:SOURCE_PROJECT,sourceCollection:'courses',legacyDocumentId:item.value.originalLegacyDocumentId||item.value.legacyDocumentId,preservedSourceDigest:item.value.preservedSourceDigest,raw:item.raw}),currentDocument:{exists:false}});
  if(!(item.kind==='canonical'?existing.courses:existing.quarantine).has(item.id))writes.push({update:document(targetCollection,item.id,item.value),currentDocument:{exists:false}});
  if(!existing.receipts.has(receiptId))writes.push({update:document('course_migration_receipts',receiptId,{schema:'golfriend.course-migration-receipt.v1',migrationVersion:MIGRATION_VERSION,sourceProject:SOURCE_PROJECT,targetProject:TARGET_PROJECT,legacyDocumentId:item.value.originalLegacyDocumentId||item.value.legacyDocumentId,targetCollection,targetDocumentId:item.id,preservedSourceDigest:item.value.preservedSourceDigest,migratedAt:fixedMigratedAt,providerRequests:0}),currentDocument:{exists:false}});
}
let committed=0;for(let i=0;i<writes.length;i+=300){const batch=writes.slice(i,i+300);await api(`https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)/documents:commit`,access,{method:'POST',body:JSON.stringify({writes:batch})});committed+=batch.length;console.log(JSON.stringify({state:'progress',committed,totalWrites:writes.length,providerRequests:0}));}
const checkpoint={schema:'golfriend.course-migration-checkpoint.v1',migrationVersion:MIGRATION_VERSION,state:'complete',sourceCount:report.input,canonicalCount:report.canonicalCandidates,quarantineCount:report.quarantine,sourceDigest:report.sourceDigest,backupSha256:sha(loaded.raw),completedAt:fixedMigratedAt,providerRequests:0};
if(writes.length)await api(`${root(TARGET_PROJECT)}/course_migration_checkpoints/${MIGRATION_VERSION}`,access,{method:'PATCH',body:JSON.stringify({fields:Object.fromEntries(Object.entries(checkpoint).map(([k,v])=>[k,encode(v)]))})});
console.log(JSON.stringify({mode,...report,writes:committed,checkpoint:`${TARGET_PROJECT}/course_migration_checkpoints/${MIGRATION_VERSION}`,providerRequests:0}));
