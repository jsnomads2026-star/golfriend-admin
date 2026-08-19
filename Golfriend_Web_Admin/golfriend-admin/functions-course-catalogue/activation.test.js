'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),d=require('./domain');
const producer=fs.readFileSync(path.join(__dirname,'..','scripts','activate-course-catalogue-after-rotation.mjs'),'utf8');
const canaryRunner=fs.readFileSync(path.join(__dirname,'..','scripts','run-guarded-golf-api-canary.mjs'),'utf8');
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

test('receipt-only mode writes one immutable receipt and never activates configuration',()=>{
  assert.match(producer,/RECEIPT_ONLY=process\.argv\.includes\('--write-receipt-only'\)/);
  assert.match(producer,/if\(APPLY\|\|RECEIPT_ONLY\|\|SAFE_BIND\)await create\('course_catalogue_activation_receipts'/);
  assert.match(producer,/if\(APPLY\)await patch\('platform','golfApiCatalogueConfig'/);
  assert.doesNotMatch(producer,/if\(RECEIPT_ONLY\)[^\n]*golfApiCatalogueConfig/);
});

test('disabled binding mode is fail-closed and changes only receipt binding metadata',()=>{
  assert.match(producer,/SAFE_BIND=process\.argv\.includes\('--bind-receipt-disabled'\)/);
  assert.match(producer,/if\(config\.providerRequestsAllowed!==false\)throw Error\('PROVIDER_REQUESTS_MUST_REMAIN_DISABLED'\)/);
  assert.match(producer,/if\(checkpoint\.state!=='blocked'\)throw Error\('CHECKPOINT_MUST_REMAIN_BLOCKED'\)/);
  assert.match(producer,/matches\.length!==1\|\|matches\[0\]\.state!=='PAUSED'/);
  assert.match(producer,/await patch\('platform','golfApiCatalogueConfig',\{requiredSecretVersion:SECRET_VERSION,bindingReceiptId:receiptId,updatedAt:verifiedAt\}\)/);
  assert.doesNotMatch(producer,/if\(SAFE_BIND\)[^\n]*providerRequestsAllowed:true/);
  assert.match(producer,/bindingState:'superseded',supersededByReceiptId:receiptId,supersededAt:verifiedAt/);
  assert.doesNotMatch(producer,/PREVIOUS_BINDING_RECEIPT_REQUIRED/);
  assert.match(producer,/receipt\.bindingState!=='current'/);
});

const services=['scheduledgolfapicatalogueincremental','scheduledgolfapicatalogueretries'];
const shortBindings={scheduledgolfapicatalogueincremental:'scheduledgolfapicatalogueincremental-00009-lof',scheduledgolfapicatalogueretries:'scheduledgolfapicatalogueretries-00004-zep'};

test('full resource-path receipt revision matches short simulated K_REVISION',()=>{
  const bindings={...shortBindings,scheduledgolfapicatalogueincremental:`projects/golfriend-v2/locations/asia-southeast1/services/scheduledgolfapicatalogueincremental/revisions/${shortBindings.scheduledgolfapicatalogueincremental}`};
  assert.equal(d.activationRevisionBindingsMatch(bindings,services,'scheduledgolfapicatalogueincremental',shortBindings.scheduledgolfapicatalogueincremental),true);
});

test('short-name receipt revision matches short simulated K_REVISION',()=>{
  assert.equal(d.activationRevisionBindingsMatch(shortBindings,services,'scheduledgolfapicatalogueretries',shortBindings.scheduledgolfapicatalogueretries),true);
  assert.match(producer,/d\.normalizeRevisionIdentity\(service\.latestReadyRevision,serviceName\)/);
  assert.match(verifier,/d\.activationRevisionBindingsMatch\(receipt\.functionRevisions,PROVIDER_REVISION_SERVICES,process\.env\.K_SERVICE,process\.env\.K_REVISION\)/);
});

test('changed revision binding rejects',()=>{
  assert.equal(d.activationRevisionBindingsMatch({...shortBindings,scheduledgolfapicatalogueretries:'scheduledgolfapicatalogueretries-00005-bad'},services,'scheduledgolfapicatalogueretries',shortBindings.scheduledgolfapicatalogueretries),false);
});

test('malformed full-path mismatch and unexpected binding reject',()=>{
  const wrongServicePath=`projects/golfriend-v2/locations/asia-southeast1/services/other-service/revisions/${shortBindings.scheduledgolfapicatalogueincremental}`;
  assert.equal(d.activationRevisionBindingsMatch({...shortBindings,scheduledgolfapicatalogueincremental:wrongServicePath},services,'scheduledgolfapicatalogueincremental',shortBindings.scheduledgolfapicatalogueincremental),false);
  assert.equal(d.activationRevisionBindingsMatch({...shortBindings,unexpectedservice:'unexpectedservice-00001-bad'},services,'scheduledgolfapicatalogueincremental',shortBindings.scheduledgolfapicatalogueincremental),false);
  assert.equal(d.activationRevisionBindingsMatch({...shortBindings,scheduledgolfapicatalogueincremental:'not/a/revision'},services,'scheduledgolfapicatalogueincremental',shortBindings.scheduledgolfapicatalogueincremental),false);
});

test('guarded canary verifies binding metadata and restores disabled state in finally',()=>{
  assert.match(canaryRunner,/d\.activationReceiptMatches\(receiptPayload\(receipt\),receipt\.digest\)/);
  assert.match(canaryRunner,/d\.activationRevisionBindingsMatch\(receipt\.functionRevisions,expectedServices,service,liveRevisions\[service\]\)/);
  assert.match(canaryRunner,/binding\.version!==SECRET_VERSION/);
  assert.match(canaryRunner,/if\(checkpoint\.state!=='blocked'\)/);
  assert.match(canaryRunner,/canaryDetailsPerRun:0/);
  assert.match(canaryRunner,/canaryJob\.name}:resume/);
  assert.doesNotMatch(canaryRunner,/providerFunctions[^\n]*:resume/);
  const cleanup=canaryRunner.slice(canaryRunner.indexOf('}finally{'));
  assert.match(cleanup,/providerRequestsAllowed:false,canaryRequestsAllowed:false/);
  assert.match(cleanup,/state:'blocked'/);
  assert.match(cleanup,/:pause/);
});
