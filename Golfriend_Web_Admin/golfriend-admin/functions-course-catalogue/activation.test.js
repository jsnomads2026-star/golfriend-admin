'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),d=require('./domain');
const producer=fs.readFileSync(path.join(__dirname,'..','scripts','activate-course-catalogue-after-rotation.mjs'),'utf8');
const verifier=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');

test('activation producer and verifier share the canonical domain digest',()=>{
  const producerPayload={projectId:'golfriend-v2',secretName:'GOLF_API_KEY',secretVersion:'2',secretVersionState:'ENABLED',functionRevisions:{scheduledgolfapicatalogueretries:'retry-revision',scheduledgolfapicatalogueincremental:'incremental-revision'},verifiedAt:'2026-08-19T02:00:00.000Z'};
  const verifierPayload={verifiedAt:'2026-08-19T02:00:00.000Z',functionRevisions:{scheduledgolfapicatalogueincremental:'incremental-revision',scheduledgolfapicatalogueretries:'retry-revision'},secretVersionState:'ENABLED',secretVersion:'2',secretName:'GOLF_API_KEY',projectId:'golfriend-v2'};
  const receiptDigest=d.activationReceiptDigest(producerPayload);
  assert.equal(d.activationReceiptMatches(verifierPayload,receiptDigest),true);
  assert.match(producer,/d\.activationReceiptDigest\(payload\)/);
  assert.match(verifier,/d\.activationReceiptMatches\(payload,receipt\.digest\)/);
});

test('activation verifier rejects changed canonical key or value data',()=>{
  const payload={projectId:'golfriend-v2',secretName:'GOLF_API_KEY',secretVersion:'2',secretVersionState:'ENABLED',functionRevisions:{service:'revision-a'},verifiedAt:'2026-08-19T02:00:00.000Z'},receiptDigest=d.activationReceiptDigest(payload);
  assert.equal(d.activationReceiptMatches({...payload,secretVersion:'3'},receiptDigest),false);
  assert.equal(d.activationReceiptMatches({...payload,functionRevisions:{service:'revision-b'}},receiptDigest),false);
  assert.equal(d.activationReceiptMatches({...payload,unexpected:'value'},receiptDigest),false);
});
