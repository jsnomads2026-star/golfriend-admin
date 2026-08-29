'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),domain=require('./domain');

function fakeFirestore(){const values=new Map(),key=ref=>`${ref.collectionName}/${ref.id}`,snapshot=ref=>({exists:values.has(key(ref)),data:()=>values.get(key(ref))});const db={collection(collectionName){return{doc(id){const ref={collectionName,id,get:async()=>snapshot(ref),set:async(value,options={})=>{const prior=values.get(key(ref))||{};values.set(key(ref),options.merge?{...prior,...value}:value);},create:async value=>{if(values.has(key(ref)))throw Error('ALREADY_EXISTS');values.set(key(ref),value);}};return ref;},where(){return this;},limit(){return this;},get:async()=>({empty:true,docs:[],size:0}),count(){return{get:async()=>({data:()=>({count:0})})}},orderBy(){return this;}};},runTransaction:async work=>work({get:async ref=>snapshot(ref),set:(ref,value,options={})=>{const prior=values.get(key(ref))||{};values.set(key(ref),options.merge?{...prior,...value}:value);},create:(ref,value)=>{if(values.has(key(ref)))throw Error('ALREADY_EXISTS');values.set(key(ref),value);}})};return{db,values};}

function loadCanonical(){const fake=fakeFirestore(),admin={apps:[{}],firestore:()=>fake.db};admin.firestore.FieldValue={serverTimestamp:()=> 'SERVER_TIMESTAMP'};admin.firestore.Timestamp={now:()=>({}),fromMillis:value=>({toMillis:()=>value})};const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8')+'\nmodule.exports.__test={processMapping,normalizedDetail};';const module={exports:{}};const localRequire=name=>{if(name==='firebase-functions/v2/https')return{onCall:(_options,handler)=>handler,HttpsError:class HttpsError extends Error{}};if(name==='firebase-functions/v2/scheduler')return{onSchedule:(_options,handler)=>handler};if(name==='firebase-functions/params')return{defineSecret:()=>({value:()=> 'fake'})};if(name==='firebase-admin')return admin;if(name==='node:crypto')return crypto;if(name==='./domain')return domain;if(name==='./provider-lifecycle'||name==='./calibration'||name==='./countryIngestion'||name==='./countryWorker'||name==='./countrySchedule'||name==='./countryEnrollment'||name==='./canonicalCourseMerge')return require(name);throw Error(`UNEXPECTED_REQUIRE:${name}`);};vm.runInNewContext(source,{module,exports:module.exports,require:localRequire,console,URL,AbortSignal,fetch:async()=>{throw Error('PROVIDER_FORBIDDEN');}},{filename:'index.js'});return{...fake,api:module.exports.__test};}

const rawClub={clubID:'club-1',clubName:'Canonical Club',country:'TH',city:'Bangkok',courses:[{courseID:'course-1',courseName:'Canonical Course',latitude:13.7563,longitude:100.5018,timestampUpdated:1724803200}]};
const row={clubID:'club-1',clubName:'Canonical Club',sourceDigest:'club-digest',courses:[{courseID:'course-1',sourceDigest:'course-digest',sourceUpdatedAt:'1724803200'}]};
const input=extra=>({countryJob:{jobId:'country-th',country:'TH'},rows:[row],response:{body:{clubs:[rawClub]},retrievedAt:'2026-08-27T01:00:00.000Z',quarantine:[],...extra}});

test('country worker canonical merge preserves the Golf API provenance and discovery contract',async()=>{
  const h=loadCanonical(),first=await h.api.processMapping(input()),course=h.values.get('courses/course-1');
  assert.deepEqual(JSON.parse(JSON.stringify(first)),{added:1,updated:0,skipped:0,quarantined:0,failed:0,writes:1});
  assert.equal(course.provenance,'golf-api');
  assert.deepEqual(JSON.parse(JSON.stringify(course.source)),{provider:'golf-api',jobId:'country-th',sourceCourseId:'course-1',sourceClubId:'club-1'});
  assert.equal(course.coordinatesStatus,'valid');assert.equal(course.needsReview,false);
  assert.equal(course.sourceUpdatedAt,1724803200000);assert.equal(Number.isFinite(course.sourceUpdatedAt),true);assert.equal(course.providerTimestampUpdated,1724803200000);
  assert.equal(course.providerFetchedAt,'2026-08-27T01:00:00.000Z');
  assert.equal(Object.hasOwn(course,'verified'),false);assert.equal(Object.hasOwn(course,'ingestedAt'),false);
  const replay=await h.api.processMapping(input());
  assert.deepEqual(JSON.parse(JSON.stringify(replay)),{added:0,updated:0,skipped:1,quarantined:0,failed:0,writes:0});
});
test('seconds source timestamps normalize exactly once to epoch milliseconds',()=>{assert.equal(domain.epochMilliseconds(1724803200),1724803200000);assert.equal(domain.epochMilliseconds(1724803200000),1724803200000);assert.equal(domain.epochMilliseconds('2024-08-27T00:00:00.000Z'),1724716800000);assert.equal(domain.epochMilliseconds('not-a-timestamp'),null);});
test('fake Firestore canonical mapping preserves manual values and imported provenance through merge',async()=>{const h=loadCanonical();h.values.set('courses/course-1',{schema:'golfriend.v2.course.v2',providerCourseId:'course-1',providerClubId:'club-1',sourceUpdatedAt:1720000000000,providerFetchedAt:'2026-08-01T00:00:00.000Z',directConfirmed:true,directConfirmation:{by:'director'},description:'manual',manualLock:true,verified:true,latitude:1,longitude:2,lat:1,lng:2});const result=await h.api.processMapping(input()),course=h.values.get('courses/course-1');assert.equal(result.updated,1);assert.equal(course.provenance,'golf-api');assert.deepEqual(JSON.parse(JSON.stringify(course.source)),{provider:'golf-api',jobId:'country-th',sourceCourseId:'course-1',sourceClubId:'club-1'});assert.equal(course.directConfirmed,true);assert.deepEqual(course.directConfirmation,{by:'director'});assert.equal(course.description,'manual');assert.equal(course.verified,true);assert.equal(course.latitude,1);assert.equal(course.longitude,2);});
test('fake Firestore ambiguous provider mapping is quarantined with no course write',async()=>{const h=loadCanonical(),ambiguous=input({body:{clubs:[rawClub,{...rawClub}]}}),result=await h.api.processMapping(ambiguous);assert.deepEqual(JSON.parse(JSON.stringify(result)),{added:0,updated:0,skipped:0,quarantined:1,failed:0,writes:0});assert.equal(h.values.has('courses/course-1'),false);assert.equal([...h.values.keys()].some(value=>value.startsWith('golf_api_record_quarantine/')),true);});
test('missing coordinates require review while invalid and Null Island rows are quarantined before discovery',async()=>{const missing=JSON.parse(JSON.stringify(rawClub));delete missing.courses[0].latitude;delete missing.courses[0].longitude;const missingHarness=loadCanonical(),missingResult=await missingHarness.api.processMapping(input({body:{clubs:[missing]}})),missingCourse=missingHarness.values.get('courses/course-1');assert.equal(missingResult.added,1);assert.equal(missingCourse.coordinatesStatus,'missing');assert.equal(missingCourse.needsReview,true);for(const [name,latitude,longitude,reason] of [['invalid',91,100,'INVALID_COORDINATES'],['null-island',0,0,'NULL_ISLAND_COORDINATES']]){const club=JSON.parse(JSON.stringify(rawClub));club.courses[0].latitude=latitude;club.courses[0].longitude=longitude;const h=loadCanonical(),result=await h.api.processMapping(input({body:{clubs:[club]}})),quarantine=[...h.values.entries()].find(([key])=>key.startsWith('golf_api_record_quarantine/'));assert.equal(result.quarantined,1,name);assert.equal(h.values.has('courses/course-1'),false,name);assert.equal(quarantine[1].reason,reason,name);assert.equal(quarantine[1].needsReview,true,name);}});

function loadEmulatorCanonical(body){const admin=require('firebase-admin'),firestore=require('firebase-admin/firestore');if(!admin.getApps().length)admin.initializeApp({projectId:process.env.GCLOUD_PROJECT});const firestoreForVm=firestore.getFirestore;firestoreForVm.FieldValue=firestore.FieldValue;firestoreForVm.Timestamp=firestore.Timestamp;const adminForVm={...admin,apps:[{}],firestore:firestoreForVm};const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8').replace("const activation=await verifyActivation(await configuration());if(!activation.allowed)return{state:'blocked',reason:activation.reason,providerCalls:0,courseWrites:0};","const activation={allowed:true};")+'\nmodule.exports.__test={processMapping};return module.exports;',module={exports:{}};const localRequire=name=>{if(name==='firebase-functions/v2/https')return{onCall:(_options,handler)=>handler,HttpsError:class HttpsError extends Error{}};if(name==='firebase-functions/v2/scheduler')return{onSchedule:(_options,handler)=>handler};if(name==='firebase-functions/params')return{defineSecret:()=>({value:()=> 'fake-provider-key'})};if(name==='firebase-admin')return adminForVm;if(name==='node:crypto')return crypto;if(name==='./domain')return domain;if(name==='./provider-lifecycle'||name==='./calibration'||name==='./countryIngestion'||name==='./countryWorker'||name==='./countrySchedule'||name==='./countryEnrollment'||name==='./canonicalCourseMerge')return require(name);throw Error(`UNEXPECTED_REQUIRE:${name}`);};const exported=new Function('module','exports','require','console','URL','AbortSignal','process','fetch',source)(module,module.exports,localRequire,console,URL,AbortSignal,process,async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)}));return{db:firestore.getFirestore(),worker:exported.scheduledCourseCountryIngestionWorker,api:exported.__test};}
async function clearEmulator(db,collection){const snapshot=await db.collection(collection).get();await Promise.all(snapshot.docs.map(document=>document.ref.delete()));}
const emulatorBody={clubs:[rawClub],apiRequestsLeft:900,numAllClubs:1};

test('Firestore emulator worker writes one canonical course, protects curated data, quarantines ambiguity, and reconciles receipt totals',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  const h=loadEmulatorCanonical(emulatorBody),month=new Date().toISOString().slice(0,7),jobId='country-emulator-th';
  for(const collection of ['courses','course_country_ingestion_jobs','course_country_ingestion_receipts','golf_api_quota','golf_api_quota_reservations','golf_api_record_quarantine'])await clearEmulator(h.db,collection);
  await h.db.collection('golf_api_quota').doc(month).set({providerReportedRemaining:1000,weightedCompleted:0,weightedFailed:0,weightedReserved:0});
  await h.db.collection('course_country_ingestion_jobs').doc(jobId).set({jobId,country:'TH',state:'queued',createdAction:'DIRECTOR_START_COUNTRY',explicitApproval:true});
  const result=await h.worker(),courseRef=h.db.collection('courses').doc('course-1'),course=(await courseRef.get()).data(),receipt=(await h.db.collection('course_country_ingestion_receipts').doc(`${jobId}-cycle-1`).get()).data();
  assert.equal(result.state,'completed',JSON.stringify(result));
  assert.equal(result.counts.added,1);
  assert.equal(course.providerTimestampUpdated,1724803200000);
  assert.equal(course.sourceUpdatedAt,1724803200000);
  assert.equal(course.fetchedAt!==null,true);
  assert.equal(receipt.added,1);
  assert.equal(receipt.updated,0);
  assert.equal(receipt.skipped,0);
  assert.equal(receipt.quarantined,0);
  assert.equal(receipt.failed,0);
  assert.deepEqual(receipt.counts,{added:receipt.added,updated:receipt.updated,skipped:receipt.skipped,quarantined:receipt.quarantined,failed:receipt.failed,writes:receipt.courseWrites});
  const canonicalInput={countryJob:{jobId,country:'TH'},rows:domain.validatePage(emulatorBody).clubs,response:{body:emulatorBody,retrievedAt:'2026-08-27T01:00:00.000Z',quarantine:[]}};
  const replay=await h.api.processMapping(canonicalInput);
  assert.equal(replay.skipped,1,JSON.stringify(replay));
  assert.equal(replay.writes,0);
  await courseRef.set({directConfirmed:true,directConfirmation:{by:'director'},description:'manual',manualLock:true,latitude:1,longitude:2,lat:1,lng:2,sourceDigest:'old',sourceUpdatedAt:'2026-08-01T00:00:00.000Z',providerFetchedAt:'2026-08-01T00:00:00.000Z'},{merge:true});
  const updated=await h.api.processMapping(canonicalInput),protectedCourse=(await courseRef.get()).data();
  assert.equal(updated.updated,1);
  assert.equal(protectedCourse.directConfirmed,true);
  assert.equal(protectedCourse.description,'manual');
  assert.equal(protectedCourse.latitude,1);
  const ambiguousBody={...emulatorBody,clubs:[rawClub,{...rawClub}]},ambiguous=await h.api.processMapping({countryJob:{jobId,country:'TH'},rows:domain.validatePage(ambiguousBody).clubs,response:{body:ambiguousBody,retrievedAt:'2026-08-27T01:00:00.000Z',quarantine:[]}});
  assert.equal(ambiguous.quarantined,1);
  assert.equal(ambiguous.writes,0);
  assert.equal((await courseRef.get()).exists,true);
});
