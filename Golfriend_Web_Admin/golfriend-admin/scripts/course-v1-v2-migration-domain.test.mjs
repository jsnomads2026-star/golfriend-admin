import assert from 'node:assert/strict';
import test from 'node:test';
import {migrateLegacyCourse, normalizeCountry, planMigration} from './course-v1-v2-migration-domain.mjs';

test('preserves licensed fields and never invents freshness or contact data', () => {
  const source={courseID:'42',clubName:' Club ',country:'Hong kong',state:'HK',city:'City',address:'A',latitude:1,longitude:2,holes:[{par:4}],greenCoordinates:[1],cachedAt:'legacy-cache'};
  const result=migrateLegacyCourse({legacyDocumentId:'legacy',source,migratedAt:'2026-08-17T00:00:00.000Z'});
  assert.equal(result.kind,'canonical'); assert.equal(result.value.country,'Hong Kong'); assert.equal(result.value.originalCountryLabel,'Hong kong');
  assert.deepEqual(result.value.holes,source.holes); assert.deepEqual(result.value.licensedCourseData.greenCoordinates,[1]);
  assert.equal(result.value.providerRetrievalAt,null); assert.equal(result.value.freshnessState,'unknown'); assert.equal(result.value.contact,null); assert.equal(result.value.facilities,null);
});
test('quarantines missing provider ID and marks bad coordinates incomplete',()=>{
  assert.equal(migrateLegacyCourse({legacyDocumentId:'x',source:{name:'x'},migratedAt:'now'}).kind,'quarantine');
  const result=migrateLegacyCourse({legacyDocumentId:'y',source:{courseID:'y',name:'y',country:'UK',latitude:0,longitude:0},migratedAt:'now'});
  assert.equal(result.value.migrationState,'incomplete'); assert.deepEqual(result.value.incompleteReasons,['invalid_coordinates']);
});
test('plan is deterministic by stable provider ID',()=>{const rows=[{id:'a',data:{courseID:'1',name:'A',country:'USA',latitude:1,longitude:1}},{id:'b',data:{courseID:'1',name:'B'}}];const plan=planMigration(rows,'fixed');assert.equal(plan.canonical.length,1);assert.deepEqual(plan.duplicates,['1']);});
