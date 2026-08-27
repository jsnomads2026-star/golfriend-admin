'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const enrollment=require('./countryEnrollment');

test('enable begins disabled and cannot permit provider work before enrollment completes',()=>{
  const pending=enrollment.begin({uid:'director-uid',requestId:'request-1',enrollmentId:'enrollment-1',now:10});
  assert.equal(pending.enabled,false);assert.equal(pending.enrollmentComplete,false);assert.equal(pending.enrollmentState,'pending');
  assert.equal(pending.enrollmentRequestedBy,'director-uid');assert.equal(pending.enrollmentAction,'ENABLE_AUTOMATIC_REFRESH');
});
test('cursor batches all known countries deterministically and excludes UNKNOWN',()=>{
  const first=enrollment.batch(['TH','AU','UNKNOWN','AU','NZ'],null,2);
  assert.deepEqual(first,{items:['AU','NZ'],nextCursor:'NZ',complete:false});
  const last=enrollment.batch(['TH','AU','UNKNOWN','NZ'],first.nextCursor,2);
  assert.deepEqual(last,{items:['TH'],nextCursor:'TH',complete:true});
});
test('completion is the sole transition that enables automatic provider work',()=>{
  assert.deepEqual(enrollment.complete('enrollment-1',20),{enabled:true,enrollmentComplete:true,enrollmentState:'complete',enrollmentId:'enrollment-1',enrollmentCompletedAtMs:20});
});
