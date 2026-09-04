'use strict';

const {find}=require('geo-tz/all');

const RESOLVER='geo-tz@8.1.8/all';
const SOURCES=Object.freeze(['coordinates','geocoded-coordinates']);

function finite(value,minimum,maximum){
  const numeric=typeof value==='number'?value:Number(value);
  return Number.isFinite(numeric)&&numeric>=minimum&&numeric<=maximum?numeric:null;
}

function canonicalCoordinates(course){
  if(course?.coordinateValidity!=='valid')return null;
  const latitude=finite(course.latitude??course.lat,-90,90),longitude=finite(course.longitude??course.lng,-180,180);
  if(latitude===null||longitude===null||(latitude===0&&longitude===0))return null;
  return {latitude,longitude};
}

function coordinateSource(course){return course?.coordinateSource==='geocoded-coordinates'?'geocoded-coordinates':'coordinates';}
function validIana(value){
  if(typeof value!=='string'||!value.includes('/'))return null;
  try{new Intl.DateTimeFormat('en',{timeZone:value});return value;}catch{return null;}
}
function oneResolvedIana(value){return Array.isArray(value)&&value.length===1?validIana(value[0]):null;}

function withCourseTimeZone(existing,course,resolvedAt,resolve=find){
  const coordinates=canonicalCoordinates(course);
  if(!coordinates){
    const next={...course};
    delete next.courseTimeZone;
    delete next.courseTimeZoneResolver;
    delete next.courseTimeZoneResolvedAt;
    delete next.courseTimeZoneSource;
    return next;
  }
  const courseTimeZone=oneResolvedIana(resolve(coordinates.latitude,coordinates.longitude));
  if(!courseTimeZone){
    const next={...course};
    delete next.courseTimeZone;
    delete next.courseTimeZoneResolver;
    delete next.courseTimeZoneSource;
    delete next.courseTimeZoneResolvedAt;
    return next;
  }
  const courseTimeZoneSource=coordinateSource(course);
  const alreadyResolved=existing?.courseTimeZone===courseTimeZone&&existing?.courseTimeZoneResolver===RESOLVER&&existing?.courseTimeZoneSource===courseTimeZoneSource&&typeof existing?.courseTimeZoneResolvedAt==='string';
  return {...course,courseTimeZone,courseTimeZoneResolver:RESOLVER,courseTimeZoneSource,courseTimeZoneResolvedAt:alreadyResolved?existing.courseTimeZoneResolvedAt:resolvedAt};
}

module.exports=Object.freeze({RESOLVER,SOURCES,canonicalCoordinates,coordinateSource,oneResolvedIana,validIana,withCourseTimeZone});
