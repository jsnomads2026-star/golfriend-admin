'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const catalogue=fs.readFileSync(path.join(__dirname,'index.js'),'utf8'),projection=fs.readFileSync(path.join(__dirname,'../functions-course-read/index.js'),'utf8');
test('scheduler and Korea rebind use one canonical provider pipeline',()=>{
  assert.match(catalogue,/async function executeCountryProviderPipeline\(claim\)/);
  const scheduler=catalogue.slice(catalogue.indexOf('exports.scheduledCourseCountryIngestionWorker'),catalogue.indexOf('exports.rebindAndStartKorea'));
  const rebind=catalogue.slice(catalogue.indexOf('exports.rebindAndStartKorea'));
  for(const path of [scheduler,rebind])assert.match(path,/executeCountryProviderPipeline\(claim\)/);
  assert.match(catalogue,/lifecycle\.executeProviderRequest/);
  assert.match(catalogue,/processMapping\(\{countryJob,rows,response\}\)/);
  assert.match(catalogue,/recordCountryWorkerResult\(claim,result\)/);
});
test('Korea rebind remains Director and App Check gated before provider work',()=>{
  const rebind=catalogue.slice(catalogue.indexOf('exports.rebindAndStartKorea'));
  assert.match(rebind,/enforceAppCheck:true/);
  assert(rebind.indexOf('await director(request)')<rebind.indexOf('await verifyActivation'));
  assert.match(rebind,/EXPLICIT_KOREA_REBIND_APPROVAL_REQUIRED/);
  assert.match(rebind,/DIRECTOR_REBIND_KOREA/);
  assert.match(rebind,/KOREA_JOB_ALREADY_RUNNING/);
});
test('dashboard projection contains authoritative job, immutable receipt, and quota views',()=>{
  assert.match(projection,/exports\.getCourseCountryIngestionProjection/);
  assert.match(projection,/course_country_ingestion_receipts/);
  assert.match(projection,/golf_api_quota/);
  assert.match(projection,/golfriend\.course-country-ingestion-projection\.v1/);
});
