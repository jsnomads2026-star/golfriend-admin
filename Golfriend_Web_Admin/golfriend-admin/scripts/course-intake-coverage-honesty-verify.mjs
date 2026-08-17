import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const functionsPackage = JSON.parse(readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8'));
let checks = 0;
for (const name of ['verify:course-intake-coverage', 'verify:course-intake-identity', 'verify:course-intake-rules', 'verify:course-intake-security', 'verify:course-intake-locales']) {
  assert.ok(pkg.scripts[name]); checks += 1;
}
assert.match(functionsPackage.scripts['test:course-intake'], /enterpriseCourseIntakeSecurity\.test\.js/); checks += 1;
assert.match(pkg.scripts['verify:course-intake-security'], /test:course-intake/); checks += 1;
assert.match(pkg.scripts['gate:course-intake'], /coverage.*identity.*rules.*security.*locales/); checks += 1;
assert.match(pkg.scripts.gate, /gate:course-intake/); checks += 1;
console.log(`Course Intake coverage honesty PASS: ${checks}/${checks}`);
