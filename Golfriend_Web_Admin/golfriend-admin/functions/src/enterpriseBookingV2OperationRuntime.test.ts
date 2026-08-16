import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";

const src=join(__dirname,"..","src");
const runtime=readFileSync(join(src,"enterpriseBookingV2OperationRuntime.ts"),"utf8");
const index=readFileSync(join(src,"index.ts"),"utf8");

test("V2 issuer and consumer require Auth App Check and managed secrets",()=>{
 assert.match(runtime,/previewEnterpriseBookingActionV2=onCall\(\{enforceAppCheck:true,secrets:\[TOKEN\]/);
 assert.match(runtime,/manageEnterpriseBookingActionV2=onCall\(\{enforceAppCheck:true,secrets:\[TOKEN,OUTBOX\]/);
 assert.ok((runtime.match(/if\(!request\.auth\)/g)||[]).length>=2);
});

test("alternative is re-read from authoritative course inventory",()=>{
 assert.match(runtime,/collection\('tee_time_slots'\)/);
 for(const fact of["organizationId","courseId","status","publishToApp","slotVersion","date","time","timeZone","available"])assert.match(runtime,new RegExp(fact));
 assert.match(runtime,/validateSlotCapacity/);
 assert.match(runtime,/capacity\.capacity-capacity\.bookedCount<partySize/);
 assert.match(runtime,/Number\(c\.request\?\.partySize\)/);
});

test("any ambiguous lock blocks preview manage and recovery",()=>{
 assert.match(runtime,/Object\.values\(booking\?\.operationLocks\|\|\{\}\)/);
 assert.ok((runtime.match(/hasAmbiguousLock\(b\)/g)||[]).length>=2);
});

test("replay binds current authority and verifies immutable signed outbox",()=>{
 assert.match(runtime,/transactionBookingAuthority/);
 assert.match(runtime,/verifyEnterpriseCorrelationEvent/);
 assert.match(runtime,/outbox\.data\(\)\?\.immutable!==true/);
 assert.match(runtime,/a\.state!=='consumed'\|\|t\.state!=='used'/);
 assert.match(runtime,/Number\(b\.version\)<replayVersion\|\|Number\(c\.version\)<replayVersion/);
 assert.doesNotMatch(runtime,/b\.version!==p\.version\|\|c\.version!==p\.version/);
});

test("token key version is persisted separately from stable intent",()=>{
 assert.ok((runtime.match(/signerKeyVersion:SIGNER_KEY_VERSION/g)||[]).length>=2);
 assert.doesNotMatch(readFileSync(join(src,"enterpriseBookingV2Operation.ts"),"utf8"),/confirmationToken.*intentDigest|intentDigest.*confirmationToken/);
});

test("only confirmed V2 operation path is exported",()=>{
 assert.match(index,/previewEnterpriseBookingActionV2,manageEnterpriseBookingActionV2/);
 assert.doesNotMatch(index,/transitionEnterpriseCorrelatedBookingV2/);
 assert.doesNotMatch(runtime,/collection\(['"]play_bookings['"]\)/);
});
