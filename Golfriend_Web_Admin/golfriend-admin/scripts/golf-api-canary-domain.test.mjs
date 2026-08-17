import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCatalogue,extractProviderMetadata,replayRetainedRaw,sha256} from './golf-api-canary-domain.mjs';

const mixed={apiRequestsLeft:498,numAllClubs:42001,numClubs:3,pagination:{next:'/api/v2.3/clubs?page=2'},clubs:[
  {clubID:'club-a',name:'A',courses:[{courseID:'course-old'},{courseId:'course-new'}]},
  {name:'Malformed'},
  {golfClubId:'club-b',courses:[{name:'No identity'}]},
]};

test('quota metadata survives malformed records',()=>assert.deepEqual(extractProviderMetadata(mixed),{apiRequestsLeft:498,numAllClubs:42001,numClubs:3,pagination:{next:'/api/v2.3/clubs?page=2'},topLevelFields:['apiRequestsLeft','clubs','numAllClubs','numClubs','pagination']}));
test('mixed batch accepts valid clubs and quarantines malformed records',()=>{const out=decodeCatalogue(mixed,new Set(['course-old']));assert.deepEqual(out.validClubs.map(x=>x.clubId),['club-a','club-b']);assert.equal(out.quarantine.length,2);assert.equal(out.existingMappings.length,1);assert.equal(out.newMappings.length,1);});
test('all-invalid batch retains metadata and quarantines every row',()=>{const out=decodeCatalogue({apiRequestsLeft:497,numAllClubs:2,numClubs:2,clubs:[{}, {id:'contains spaces'}]});assert.equal(out.metadata.apiRequestsLeft,497);assert.equal(out.validClubs.length,0);assert.equal(out.quarantine.length,2);});
test('club and course identities remain hierarchical',()=>{const out=decodeCatalogue(mixed);assert.equal(out.validClubs[0].identifierField,'clubID');assert.equal(out.validClubs[0].courses[0].courseIdentifierField,'courseID');assert.notEqual(out.validClubs[0].clubId,out.validClubs[0].courses[0].courseId);});
test('retained replay is deterministic and makes zero provider calls',()=>{const raw=JSON.stringify(mixed),a=replayRetainedRaw(raw,new Set(['course-old'])),b=replayRetainedRaw(raw,new Set(['course-old']));assert.equal(a.rawDigest,sha256(raw));assert.deepEqual(a,b);assert.equal(a.providerRequests,0);});
