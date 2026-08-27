'use strict';
const crypto=require('node:crypto');
const STATES=Object.freeze(['queued','running','paused','completed','failed','unavailable']);
const country=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('en-US'):'UNKNOWN';
const jobId=value=>`country-${crypto.createHash('sha256').update(country(value)).digest('hex').slice(0,32)}`;
function plan(coverage){const value=country(coverage?.country);return Object.freeze({schema:'golfriend.country-ingestion-plan.v1',country:value,actionable:value!=='UNKNOWN',providerCalls:0,courseWrites:0,totalCourses:Number(coverage?.totalCourses||0),missingCoordinates:Number(coverage?.coursesMissingCoordinates||0)});}
function start(existing,input){const value=country(input.country);if(value==='UNKNOWN')return{state:'unavailable',reason:'COUNTRY_UNKNOWN'};if(existing&&['queued','running','paused'].includes(existing.state))return{...existing,idempotent:true};return{jobId:jobId(value),country:value,state:'queued',providerCalls:0,courseWrites:0,attempts:0,idempotent:false};}
function workerTransition(job,outcome){if(!job||!['queued','running'].includes(job.state))return{...job,providerCalls:0,courseWrites:0,skipped:true};if(outcome==='quota')return{...job,state:'paused',pauseReason:'QUOTA_EXHAUSTED',providerCalls:0,courseWrites:0};if(outcome==='429')return{...job,state:'paused',pauseReason:'PROVIDER_429',providerCalls:1,courseWrites:0};if(outcome==='completed')return{...job,state:'completed',providerCalls:1,courseWrites:0};return{...job,state:'failed',providerCalls:0,courseWrites:0};}
module.exports=Object.freeze({STATES,country,jobId,plan,start,workerTransition});
