'use strict';
const crypto=require('node:crypto');
const identifier=value=>{const text=typeof value==='string'?value.normalize('NFC').trim():'';return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)?text:null;};
function normalize(input={}){const providerClubId=identifier(input.providerClubId),providerCourseId=identifier(input.providerCourseId);return providerClubId&&providerCourseId?Object.freeze({provider:'golf-api',providerClubId,providerCourseId}):null;}
function requestId(input){const value=normalize(input);return value?`golf-api-${crypto.createHash('sha256').update(`${value.providerClubId}:${value.providerCourseId}`).digest('hex').slice(0,40)}`:null;}
function queued(input,{uid,now=Date.now}={}){const value=normalize(input),id=requestId(input);return value&&id?Object.freeze({schema:'golfriend.course-acquisition-request.v1',requestId:id,...value,state:'queued',requestedBy:uid,requestedAtMs:now(),nextAttemptAtMs:now(),attempts:0}):null;}
function sameRequest(record,input){const value=normalize(input);return !!value&&record?.provider==='golf-api'&&record.providerClubId===value.providerClubId&&record.providerCourseId===value.providerCourseId;}
module.exports=Object.freeze({identifier,normalize,requestId,queued,sameRequest});
