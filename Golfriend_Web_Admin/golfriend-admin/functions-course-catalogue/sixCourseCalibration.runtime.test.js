'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const runtime=source.slice(source.indexOf('async function armSixCourseCalibration'),source.indexOf('async function settlePendingRecord'));

test('six-course calibration is a Director/App Check, locked-target, single-use provider authority',()=>{
  assert.match(source,/exports\.armGolfApiSixCourseCalibration=onCall\(\{region:REGION,enforceAppCheck:true\}/);
  assert.match(source,/exports\.runGolfApiSixCourseCalibration=onCall\(\{region:REGION,enforceAppCheck:true,secrets:\[key\]/);
  assert.match(runtime,/await director\(request\)/);
  assert.match(runtime,/LOCKED_TARGETS_ONLY/);
  assert.match(runtime,/SIX_COURSE_CALIBRATION_ALREADY_CONSUMED/);
  assert.match(runtime,/SIX_COURSE_CONTROL/);
  assert.match(runtime,/SIX_COURSE_RUN_NOT_ARMED/);
  assert.match(runtime,/sixCourseCalibration\.TARGETS/);
  assert.match(runtime,/\/api\/v2\.3\/clubs\/search\?q=/);
  assert.match(runtime,/SIX_COURSE_RECEIPTS\.doc\(runId\)\.create/);
  assert.match(runtime,/zeroCatalogueWrites:true/);
  assert.doesNotMatch(runtime,/request\.data\?\.(club|course|target|search)/i);
  assert.doesNotMatch(runtime,/collection\('courses'\)|course_catalogue_failures|golf_api_record_quarantine/);
});
