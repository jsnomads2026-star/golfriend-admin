'use strict';

// A deliberately closed calibration target set.  The callable never accepts a club,
// course, search term, or layout from its caller.
const TARGETS=Object.freeze([
  {key:'siam_country_club_pattaya',label:'Siam Country Club Pattaya layouts',providerClubId:'141519520199806521'},
  {key:'laem_chabang',label:'Laem Chabang International Country Club',providerClubId:'141519520199137592'},
  {key:'phoenix',label:'Phoenix Gold Golf & Country Club',providerClubId:'141519520199456942'},
  {key:'burapha',label:'Burapha Golf Club',searchQuery:'Burapha',acceptedNames:['burapha golf club','burapha golf & resort','burapha']},
  {key:'khao_kheow',label:'Khao Kheow Country Club',providerClubId:'141519520199057797'},
  {key:'chee_chan',label:'Chee Chan Golf Resort',providerClubId:'1618236956711724'},
]);

const value=(object,fields)=>{
  for(const field of fields)if(Object.hasOwn(object||{},field)&&object[field]!==null&&object[field]!==undefined)return{field,value:object[field]};
  return{field:null,value:null};
};
const list=(object,fields)=>{
  const found=value(object,fields);
  return Array.isArray(found.value)?found:{field:found.field,value:null};
};
const text=value=>typeof value==='string'&&value.trim()?value.trim():null;
const normalized=value=>String(value||'').trim().normalize('NFC').toLocaleLowerCase();
const responseClub=body=>{const raw=body?.club??body?.data??body;return Array.isArray(raw)?raw[0]||null:raw&&typeof raw==='object'?raw:null;};
const searchClubs=body=>Array.isArray(body?.clubs)?body.clubs:Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];

function publicTargets(){return TARGETS.map(({key,label})=>({key,label}));}
function targetFor(key){const target=TARGETS.find(item=>item.key===key);if(!target)throw Error('SIX_COURSE_TARGET_UNKNOWN');return target;}
function targetDigest(digest){return digest(publicTargets());}

