import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('./package.json', root), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(new URL('./firebase.json', root), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(new URL('./.firebaserc', root), 'utf8'));
const countryConfig = JSON.parse(readFileSync(new URL('./firebase.country-pipeline.json', root), 'utf8'));
const deploy = packageJson.scripts['deploy:country-pipeline:production'];
const expected = [
  'functions:course-read:getCourseCoverageByCountry',
  'functions:course-read:planCourseCountryIngestion',
  'functions:course-read:getCourseCountryIngestionProjection',
  'functions:course-catalogue:startCourseCountryIngestion',
  'functions:course-catalogue:pauseCourseCountryIngestion',
  'functions:course-catalogue:resumeCourseCountryIngestion',
  'functions:course-catalogue:rebindAndStartKorea',
  'functions:course-catalogue:scheduledCourseCountryIngestionWorker',
  'hosting:admin',
];

test('country release is pinned to the confirmed V2 project and Admin Hosting target', () => {
  assert.match(deploy, /^firebase deploy --project golfriend-v2-production-2ee34 --config firebase\.country-pipeline\.json --only /);
  for (const target of expected) assert.match(deploy, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const selected = [...deploy.matchAll(/(?:functions:[^,\"]+|hosting:[^,\"]+)/g)].map((match) => match[0]).sort();
  assert.deepEqual(selected, [...expected].sort());
  assert.doesNotMatch(deploy, /getGolfApiCatalogueStatus|DIRECTOR_REQUIRED|firestore:rules|firestore:indexes/);
  assert.match(deploy, /--config firebase\.country-pipeline\.json/);
  assert.deepEqual(countryConfig.functions.map((entry) => entry.codebase).sort(), ['course-catalogue', 'course-read']);
  assert.equal(countryConfig.functions.some((entry) => entry.codebase === 'default'), false);
  const catalogue = countryConfig.functions.find((entry) => entry.codebase === 'course-catalogue');
  assert.deepEqual(catalogue.predeploy, ['node scripts/country-pipeline-deploy-preflight.mjs']);
  assert.equal(firebaseRc.projects.default, 'golfriend-v1');
  assert.equal(firebaseRc.projects['golfriend-v2-production-2ee34'], 'golfriend-v2-production-2ee34');
  assert.deepEqual(firebaseRc.targets['golfriend-v2-production-2ee34'].hosting.admin, ['golfriend-v2-admin']);
  assert.equal(firebaseJson.hosting.target, 'admin');
});
