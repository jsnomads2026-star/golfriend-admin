import assert from "node:assert";
import {assertQuotaAvailable, buildCourseGrowthRecord, deterministicReceiptId, expandClubShells, normalizeCourseCandidates, planCourseUpserts, previewProviderAttemptReservation, requireProviderConfiguration, RETRY_DELAYS_MS, withDeterministicRetry} from "./courseGrowth.js";

let passed = 0;
function check(name: string, run: () => void | Promise<void>) { return Promise.resolve(run()).then(() => {passed++; console.log(`  ✓ ${name}`);}); }
async function main() {

await check("normalization preserves Unicode and sorts deterministic unique provider ids", () => {
  const rows = normalizeCourseCandidates({clubs:[{clubName:"สโมสรกอล์ฟ",country:"ไทย",courses:[{courseID:"course_b",courseName:"สนาม บี"},{courseID:"course_a",courseName:"Cafe\u0301"},{courseID:"course_a",courseName:"duplicate"}]}]});
  assert.deepEqual(rows.map((row) => row.courseID), ["course_a","course_b"]);
  assert.equal(rows[0].name, "Café"); assert.equal(rows[1].clubName, "สโมสรกอล์ฟ");
});
await check("invalid and unknown provider ids are dropped", () => assert.equal(normalizeCourseCandidates({clubs:[{courses:[{courseID:"unknown"},{courseID:"x"}]}]}).length, 0));
await check("list shells expand to every legitimate layout before Firebase planning", async () => {
  const fetched:string[]=[];
  const plan=await expandClubShells({clubs:[{clubID:"siam_1",clubName:"Siam Country Club"}]},async(clubID)=>{fetched.push(clubID);return {data:{clubID,clubName:"Siam Country Club",courses:[{courseID:"siam_old",courseName:"Old Course"},{courseID:"siam_plantation",courseName:"Plantation"},{courseID:"siam_waterside",courseName:"Waterside"},{courseID:"siam_rolling",courseName:"Rolling Hills"}]}};});
  assert.deepEqual(fetched,["siam_1"]);assert.deepEqual(plan.candidates.map((row)=>row.courseID),["siam_old","siam_plantation","siam_rolling","siam_waterside"]);assert.deepEqual(plan.expandedClubIds,["siam_1"]);
});
await check("shared club and coordinates never collapse distinct provider course ids", async () => {
  const plan=await expandClubShells({clubs:[{clubID:"club_1",clubName:"Multi Club",courses:[{courseID:"layout_1"}],courseCount:2}]},async()=>({clubID:"club_1",latitude:12,longitude:100,courses:[{courseID:"layout_1"},{courseID:"layout_2"}]}));
  assert.deepEqual(plan.candidates.map((row)=>row.courseID),["layout_1","layout_2"]);
});
await check("existing Firebase ids are planned out before course-detail calls", async () => {
  const plan=await expandClubShells({clubs:[{clubID:"club_1"}]},async()=>({clubID:"club_1",courses:[{courseID:"existing_1"},{courseID:"new_1"}]}));
  assert.deepEqual(planCourseUpserts(plan.candidates,new Set(["existing_1"])).create.map((row)=>row.courseID),["new_1"]);
});
await check("provider absence creates no synthetic Siam course", async () => {
  const plan=await expandClubShells({clubs:[{clubID:"siam_1",clubName:"Siam"}]},async()=>({clubID:"siam_1",courses:[{courseID:"siam_old"},{courseID:"siam_plantation"}]}));
  assert.deepEqual(plan.candidates.map((row)=>row.courseID),["siam_old","siam_plantation"]);assert.equal(plan.candidates.some((row)=>row.name==="Rolling Hills"),false);
});
await check("club-detail retry reservations include every shell", () => assert.equal(previewProviderAttemptReservation(3),16));
await check("upsert plan skips existing ids and remains deterministic on retry", () => {
  const rows=normalizeCourseCandidates({clubs:[{courses:[{courseID:"course_2"},{courseID:"course_1"}]}]});
  const first=planCourseUpserts(rows,new Set(["course_1"]));assert.deepEqual(first.create.map(row=>row.courseID),["course_2"]);assert.deepEqual(first.skippedExisting,["course_1"]);
  const retry=planCourseUpserts(rows,new Set(["course_1","course_2"]));assert.deepEqual(retry.create,[]);assert.deepEqual(retry.skippedExisting,["course_1","course_2"]);
});
await check("quota requires authoritative configuration", () => {
  assert.throws(() => assertQuotaAvailable({}, 1), /QUOTA_UNCONFIGURED/);
  assert.throws(() => assertQuotaAvailable({monthlyLimit:10,estimatedCallsUsed:9}, 2), /QUOTA_EXHAUSTED/);
  assert.deepEqual(assertQuotaAvailable({monthlyLimit:10,estimatedCallsUsed:4}, 2), {limit:10,used:4,remainingAfter:4});
});
await check("provider configuration fails closed", () => { assert.throws(() => requireProviderConfiguration(""), /PROVIDER_UNCONFIGURED/); assert.equal(requireProviderConfiguration(" fixture-key "), "fixture-key"); });
await check("deterministic retries use bounded delays", async () => {
  let calls=0; const waits:number[]=[]; const result=await withDeterministicRetry(async()=>{if(++calls<3)throw Error("transient");return "ok";},async(delay)=>{waits.push(delay);});
  assert.deepEqual(result,{value:"ok",attempts:3}); assert.deepEqual(waits, RETRY_DELAYS_MS.slice(0,2));
});
await check("non-retryable failures stop immediately", async () => {let calls=0;await assert.rejects(()=>withDeterministicRetry(async()=>{calls++;throw Error("quota");},async()=>{},()=>false),/quota/);assert.equal(calls,1);});
await check("growth record is localization-safe and coordinates reconcile", () => {
  const candidate=normalizeCourseCandidates({clubs:[{clubName:"คลับ",courses:[{courseID:"course_1",courseName:"สนาม"}]}]})[0];
  const record=buildCourseGrowthRecord(candidate,{latitude:12,longitude:100,holes:[1]},{greens:[]});
  assert.deepEqual(record.localization,{defaultLocale:"und",names:{und:"สนาม"},clubNames:{und:"คลับ"}}); assert.equal(record.latitude,12); assert.equal(record.requiresCoordinatorReview,false);
});
await check("manual coordinates are preserved", () => {
  const candidate=normalizeCourseCandidates({clubs:[{clubName:"Club",courses:[{courseID:"course_1",courseName:"Course"}]}]})[0];
  const record=buildCourseGrowthRecord(candidate,{latitude:5,longitude:50},{},{latitude:12,longitude:100,manualLock:true}); assert.equal(record.latitude,12); assert.equal(record.longitude,100);
});
await check("invalid coordinates are quarantined without fabrication", () => {
  const candidate=normalizeCourseCandidates({clubs:[{courses:[{courseID:"course_1"}]}]})[0]; const record=buildCourseGrowthRecord(candidate,{latitude:0,longitude:0},{greens:[]}); assert.equal(record.latitude,null); assert.equal(record.isActive,false); assert.equal(record.requiresCoordinatorReview,true);
});
await check("receipt ids are deterministic per job", () => { assert.equal(deterministicReceiptId("job-1"),deterministicReceiptId("job-1")); assert.notEqual(deterministicReceiptId("job-1"),deterministicReceiptId("job-2")); });
console.log(`\ncourse growth: ${passed} checks passed.`);
}
void main().catch((error) => {console.error(error); process.exitCode = 1;});
