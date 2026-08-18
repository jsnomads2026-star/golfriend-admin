import {createHash} from 'node:crypto';

export const PAGE_SIZE=200;
export const MAX_REQUESTS_PER_SECOND=5;
export const IMPORT_VERSION='golfriend.golf-api-catalogue.v1';
export const sha256=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const text=value=>{const valueText=String(value??'').trim().normalize('NFC');return valueText||null;};
const id=value=>{const candidate=text(value);return candidate&&candidate.length<=160&&/^[A-Za-z0-9_-]+$/.test(candidate)?candidate:null;};
const finite=(value,min,max)=>{const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;};

export function catalogueUrl(page){
  if(!Number.isInteger(page)||page<1)throw Error('INVALID_PAGE');
  return `/api/v2.3/clubs?page=${page}&pageSize=${PAGE_SIZE}`;
}

export function quotaDecision({apiRequestsLeft,reserve,cost}){
  const left=Number(apiRequestsLeft),safeReserve=Number(reserve),requestCost=Number(cost);
  if(!Number.isFinite(left)||!Number.isFinite(safeReserve)||safeReserve<0||!Number.isFinite(requestCost)||requestCost<=0)return{allowed:false,reason:'QUOTA_UNKNOWN'};
  return left-requestCost>=safeReserve?{allowed:true,remainingAfter:left-requestCost}:{allowed:false,reason:'RESERVE_REACHED'};
}

export function nextCheckpoint(checkpoint,pageResult){
  const page=Number(checkpoint?.nextPage||1),rows=Number(pageResult?.clubCount||0);
  return {...checkpoint,lastSuccessfulPage:page,nextPage:rows<PAGE_SIZE?null:page+1,sourceTimestamp:pageResult.sourceTimestamp??null,apiRequestsLeft:pageResult.apiRequestsLeft,updatedAt:pageResult.completedAt};
}

export function createRateLimiter({now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let starts=[];
  return async()=>{const current=now();starts=starts.filter(value=>current-value<1000);if(starts.length>=MAX_REQUESTS_PER_SECOND){const delay=1000-(current-starts[0]);await wait(delay);starts=starts.filter(value=>now()-value<1000);}starts.push(now());};
}

export function decodeClubPage(body){
  const rows=Array.isArray(body?.clubs)?body.clubs:[];
  const clubs=[],quarantine=[],seen=new Set();
  rows.forEach((raw,index)=>{const clubID=id(raw?.clubID);if(!clubID){quarantine.push({level:'club',index,reason:'MISSING_OR_INVALID_CLUB_ID',sourceDigest:sha256(raw)});return;}if(seen.has(clubID)){quarantine.push({level:'club',index,clubID,reason:'DUPLICATE_CLUB_ID',sourceDigest:sha256(raw)});return;}seen.add(clubID);clubs.push({clubID,summary:raw});});
  const apiRequestsLeft=Number(body?.apiRequestsLeft);
  return{clubs,quarantine,apiRequestsLeft:Number.isFinite(apiRequestsLeft)?apiRequestsLeft:null,sourceTimestamp:text(body?.timestampUpdated??body?.updatedAt),numAllClubs:Number.isFinite(Number(body?.numAllClubs))?Number(body.numAllClubs):null};
}

function contact(raw){const value={phone:text(raw?.phone??raw?.telephone),email:text(raw?.email),website:text(raw?.website??raw?.url)};return Object.values(value).some(Boolean)?value:null;}
export function normalizeClubDetail(body,summary={}){
  const raw=body?.club??body?.data??body;
  const club=Array.isArray(raw)?raw[0]:raw;
  const clubID=id(club?.clubID??summary?.clubID);
  if(!clubID)return{records:[],quarantine:[{level:'club',reason:'MISSING_OR_INVALID_CLUB_ID',sourceDigest:sha256(body)}]};
  const courses=Array.isArray(club?.courses)?club.courses:Array.isArray(summary?.courses)?summary.courses:[];
  const records=[],quarantine=[],seen=new Set();
  courses.forEach((course,index)=>{const courseID=id(course?.courseID);if(!courseID){quarantine.push({level:'course',clubID,index,reason:'MISSING_OR_INVALID_COURSE_ID',sourceDigest:sha256(course)});return;}if(seen.has(courseID)){quarantine.push({level:'course',clubID,courseID,index,reason:'DUPLICATE_COURSE_ID',sourceDigest:sha256(course)});return;}seen.add(courseID);
    const name=text(course?.courseName??course?.name),clubName=text(club?.clubName??club?.name??summary?.clubName??summary?.name);if(!name||!clubName){quarantine.push({level:'course',clubID,courseID,index,reason:'MISSING_NAME',sourceDigest:sha256(course)});return;}
    const latitude=finite(course?.latitude??club?.latitude??summary?.latitude,-90,90),longitude=finite(course?.longitude??club?.longitude??summary?.longitude,-180,180);
    records.push({schema:'golfriend.v2.course.v2',schemaVersion:2,importVersion:IMPORT_VERSION,provider:'golf-api',providerClubId:clubID,providerCourseId:courseID,clubID,courseID,name,displayName:name,clubName,address:text(club?.address??summary?.address),city:text(club?.city??summary?.city),state:text(club?.state??summary?.state),country:text(club?.country??summary?.country),latitude,longitude,lat:latitude,lng:longitude,contact:contact(club),holes:Array.isArray(course?.holes)?course.holes:null,tees:Array.isArray(course?.tees)?course.tees:null,ratings:course?.ratings??null,sourceUpdatedAt:text(course?.timestampUpdated??club?.timestampUpdated??body?.timestampUpdated),sourceDigest:sha256(course),needsReview:latitude===null||longitude===null,coordinateValidity:latitude===null||longitude===null?'missing':'valid'});
  });return{records,quarantine};
}

const CURATED=new Set(['manualLock','gpsTrusted','curated','curatedFields','heroAsset','description','bookingUrl','operator','verified','isActive','publicationVersion','publicationDigest','createdAt','createdBy']);
export function mergePreservingCurated(existing,incoming){
  if(!existing)return{record:incoming,change:'created'};
  const merged={...existing,...incoming};for(const key of CURATED)if(Object.hasOwn(existing,key))merged[key]=existing[key];
  if(existing.manualLock===true||existing.gpsTrusted===true){for(const key of ['latitude','longitude','lat','lng','coordinateValidity','needsReview'])if(Object.hasOwn(existing,key))merged[key]=existing[key];}
  const unchanged=sha256({...existing,updatedAt:undefined,providerFetchedAt:undefined})===sha256({...merged,updatedAt:undefined,providerFetchedAt:undefined});
  return{record:merged,change:unchanged?'unchanged':'updated'};
}

export function initialProgress(previous={}){return{scanned:Number(previous.scanned||0),created:Number(previous.created||0),updated:Number(previous.updated||0),unchanged:Number(previous.unchanged||0),quarantined:Number(previous.quarantined||0),failed:Number(previous.failed||0)};}
