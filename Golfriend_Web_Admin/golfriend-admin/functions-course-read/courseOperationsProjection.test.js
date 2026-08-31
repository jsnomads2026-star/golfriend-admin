'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const projection=source.slice(source.indexOf('exports.getCourseOperationsProjection'),source.length);
test('member request projection reads the durable queue and immutable receipts without quota diagnostics',()=>{
  assert.match(projection,/course_acquisition_requests/);assert.match(projection,/course_acquisition_receipts/);assert.match(projection,/schema: 'golfriend\.course-operations-projection\.v1'/);assert.doesNotMatch(projection,/golf_api_quota/);assert.doesNotMatch(projection,/fetch\(/);
});
test('member request projection is staff and App Check protected',()=>{
  assert.match(projection,/enforceAppCheck: true/);assert.match(projection,/requireStaffOrDirector\(request\)/);
});
