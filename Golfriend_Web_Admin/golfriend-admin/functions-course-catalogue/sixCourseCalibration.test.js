'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),c=require('./sixCourseCalibration');

const complete={courseID:'layout-a',courseName:'A',timestampUpdated:'2026-09-21T00:00:00Z',courseRating:72.1,slopeRating:128,tees:[{teeName:'Blue',teeColor:'Blue',yardage:6800}],holes:Array.from({length:18},(_,index)=>({holeNumber:index+1,par:index===0?4:4,strokeIndex:index+1}))};
test('the target set is closed, includes the six approved targets, and never accepts a caller target',()=>{
  assert.deepEqual(c.publicTargets().map(item=>item.key),['siam_country_club_pattaya','laem_chabang','phoenix','burapha','khao_kheow','chee_chan']);
  assert.throws(()=>c.targetFor('member-supplied-club'),/SIX_COURSE_TARGET_UNKNOWN/);
  assert.equal(c.TARGETS.filter(item=>item.searchQuery).length,1);
});
test('complete means exact provider facts: 18 numbered holes with par and stroke index plus tee yardage and rating',()=>{
  const evidence=c.evidenceForDetail(c.targetFor('siam_country_club_pattaya'),{club:{clubID:'141519520199806521',clubName:'Siam',courses:[complete]}},'2026-09-21T00:00:01Z','evidence-1','digest-1',400);
  assert.equal(evidence.classification,'A');
  assert.equal(evidence.layouts[0].holes[0].strokeIndex,1);
  assert.equal(evidence.layouts[0].tees[0].colour,'Blue');
});
test('missing data is not inferred and produces a partial card',()=>{
  const partial={...complete,holes:complete.holes.map(({strokeIndex,...hole})=>hole),tees:[{teeName:'Blue'}]};
  const evidence=c.evidenceForDetail(c.targetFor('laem_chabang'),{club:{clubID:'141519520199137592',courses:[partial]}},'now','evidence','digest',400);
  assert.equal(evidence.classification,'B');
  assert.equal(evidence.layouts[0].holes[0].strokeIndex,null);
  assert.equal(evidence.layouts[0].tees[0].yardage,null);
});
test('Burapha is resolved only by its locked exact names; absent and ambiguous searches are explicit',()=>{
  const target=c.targetFor('burapha');
  assert.equal(c.buraphaResolution(target,{clubs:[{clubID:'1',clubName:'Not Burapha'}]}).state,'not_found');
  assert.equal(c.buraphaResolution(target,{clubs:[{clubID:'1',clubName:'Burapha Golf Club'},{clubID:'2',clubName:'Burapha'}]}).state,'ambiguous');
  const result=c.buraphaResolution(target,{clubs:[{clubID:'1',clubName:'Burapha Golf & Resort'}]});
  assert.equal(result.state,'matched');assert.equal(result.match.clubId,'1');
});
