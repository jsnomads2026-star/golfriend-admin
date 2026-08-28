import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the three initial Admin courses reads use V2 asia-southeast1 callables', () => {
  const config = read('src/firebaseConfig.ts');
  const operations = read('src/components/admin/v2/courseOperationsService.ts');
  const availability = read('src/components/B2B/CourseAvailabilityV2.tsx');
  const runtime = read('functions/src/partnerAvailabilityRuntime.ts');
  assert.match(config, /getFunctions\(app, FUNCTIONS_REGION\)/);
  assert.match(config, /ACTIVE_PROJECT === 'v2-preview' \? 'asia-southeast1'/);
  assert.match(operations, /httpsCallable\(functions, 'getCourseCoverageByCountry'\)/);
  assert.match(operations, /httpsCallable\(functions,'getGolfApiCatalogueStatus'\)/);
  assert.match(availability, /import \{ functions \} from '..\/..\/firebaseConfig'/);
  assert.match(availability, /httpsCallable\(functions, name\)/);
  assert.doesNotMatch(availability, /getFunctions\(\)/);
  assert.match(runtime, /listCourseAvailabilityAdminV2=onCall\(\{region:"asia-southeast1",enforceAppCheck:true\}/);
});
