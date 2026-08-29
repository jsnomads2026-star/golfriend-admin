'use strict';

const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const d=require('./domain'),activation=require('./activationCapability');
const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
const bindings=Object.freeze({scheduledcoursecountryingestionworker:'scheduledcoursecountryingestionworker-00006-ses',scheduledgolfapicourseacquisitionworker:'scheduledgolfapicourseacquisitionworker-00001-top'});

test('activation receipt identity is deterministic and retries validate the same immutable receipt',()=>{
  const input={projectId:'golfriend-v2-production-2ee34',secretVersion:'2',functionRevisions:bindings};
  const id=activation.receiptId(input),payload=activation.receiptPayload({...input,verifiedAt:'2026-08-29T05:00:00.000Z'}),receipt={...payload,receiptId:id,state:'verified',immutable:true,digest:d.activationReceiptDigest(payload)};
  assert.equal(id,activation.receiptId(input));
  assert.equal(activation.receiptMatches(receipt,input),true);
  assert.equal(activation.receiptMatches({...receipt,functionRevisions:{...bindings,scheduledcoursecountryingestionworker:'scheduledcoursecountryingestionworker-00005-kab'}},input),false);
});

test('activation callable is App Check protected and active Director or Admin only',()=>{
  const callable=source.slice(source.indexOf('async function activeAdminOrDirector'),source.indexOf('async function configuration'));
  assert.match(callable,/value\?\.role==='Director'\|\|value\?\.role==='Admin/);
  assert.match(source,/exports\.activateCourseCatalogue=onCall\(\{region:REGION,enforceAppCheck:true/);
  assert.match(callable,/AUTH_REQUIRED/);
  assert.match(callable,/DIRECTOR_OR_ADMIN_REQUIRED/);
});

test('activation derives exact country and acquisition bindings, rejects stale identities, and cannot call provider or Scheduler',()=>{
  const callable=source.slice(source.indexOf('async function loadLiveActivationBindings'),source.indexOf('async function reconcileExpiredReservations'));
  assert.match(callable,/ACTIVATION_REVISION_SERVICES/);
  assert.match(callable,/cloudfunctions\.googleapis\.com/);
  assert.match(callable,/run\.googleapis\.com/);
  assert.match(callable,/STALE_OR_INVALID_ACTIVATION_BINDING/);
  assert.match(callable,/transaction\.create\(receiptRef/);
  assert.match(callable,/providerRequestsAllowed:false/);
  assert.doesNotMatch(callable,/provider\(/);
  assert.doesNotMatch(callable,/cloudscheduler\.googleapis\.com/);
  assert.doesNotMatch(callable,/key\.value\(/);
});
