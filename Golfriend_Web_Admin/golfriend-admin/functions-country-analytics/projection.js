'use strict';
const {normalize,displayName}=require('./countryIdentity');
const VERSION='golfriend.country-operations-projection.v2';
const millis=value=>{if(typeof value==='number'&&Number.isFinite(value))return Math.abs(value)<100000000000?value*1000:value;if(typeof value==='string'){const date=Date.parse(value);return Number.isFinite(date)?date:null;}if(value?.toMillis)return millis(value.toMillis());if(Number.isFinite(Number(value?.seconds??value?._seconds)))return Number(value.seconds??value._seconds)*1000;return null;};
const iso=value=>{const valueMs=millis(value);return valueMs===null?null:new Date(valueMs).toISOString();};
const identity=record=>normalize(record?.countryCode??record?.country);
function aggregate({users=[],courses=[],clubhouses=[],requests=[],now=Date.now(),periodDays=30}){
  const rows=new Map(),row=code=>{if(!rows.has(code))rows.set(code,{countryCode:code,country:displayName(code)||code,verifiedMembers:0,newMembers:0,activeMembers:null,courseCoverage:{clubhouses:0,playableLayouts:0},memberCourseRequests:0});return rows.get(code);};
  const unmappedCoverage={courses:0,clubhouses:0,requests:0},cutoff=now-periodDays*86400000;let memberRecordsWithCreatedAt=0;
  for(const user of users){const member=normalize(user.verified_country_code),code=member.code||'UNKNOWN',target=row(code),created=millis(user.created_at);if(user.verification_status==='verified')target.verifiedMembers++;if(created!==null)memberRecordsWithCreatedAt++;if(created!==null&&created>=cutoff&&created<=now)target.newMembers++;}
  for(const course of courses){const value=identity(course);if(value.code)row(value.code).courseCoverage.playableLayouts++;else unmappedCoverage.courses++;}
  for(const clubhouse of clubhouses){const value=identity(clubhouse);if(value.code)row(value.code).courseCoverage.clubhouses++;else unmappedCoverage.clubhouses++;}
  for(const request of requests){const value=identity(request);if(value.code)row(value.code).memberCourseRequests+=Number(request.requestCount||1);else unmappedCoverage.requests+=Number(request.requestCount||1);}
  const countries=[...rows.values()].sort((a,b)=>a.countryCode.localeCompare(b.countryCode)).map(value=>({...value,currentNeed:value.memberCourseRequests>0?'Member requests waiting':value.courseCoverage.playableLayouts===0?'Course coverage needed':'No activity data collected yet'}));
  const totals=countries.reduce((out,value)=>({verifiedMembers:out.verifiedMembers+value.verifiedMembers,newMembers:out.newMembers+value.newMembers,activeMembers:null}),{verifiedMembers:0,newMembers:0,activeMembers:null});
  return Object.freeze({schema:VERSION,version:2,generatedAt:new Date(now).toISOString(),periodDays,totals,countries,unmappedCoverage,sourceCompleteness:{verifiedMembers:{state:'available',source:'users.verification_status + users.verified_country_code',memberRecords:users.length,verifiedMemberRecords:totals.verifiedMembers},newMembers:{state:'available',source:'users.created_at',memberRecords:users.length,recordsWithCreatedAt:memberRecordsWithCreatedAt},activeMembers:{state:'not_collected',reason:'NO_CANONICAL_ACTIVITY_EVENT_WRITER'},matchDemand:{state:'not_collected',reason:'NO_CANONICAL_MATCH_DEMAND_WRITER'},clubhouseDemand:{state:'not_collected',reason:'NO_CANONICAL_CLUBHOUSE_DEMAND_WRITER'},memberCourseRequests:{state:'available',source:'course_acquisition_requests'},courseCoverage:{state:'available',source:'courses.countryCode + clubhouses.countryCode',unmappedCoverage}}});
}
module.exports=Object.freeze({VERSION,aggregate,millis,iso,identity});
