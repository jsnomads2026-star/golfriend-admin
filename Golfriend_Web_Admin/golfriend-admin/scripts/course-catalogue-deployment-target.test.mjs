import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const firebaseRc = JSON.parse(readFileSync(new URL('./.firebaserc', root), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(new URL('./firebase.json', root), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('./package.json', root), 'utf8'));
const runbook = readFileSync(new URL('./docs/COURSE_CATALOGUE_V2_DEPLOYMENT.md', root), 'utf8');
const evidence = readFileSync(new URL('./scripts/read-course-catalogue-v2-evidence.mjs', root), 'utf8');

test('course catalogue keeps the unrelated default V1 project and declares a named V2 alias', () => {
  assert.equal(firebaseRc.projects.default, 'golfriend-v1');
  assert.equal(firebaseRc.projects['golfriend-v2'], 'golfriend-v2');
});

test('course catalogue codebase is Node 20 and has an explicit V2-only deploy command', () => {
  const codebase = firebaseJson.functions.find((item) => item.codebase === 'course-catalogue');
  assert.deepEqual(codebase && { source: codebase.source, runtime: codebase.runtime }, {
    source: 'functions-course-catalogue', runtime: 'nodejs20',
  });
  assert.equal(packageJson.scripts['deploy:course-catalogue:v2'],
    'firebase deploy --project golfriend-v2 --only functions:course-catalogue');
  assert.equal(packageJson.scripts['evidence:course-catalogue:v2'],
    'node scripts/read-course-catalogue-v2-evidence.mjs');
  assert.match(packageJson.scripts['verify:course-catalogue-predeploy'], /test:course-catalogue-deployment-target/);
  assert.match(runbook, /firebase deploy --project golfriend-v2 --only functions:course-catalogue/);
  assert.doesNotMatch(runbook, /firebase deploy(?!\s+--project\s+golfriend-v2)/);
  assert.doesNotMatch(runbook, /--project\s+golfriend-v1/);
  assert.match(evidence, /PROJECT='golfriend-v2'/);
  assert.match(evidence, /Read-only V2 control-plane evidence/);
  assert.doesNotMatch(evidence, /:access|method:\s*['"]POST['"]|method:\s*['"]PATCH['"]|method:\s*['"]PUT['"]|method:\s*['"]DELETE['"]/);
});
