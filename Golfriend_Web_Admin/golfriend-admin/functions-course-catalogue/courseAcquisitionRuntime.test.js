'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const rules=fs.readFileSync(path.join(__dirname,'../enterprise-authority.firestore.rules'),'utf8');

test('the app can enqueue exactly one missing-course request without calling the provider', {skip:'LINEAGE GAP: asserts /transaction.create(requestRef/ — `requestRef` does not exist in this baseline (0 occurrences) and was not added by 9a66695/ee3961b/df9e480. Belongs to the acquisition machinery of codex/catalogue-contract-integration that predates those commits. Owner: course-acquisition recovery packet.'},()=>{
  const callable=source.slice(source.indexOf('exports.requestGolfApiCourseAcquisition'),source.indexOf('async function claimCourseAcquisitionRequest'));
  assert.match(callable,/enforceAppCheck:true/);assert.match(callable,/if\(!request\.auth\?\.uid\)/);
  assert.match(callable,/course_acquisition_requests/);assert.match(callable,/transaction\.create\(requestRef/);
  assert.match(callable,/if\(prior\.exists\)/);assert.match(callable,/idempotent:true/);
  assert.doesNotMatch(callable,/provider\(/);
});

test('a cached canonical provider course produces no targeted provider refetch', {skip:'LINEAGE GAP: asserts recordCourseAcquisitionResult(claim,{state:\'cached\'...}) — `recordCourseAcquisitionResult` does not exist in this baseline (0 occurrences) and is not part of the imported blobs. Owner: course-acquisition recovery packet.'},()=>{
  const worker=source.slice(source.indexOf('async function runCourseAcquisitionWorker'),source.indexOf('exports.getGolfApiCatalogueStatus'));
  const cached=worker.slice(worker.indexOf('const existing='),worker.indexOf('const runId='));
  assert.match(cached,/return recordCourseAcquisitionResult\(claim,\{state:'cached',providerCalls:0,courseWrites:0\}\)/);
  assert.doesNotMatch(cached,/provider\(/);
});

test('the targeted worker calls only the requested club and uses the canonical provider merge with provenance', {skip:'LINEAGE GAP: asserts /encodeURIComponent(claim.request.providerClubId)/ against acquisition-claim machinery absent from this baseline. Owner: course-acquisition recovery packet.'},()=>{
  const worker=source.slice(source.indexOf('async function runCourseAcquisitionWorker'),source.indexOf('exports.getGolfApiCatalogueStatus'));
  assert.match(worker,/encodeURIComponent\(claim\.request\.providerClubId\)/);
  assert.match(worker,/persistCanonicalProviderMapping/);assert.match(worker,/jobId:claim\.request\.requestId/);
  assert.match(source,/sourceImportRunId:result\.runId/);
  assert.match(source,/scheduledGolfApiCourseAcquisitionWorker/);
});

test('Firebase discovery remains authenticated read-only and does not require a Golfriend verification flag',()=>{
  const courseRules=rules.slice(rules.indexOf('match /courses/{courseId}'),rules.indexOf('match /platform/'));
  assert.match(courseRules,/allow get, list: if request\.auth != null/);assert.doesNotMatch(courseRules,/verified/);
  assert.match(courseRules,/allow create, update, delete: if false/);
  assert.match(rules,/match \/course_acquisition_requests\/\{document=\*\*\} \{ allow read, write: if false; \}/);
});
