import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterCourses, healthOf, markDuplicates, normalizeCourse, normalizeSyncResult, summarizeCourses } from '../src/components/admin/v2/courseOperationsModel.mjs';

const now = new Date('2026-08-12T00:00:00Z');
const courses = markDuplicates([
  normalizeCourse('a', { courseID:'provider_a', clubName:'River Club', country:'Thailand', region:'East', latitude:12, longitude:100, providerFetchedAt:'2026-08-10T00:00:00Z', gpsSource:'golfapi' }, now),
  normalizeCourse('b', { courseID:'provider_b', clubName:'River Club', country:'Thailand', region:'East', requiresManualGPS:true }, now),
  normalizeCourse('c', { courseID:'provider_c', clubName:'Old Course', country:'Spain', latitude:40, longitude:-3, cachedAt:'2025-01-01T00:00:00Z' }, now),
  normalizeCourse('d', { courseID:'provider_d', latitude:35, longitude:139 }, now),
]);
assert.equal(summarizeCourses(courses).total,4); assert.equal(summarizeCourses(courses).regions,2);
assert.equal(summarizeCourses(courses).withCoordinates,3); assert.equal(summarizeCourses(courses).missingCoordinates,1);
assert.equal(healthOf(courses[0]),'duplicate'); assert.equal(healthOf(courses[1]),'duplicate'); assert.equal(healthOf(courses[2]),'stale'); assert.equal(healthOf(courses[3]),'incomplete');
assert.deepEqual(filterCourses(courses,'spain','all').map((c)=>c.id),['c']);
assert.deepEqual(filterCourses(courses,'','missing_coordinates').map((c)=>c.id),['b']);
assert.deepEqual(filterCourses(courses,'','duplicate').map((c)=>c.id),['a','b']);
assert.throws(()=>normalizeSyncResult(null),/failed validation/);
const preview=normalizeSyncResult({success:true,mode:'preview',processed:2,summary:{updated:1,error:1},results:[]});
assert.equal(preview.productionWrites,0); assert.equal(preview.quota,null);

const ui=fs.readFileSync(new URL('../src/components/admin/v2/V2CourseOperations.tsx',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/components/admin/v2/courseOperationsService.ts',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const uiRuntime = ui.slice(ui.indexOf('type Filter'));
const enFragments = [
  'COURSE AUTHORITY',
  'Data quality filters',
  'SERVER-AUTHORIZED CALLABLE',
  'Versions',
  'trusted/manual lock',
  'updated: course.updatedAt',
  'Manual lock',
];
for (const fragment of enFragments) {
  assert.doesNotMatch(uiRuntime, new RegExp(fragment));
}
assert.match(app,/activeArea === 'courses' && <V2CourseOperations/);
assert.match(ui,/confirm_preview/); assert.match(ui,/mode:\s*'preview'/); assert.match(ui,/confirm_apply/); assert.match(ui,/mode:\s*'apply'/);
assert.match(ui,/preview\?\.\s*results\s*\.filter\(\(row\)\s*=>\s*row\.result\s*===\s*'updated'\)/);
assert.match(ui,/mode:\s*'apply',\s*courseIds/);
assert.doesNotMatch(ui,/service\.sync\(\{mode:'apply',limit\}\)/);
assert.match(ui,/runState\s*===\s*'confirm_preview'[\s\S]*onClick=\{\s*\(\)\s*=>\s*void runPreview\(\)\s*\}/);
assert.match(ui,/runState\s*===\s*'confirm_apply'[\s\S]*onClick=\{\s*\(\)\s*=>\s*void runApply\(\)\s*\}/);
assert.match(ui,/loadState\s*===\s*'loading'/); assert.match(ui,/loadState\s*===\s*'error'/); assert.match(ui,/visible\.length\s*===\s*0/); assert.match(ui,/runState\s*===\s*'partial'/); assert.match(ui,/runState\s*===\s*'error'/); assert.match(ui,/quotaUnknown/); assert.match(ui,/growthBlocked/);
assert.match(service,/httpsCallable\(functions, 'syncCoursesFromProvider'\)/);
assert.doesNotMatch(ui+service,/GOLF_API_KEY|golfapi\.io|Authorization\s*:|Bearer\s+/i);
assert.doesNotMatch(service,/fetch\s*\(/);
for(const locale of ['en','th','ko','ja','zh','es','fr','de']) assert.match(ui,new RegExp(`\\n  ${locale}:`));
console.log('Course operations verification PASS: catalogue, health, filter, preview-bound apply, confirmation, state, quota, locale, route, and secret-boundary assertions.');
