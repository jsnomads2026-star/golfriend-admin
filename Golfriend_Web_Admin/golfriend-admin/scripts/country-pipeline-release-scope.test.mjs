import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('./package.json', root), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(new URL('./firebase.json', root), 'utf8'));
const firebaseRc = JSON.parse(readFileSync(new URL('./.firebaserc', root), 'utf8'));
const deploy = packageJson.scripts['deploy:country-pipeline:production'];
const expected = [
  'functions:course-read:getCourseCoverageByCountry',
  'functions:course-read:planCourseCountryIngestion',
  'functions:course-catalogue:startCourseCountryIngestion',
  'functions:course-catalogue:pauseCourseCountryIngestion',
  'functions:course-catalogue:resumeCourseCountryIngestion',
  'functions:course-catalogue:scheduledCourseCountryIngestionWorker',
  'hosting:admin',
];

test('country release is pinned to the confirmed V2 target and exactly six pipeline functions plus Admin hosting', () => {
  assert.match(deploy, /^firebase deploy --project golfriend-v2-production-2ee34 --only /);
  for (const target of expected) assert.match(deploy, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const selected = [...deploy.matchAll(/(?:functions:[^,\"]+|hosting:[^,\"]+)/g)].map((match) => match[0]).sort();
  assert.deepEqual(selected, [...expected].sort());
  assert.doesNotMatch(deploy, /getGolfApiCatalogueStatus|DIRECTOR_REQUIRED|firestore:rules|firestore:indexes/);
  assert.equal(firebaseRc.projects.default, 'golfriend-v1');
  assert.equal(firebaseRc.projects['golfriend-v2-production-2ee34'], 'golfriend-v2-production-2ee34');
  assert.deepEqual(firebaseRc.targets['golfriend-v2-production-2ee34'].hosting.admin, ['golfriend-v2-production-2ee34']);
  assert.equal(firebaseJson.hosting.target, 'admin');
});
