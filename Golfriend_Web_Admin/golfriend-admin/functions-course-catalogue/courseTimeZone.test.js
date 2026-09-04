'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {RESOLVER,canonicalCoordinates,withCourseTimeZone}=require('./courseTimeZone');

test('resolves one IANA zone only from canonical valid coordinates',()=>{
  assert.deepEqual(canonicalCoordinates({coordinateValidity:'valid',latitude:13.7563,longitude:100.5018}),{latitude:13.7563,longitude:100.5018});
  assert.equal(canonicalCoordinates({coordinateValidity:'missing',latitude:13.7563,longitude:100.5018}),null);
  assert.equal(canonicalCoordinates({coordinateValidity:'valid',latitude:0,longitude:0}),null);
  const resolved=withCourseTimeZone(null,{coordinateValidity:'valid',latitude:13.7563,longitude:100.5018,coordinateSource:'coordinates'},'2026-09-04T00:00:00.000Z',()=> ['Asia/Bangkok']);
  assert.equal(resolved.courseTimeZone,'Asia/Bangkok');
  assert.equal(resolved.courseTimeZoneResolver,RESOLVER);
  assert.equal(resolved.courseTimeZoneSource,'coordinates');
  assert.equal(resolved.courseTimeZoneResolvedAt,'2026-09-04T00:00:00.000Z');
});

test('a timezone boundary is unavailable rather than arbitrarily selected',()=>{
  const result=withCourseTimeZone(null,{coordinateValidity:'valid',latitude:13,longitude:100},'now',()=> ['Asia/Bangkok','Asia/Phnom_Penh']);
  assert.equal(Object.hasOwn(result,'courseTimeZone'),false);
});

test('does not retain a timezone where the canonical predicate fails',()=>{
  const result=withCourseTimeZone({courseTimeZone:'Asia/Bangkok',courseTimeZoneResolver:RESOLVER,courseTimeZoneSource:'coordinates',courseTimeZoneResolvedAt:'old'},{coordinateValidity:'missing',latitude:null,longitude:null,courseTimeZone:'Asia/Bangkok',courseTimeZoneResolver:RESOLVER,courseTimeZoneSource:'coordinates',courseTimeZoneResolvedAt:'old'},'now',()=>{throw Error('MUST_NOT_RESOLVE');});
  for(const field of ['courseTimeZone','courseTimeZoneResolver','courseTimeZoneSource','courseTimeZoneResolvedAt'])assert.equal(Object.hasOwn(result,field),false);
});

test('records derived coordinate provenance and restamps when it changes',()=>{
  const existing={courseTimeZone:'Asia/Bangkok',courseTimeZoneResolver:RESOLVER,courseTimeZoneSource:'coordinates',courseTimeZoneResolvedAt:'old'};
  assert.equal(withCourseTimeZone(existing,{coordinateValidity:'valid',latitude:13,longitude:100,coordinateSource:'coordinates'},'new',()=> ['Asia/Bangkok']).courseTimeZoneResolvedAt,'old');
  const geocoded=withCourseTimeZone(existing,{coordinateValidity:'valid',latitude:13,longitude:100,coordinateSource:'geocoded-coordinates'},'new',()=> ['Asia/Bangkok']);
  assert.equal(geocoded.courseTimeZoneSource,'geocoded-coordinates');
  assert.equal(geocoded.courseTimeZoneResolvedAt,'new');
});
