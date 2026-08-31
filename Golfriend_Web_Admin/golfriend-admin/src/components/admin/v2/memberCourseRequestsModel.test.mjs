import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMemberCourseRequests, requestStatus } from './memberCourseRequestsModel.mjs';

test('empty request queue remains empty',()=>assert.deepEqual(projectMemberCourseRequests([]),[]));
test('identical provider identities deduplicate into one member request',()=>{
  const rows=projectMemberCourseRequests([{id:'one',providerClubId:'club-1',providerCourseId:'course-1',requestName:'One',requestedAtMs:1},{id:'two',providerClubId:'club-1',providerCourseId:'course-1',requestName:'One',requestedAtMs:2}]);
  assert.equal(rows.length,1);assert.equal(rows[0].requestCount,2);assert.equal(rows[0].status,'Ready to import');
});
test('canonical, match-required, import, failure, and receipt states remain truthful',()=>{
  assert.equal(requestStatus({state:'cached'}),'Already in Firebase');
  assert.equal(requestStatus({requestName:'No identity'}),'Needs provider match');
  assert.equal(requestStatus({state:'running'}),'Importing');
  assert.equal(requestStatus({state:'completed'}),'Imported');
  const row=projectMemberCourseRequests([{id:'failed',providerClubId:'club',providerCourseId:'course',state:'failed',lastError:'UPSTREAM',receiptId:'receipt-1'}])[0];
  assert.equal(row.status,'Failed');assert.equal(row.receiptId,'receipt-1');assert.equal(row.error,'UPSTREAM');
});