function preserveHole(hole){
  const number=value(hole,['holeNumber','number']),par=value(hole,['par']),strokeIndex=value(hole,['strokeIndex','stroke_index','handicap']);
  const yardage=value(hole,['yardageByTee','yardages','yards','yardage']);
  return{holeNumber:number.value,par:par.value,strokeIndex:strokeIndex.value,yardageByTee:yardage.value,sourceFields:{holeNumber:number.field,par:par.field,strokeIndex:strokeIndex.field,yardageByTee:yardage.field}};
}
function preserveTee(tee){
  const name=value(tee,['teeName','name','colour','color']),colour=value(tee,['teeColour','teeColor','colour','color']),yardage=value(tee,['yardage','yards','length']);
  const rating=value(tee,['courseRating','rating']),slope=value(tee,['slopeRating','slope']);
  return{name:name.value,colour:colour.value,yardage:yardage.value,courseRating:rating.value,slopeRating:slope.value,sourceFields:{name:name.field,colour:colour.field,yardage:yardage.field,courseRating:rating.field,slopeRating:slope.field}};
}
function preserveLayout(raw,index){
  const layoutId=value(raw,['courseID','courseId','id']),name=value(raw,['courseName','name']),updatedAt=value(raw,['timestampUpdated','updatedAt']);
  const holes=list(raw,['holes']),tees=list(raw,['tees','teeBoxes','teeBox']);
  const ratings={courseRating:value(raw,['courseRating','rating']).value,slopeRating:value(raw,['slopeRating','slope']).value};
  const composition={};
  for(const field of ['frontNine','backNine','nines','segments','composition','courseComposition','layoutComposition'])if(Object.hasOwn(raw||{},field))composition[field]=raw[field];
  return{providerLayoutId:layoutId.value,layoutName:name.value,providerUpdatedAt:updatedAt.value,sourceFields:{providerLayoutId:layoutId.field,layoutName:name.field,providerUpdatedAt:updatedAt.field,holes:holes.field,tees:tees.field},holes:holes.value?.map(preserveHole)||null,tees:tees.value?.map(preserveTee)||null,courseRating:ratings.courseRating,slopeRating:ratings.slopeRating,nineHoleComposition:Object.keys(composition).length?composition:null,layoutRaw:raw};
}
function completeHoles(holes){
  if(!Array.isArray(holes)||holes.length!==18)return false;
  const numbers=holes.map(hole=>Number(hole.holeNumber));
  const indices=holes.map(hole=>Number(hole.strokeIndex));
  return numbers.every(number=>Number.isInteger(number)&&number>=1&&number<=18)&&new Set(numbers).size===18&&holes.every(hole=>Number.isInteger(Number(hole.par))&&Number(hole.par)>=3&&Number(hole.par)<=5)&&indices.every(number=>Number.isInteger(number)&&number>=1&&number<=18)&&new Set(indices).size===18;
}
function hasTeeYardage(layout){return Array.isArray(layout.tees)&&layout.tees.some(tee=>Number.isFinite(Number(tee.yardage)));}
function hasRating(layout){return Number.isFinite(Number(layout.courseRating))&&Number.isFinite(Number(layout.slopeRating))||Array.isArray(layout.tees)&&layout.tees.some(tee=>Number.isFinite(Number(tee.courseRating))&&Number.isFinite(Number(tee.slopeRating)));}
function classify({resolution,layouts}){
  if(resolution==='ambiguous')return'C';
  if(resolution!=='matched'||!layouts.length)return'D';
  if(layouts.some(layout=>completeHoles(layout.holes)&&hasTeeYardage(layout)&&hasRating(layout)))return'A';
  return'B';
}
function evidenceForDetail(target,body,observedAt,providerEvidenceId,responseDigest,providerRemaining){
  const club=responseClub(body),courses=list(club,['courses']),layouts=(courses.value||[]).map(preserveLayout);
  const clubId=value(club,['clubID','clubId','id']),clubName=value(club,['clubName','name']),updatedAt=value(club,['timestampUpdated','updatedAt']);
  const matched=target.providerClubId?String(clubId.value||'')===target.providerClubId:true;
  const resolution=matched?'matched':'unmatched';
  return{target:{key:target.key,label:target.label},classification:classify({resolution,layouts}),resolution,provider:{clubId:clubId.value,clubName:clubName.value,updatedAt:updatedAt.value,sourceFields:{clubId:clubId.field,clubName:clubName.field,updatedAt:updatedAt.field},providerEvidenceId,responseDigest,providerRemaining,observedAt},layouts};
}
function buraphaResolution(target,body){
  const candidates=searchClubs(body).map(item=>({clubId:value(item,['clubID','clubId','id']).value,clubName:value(item,['clubName','name']).value,updatedAt:value(item,['timestampUpdated','updatedAt']).value}));
  const matches=candidates.filter(item=>target.acceptedNames.includes(normalized(item.clubName)));
  if(matches.length===1)return{state:'matched',match:matches[0],candidates};
  return{state:matches.length>1?'ambiguous':'not_found',match:null,candidates};
}
function evidenceForBuraphaSearch(target,body,observedAt,providerEvidenceId,responseDigest,providerRemaining){
  const resolution=buraphaResolution(target,body);
  return{target:{key:target.key,label:target.label},classification:resolution.state==='ambiguous'?'C':'D',resolution:resolution.state,provider:{searchQuery:target.searchQuery,providerEvidenceId,responseDigest,providerRemaining,observedAt},providerSearchCandidates:resolution.candidates,layouts:[],matchedClub:resolution.match};
}

module.exports={TARGETS,buraphaResolution,classify,completeHoles,evidenceForBuraphaSearch,evidenceForDetail,hasRating,hasTeeYardage,publicTargets,targetDigest,targetFor};
