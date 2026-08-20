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
assert.match(app,/activeArea === 'courses' && <V2CourseOperations/);
assert.match(ui,/confirm_preview/); assert.match(ui,/mode:'preview'/); assert.match(ui,/confirm_apply/); assert.match(ui,/mode:'apply'/);
assert.doesNotMatch(ui,/previewId/); assert.match(ui,/mode:'apply',courseIds,requestId/);
assert.match(ui,/crypto\.randomUUID\(\)/);
assert.match(ui,/proposed_for_worker/);
assert.doesNotMatch(ui,/service\.sync\(\{mode:'apply',limit\}\)/);
assert.match(ui,/runState==='confirm_preview'[\s\S]*onClick=\{\(\)=>void runPreview\(\)\}/);
assert.match(ui,/runState==='confirm_apply'[\s\S]*onClick=\{\(\)=>void runApply\(\)\}/);
assert.match(ui,/loadState==='loading'/); assert.match(ui,/loadState==='error'/); assert.match(ui,/visible.length===0/); assert.match(ui,/runState==='partial'/); assert.match(ui,/runState==='error'/); assert.match(ui,/quotaUnknown/); assert.match(ui,/growthBlocked/);
assert.match(service,/httpsCallable\(functions, 'syncCoursesFromProvider'\)/);
assert.match(service,/httpsCallable\(functions, 'getGolfApiSyncStatus'\)/);
assert.doesNotMatch(service,/\bgetDoc\s*\(|golfApiUsage/);
assert.doesNotMatch(ui+service,/GOLF_API_KEY|golfapi\.io|Authorization\s*:|Bearer\s+/i);
assert.doesNotMatch(service,/fetch\s*\(/);
for(const locale of ['en','th','ko','ja','zh','es','fr','de']) assert.match(ui,new RegExp(`\\n  ${locale}:`));
// The V2 course schema, as it actually exists in golfriend-v2-production-2ee34: the
// V1 `cachedAt` retrieval time was migrated under the name `legacyCachedAt`, and
// `source` became a provenance MAP rather than a string. Read with the V1 field names
// only, every migrated record showed "[object Object]" as its data source and counted
// as stale with no Updated date — 3,206 of 3,348 records misreported.
const migrated = normalizeCourse('mig1', {
  courseID: 'provider_mig', clubName: 'Danderyd Golf Club', country: 'Sweden', region: 'Stockholms län',
  latitude: 59.4151243, longitude: 18.0195955,
  legacyCachedAt: new Date(now.getTime() - 55 * 86400000).toISOString(),
  provider: 'golf-api',
  source: { provider: 'golf-api', sourceProject: 'golfriend-v1', sourceCollection: 'courses' },
}, now);
assert.equal(migrated.source, 'golf-api', 'a provenance map must not stringify into the data-source column');
assert.equal(migrated.stale, false, 'legacyCachedAt is the migrated retrieval time and must count for freshness');
assert.ok(migrated.updatedAt, 'a migrated record must report an Updated date');
// The V1 shape still resolves exactly as before.
const legacy = normalizeCourse('leg1', { courseID: 'p', clubName: 'River', country: 'Thailand', latitude: 12, longitude: 100, apiImported: true }, now);
assert.equal(legacy.source, 'golfapi');
const stringSource = normalizeCourse('str1', { courseID: 'p', clubName: 'River', country: 'Thailand', latitude: 12, longitude: 100, source: 'manual-entry' }, now);
assert.equal(stringSource.source, 'manual-entry');

// The Golf API status document must never decide whether the catalogue renders.
// Loading both through one Promise.all made an absent or unreadable status document
// report "catalogue could not be loaded" about a catalogue that had loaded fine —
// which is exactly what the live V2 Admin showed, because platform/golfApiUsage is
// denied by the deployed rules. Comments are stripped first so these assertions can
// never be satisfied by prose describing them.
const uiCode = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(uiCode, /Promise\.all\(\[service\.loadCourses\(\),\s*service\.loadIngestionStatus\(\)\]\)/,
  'the catalogue and the optional status document must not share one all-or-nothing load');
assert.match(uiCode, /catch\s*\{\s*setIngestionStatus\(normalizeIngestionStatus\(null\)\)/,
  'a status document that cannot be read must degrade to "not available", not to an error state');
assert.match(uiCode, /const rows = await service\.loadCourses\(\)[\s\S]*catch\s*\{\s*setLoadState\('error'\); return; \}/,
  'only a catalogue failure may put the panel in the error state');

// Callables are regional. Every function in the V2 project is asia-southeast1, so a
// v2-preview build that used the SDK's us-central1 default would resolve an endpoint
// that does not exist and fail as "not found".
const cfg = fs.readFileSync(new URL('../src/firebaseConfig.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.match(cfg, /ACTIVE_PROJECT === 'v2-preview' \? 'asia-southeast1' : 'us-central1'/);
assert.match(cfg, /getFunctions\(app, FUNCTIONS_REGION\)/);
assert.doesNotMatch(cfg, /getFunctions\(app\)/, 'the callable region must never fall back to the SDK default');

console.log('Course operations verification PASS: catalogue, health, filter, read-only Preview, enqueue-only Apply contract, confirmation, state, quota, locale, route, callable region, independent status load, and secret-boundary assertions.');
