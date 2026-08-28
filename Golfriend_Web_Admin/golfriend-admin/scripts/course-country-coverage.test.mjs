import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const service = read('src/components/admin/v2/courseOperationsService.ts');
const panel = read('src/components/admin/v2/V2CourseCoverageByCountry.tsx');
const host = read('src/components/admin/v2/V2CourseOperations.tsx');

assert.match(service, /httpsCallable\(functions, 'getCourseCoverageByCountry'\)/);
assert.doesNotMatch(service, /getDocs\s*\(|collection\(db, 'courses'\)/);
assert.match(panel, /state === 'loading'/);
assert.match(panel, /state === 'unavailable'/);
assert.match(panel, /countries\.every\(\(country\) => country\.totalCourses === 0\)/);
for (const header of ['Total courses', 'With coordinates', 'Missing coordinates', 'Golf API imported', 'Direct-confirmed', 'Provider evidence missing', 'Latest Golfriend fetch']) assert.match(panel, new RegExp(header));
assert.match(panel, /No country is inferred from coordinates/);
assert.match(host, /V2CourseCoverageByCountry service=\{service\}/);
console.log('Course country coverage UI contract PASS: callable-only table with loading, unavailable, and empty states.');
