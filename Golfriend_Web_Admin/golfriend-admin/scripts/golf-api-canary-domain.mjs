import {createHash} from 'node:crypto';

export const sha256=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const providerNumber=value=>{const number=Number(value);return Number.isFinite(number)?number:null;};
const validId=value=>{const id=String(value??'').trim();return id&&id.length<=160&&/^[A-Za-z0-9_-]+$/.test(id)?id:null;};
const firstId=(row,fields)=>{for(const field of fields){const id=validId(row?.[field]);if(id)return{field,id};}return null;};
export const CLUB_ID_FIELDS=Object.freeze(['clubId','clubID','club_id','golfClubId','golfClubID','id']);
export const COURSE_ID_FIELDS=Object.freeze(['courseId','courseID','course_id','id']);

export function extractProviderMetadata(body){
  const pagination=body?.pagination??body?.page??body?.links??null;
  return Object.freeze({apiRequestsLeft:providerNumber(body?.apiRequestsLeft),numAllClubs:providerNumber(body?.numAllClubs),numClubs:providerNumber(body?.numClubs),pagination:pagination&&typeof pagination==='object'?pagination:null,topLevelFields:body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body).sort():[]});
}

export function decodeCatalogue(body,existingCourseIds=new Set()){
  const rows=Array.isArray(body?.clubs)?body.clubs:[];
  const validClubs=[],quarantine=[],courseMappings=[];
  rows.forEach((row,index)=>{
    const sourceDigest=sha256(row),clubIdentity=firstId(row,CLUB_ID_FIELDS);
    if(!clubIdentity){quarantine.push(Object.freeze({level:'club',index,reason:'MISSING_OR_INVALID_CLUB_ID',sourceDigest}));return;}
    const courses=Array.isArray(row?.courses)?row.courses:[];
    const mapped=[];
    courses.forEach((course,courseIndex)=>{
      const identity=firstId(course,COURSE_ID_FIELDS),courseDigest=sha256(course);
      if(!identity){quarantine.push(Object.freeze({level:'course',clubId:clubIdentity.id,index:courseIndex,reason:'MISSING_OR_INVALID_COURSE_ID',sourceDigest:courseDigest}));return;}
      const mapping=Object.freeze({clubId:clubIdentity.id,clubIdentifierField:clubIdentity.field,courseId:identity.id,courseIdentifierField:identity.field,existing:existingCourseIds.has(identity.id),sourceDigest:courseDigest});
      mapped.push(mapping);courseMappings.push(mapping);
    });
    validClubs.push(Object.freeze({clubId:clubIdentity.id,identifierField:clubIdentity.field,sourceDigest,courses:Object.freeze(mapped),existingByClubId:existingCourseIds.has(clubIdentity.id)}));
  });
  const existingMappings=courseMappings.filter(x=>x.existing),newMappings=courseMappings.filter(x=>!x.existing);
  return Object.freeze({metadata:extractProviderMetadata(body),validClubs:Object.freeze(validClubs),quarantine:Object.freeze(quarantine),courseMappings:Object.freeze(courseMappings),existingMappings:Object.freeze(existingMappings),newMappings:Object.freeze(newMappings)});
}

export function replayRetainedRaw(raw,existingCourseIds=new Set(),network=()=>{throw Error('NETWORK_FORBIDDEN_DURING_REPLAY');}){
  void network;
  const parsed=JSON.parse(raw);
  return Object.freeze({rawDigest:sha256(raw),...decodeCatalogue(parsed,existingCourseIds),providerRequests:0});
}
