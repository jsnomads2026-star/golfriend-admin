import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterCourses, healthOf, markDuplicates, normalizeCourse, normalizeSyncResult, summarizeCourses } from '../src/components/admin/v2/courseOperationsModel.mjs';
import { addCataloguePreviewPage, emptyCataloguePreview } from '../src/components/admin/v2/cataloguePreviewModel.mjs';

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
assert.match(app,/activeArea === 'courses' && <V2CourseOperations/);
assert.match(ui,/confirm_preview/); assert.match(ui,/mode:'preview'/); assert.match(ui,/confirm_apply/); assert.match(ui,/mode:'apply'/);
assert.match(ui,/preview\?\.results\.filter\(\(row\)=>row\.result==='updated'\)/); assert.match(ui,/mode:'apply',courseIds/);
assert.doesNotMatch(ui,/service\.sync\(\{mode:'apply',limit\}\)/);
assert.match(ui,/runState==='confirm_preview'[\s\S]*onClick=\{\(\)=>void runPreview\(\)\}/);
assert.match(ui,/runState==='confirm_apply'[\s\S]*onClick=\{\(\)=>void runApply\(\)\}/);
assert.match(ui,/loadState==='loading'/); assert.match(ui,/loadState==='error'/); assert.match(ui,/visible.length===0/); assert.match(ui,/runState==='partial'/); assert.match(ui,/runState==='error'/); assert.match(ui,/quotaUnknown/); assert.match(ui,/growthBlocked/);
assert.match(service,/httpsCallable\(functions, 'syncCoursesFromProvider'\)/);
assert.doesNotMatch(ui+service,/GOLF_API_KEY|golfapi\.io|Authorization\s*:|Bearer\s+/i);
assert.doesNotMatch(service,/fetch\s*\(/);
for(const locale of ['en','th','ko','ja','zh','es','fr','de']) assert.match(ui,new RegExp(`\\n  ${locale}:`));

const fullPreview=fs.readFileSync(new URL('../src/components/admin/v2/V2FullCataloguePreview.tsx',import.meta.url),'utf8');
const fullPreviewModel=fs.readFileSync(new URL('../src/components/admin/v2/cataloguePreviewModel.mjs',import.meta.url),'utf8');
const siamInspector=fs.readFileSync(new URL('../src/components/admin/v2/V2SiamProviderInspector.tsx',import.meta.url),'utf8');
const cataloguePage={mode:'catalogue',batch:{providerClubIds:['club-a','club-b']},metrics:{courseRowsMeasured:4,provenClubHouses:1,safelyLinkableCourses:3,unchangedTrustedLinks:1,ambiguousGroups:1,invalidGeography:0,invalidProviderClubIdRows:0,providerContactFactsAvailable:1,bookingAuthorityUnavailable:2,enrichmentRequired:1,proposedWrites:3,productionWrites:0},ambiguousGroups:[{providerClubId:'club-a',providerPropertyId:null,reason:'ambiguous',providerCourseIds:['course-a']}],siamEvidence:[],seoulEvidence:[],planHash:'page-plan',sourceStateHash:'page-source'};
const aggregate=addCataloguePreviewPage(emptyCataloguePreview(),cataloguePage,undefined);
assert.equal(aggregate.totals.courseRowsMeasured,4); assert.equal(aggregate.providerClubIds.size,2); assert.equal(aggregate.ambiguous.size,1);
const replay=addCataloguePreviewPage(aggregate,cataloguePage,undefined);
assert.equal(replay,aggregate); assert.equal(replay.totals.proposedWrites,3);
assert.throws(()=>addCataloguePreviewPage(emptyCataloguePreview(),{...cataloguePage,metrics:{...cataloguePage.metrics,productionWrites:1}},undefined),/CATALOGUE_PREVIEW_WRITE_BOUNDARY/);
assert.throws(()=>addCataloguePreviewPage(emptyCataloguePreview(),{...cataloguePage,metrics:{...cataloguePage.metrics,productionWrites:undefined}},undefined),/CATALOGUE_PREVIEW_WRITE_BOUNDARY/);
assert.match(ui,/V2FullCataloguePreview/);
assert.match(fullPreview,/READ-ONLY GOLF CATALOGUE PREVIEW — ZERO PRODUCTION WRITES/);
assert.match(fullPreview,/>Preview full golf catalogue</);
assert.match(fullPreview,/mode:'catalogue',batchSize:25/);
assert.match(fullPreview,/STALE_PREVIEW/); assert.match(fullPreview,/CATALOGUE_PREVIEW_CURSOR_REPLAY/);
assert.match(fullPreview,/planHash/); assert.match(fullPreview,/sourceStateHash/);
assert.match(fullPreview,/productionWrites/); assert.match(fullPreviewModel,/metrics\?\.productionWrites!==0/);
assert.match(service,/httpsCallable\(functions,'previewCourseClubhouseReconciliation'\)/);
assert.doesNotMatch(fullPreview+fullPreviewModel+service,/executeCourseClubhouseReconciliation/);
assert.doesNotMatch(fullPreview,/setDoc|updateDoc|addDoc|deleteDoc|GOLF_API_KEY|Authorization|Bearer|apiKey|secret/i);
assert.match(fullPreview,/SIAM\.map\(label=>[\s\S]*providerClubName===label/);
assert.match(siamInspector,/Inspect Siam 50 km/); assert.doesNotMatch(siamInspector,/Preview full golf catalogue/);
console.log('Course operations verification PASS: catalogue, health, filter, preview-bound apply, confirmation, state, quota, locale, route, secret boundary, read-only full-catalogue paging, replay de-duplication, stale stop, ambiguity display, and Siam-inspector isolation assertions.');
