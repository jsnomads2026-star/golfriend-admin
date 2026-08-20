import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const domain = require('../functions-course-catalogue/domain.js');
const lifecycle = require('../functions-course-catalogue/provider-lifecycle.js');

const validPage = () => ({
  apiRequestsLeft: 400,
  numAllClubs: 2,
  clubs: [
    { clubID: 'club_a', clubName: 'A', courses: [{ courseID: 'course_a' }, { courseID: 'course_b' }] },
  ],
});

test('normalizes a valid provider page and accepts a genuine zero-result page', () => {
  const page = domain.validatePage(validPage());
  assert.equal(page.valid, true);
  assert.deepEqual(page.clubs[0].courses.map(({ courseID }) => courseID), ['course_a', 'course_b']);

  const zero = domain.validatePage({ apiRequestsLeft: 400, numAllClubs: 0, clubs: [] });
  assert.equal(zero.valid, true);
  assert.equal(zero.clubs.length, 0);
});

test('rejects malformed provider responses and quarantines duplicate identities', () => {
  assert.deepEqual(domain.validatePage({ clubs: [] }), { valid: false, reason: 'UNEXPECTED_PAGE_SHAPE' });
  const duplicate = domain.validatePage({
    apiRequestsLeft: 400,
    numAllClubs: 2,
    clubs: [
      { clubID: 'club_a', courses: [{ courseID: 'course_a' }] },
      { clubID: 'club_b', courses: [{ courseID: 'course_a' }] },
    ],
  });
  assert.equal(duplicate.valid, true);
  assert.equal(duplicate.quarantine[0].reason, 'COURSE_ID_CLUB_CONFLICT');
});

test('deduplicated document identity and curated values make a rerun idempotent', () => {
  const docs = [
    { id: 'course_a', data: { schema: 'golfriend.v2.course.v2', courseID: 'course_a', providerCourseId: 'course_a', clubID: 'club_a', coordinateValidity: 'valid' } },
    { id: 'course_b', data: { schema: 'golfriend.v2.course.v2', courseID: 'course_b', providerCourseId: 'course_b', clubID: 'club_a', coordinateValidity: 'valid' } },
  ];
  const first = domain.countIdentity(docs);
  const rerun = domain.countIdentity(docs);
  assert.deepEqual(rerun, first);
  assert.equal(first.duplicateProviderCourseIds, 0);
  assert.equal(domain.mergeCurated({ manualLock: true, latitude: 13 }, { latitude: 1 }).latitude, 13);
});

test('a partial batch resumes from the exact persisted course cursor', () => {
  const page = domain.validatePage(validPage());
  const afterFirst = domain.advanceCursor(page.clubs, 0, 0);
  assert.deepEqual(afterFirst, { clubOffset: 0, courseOffset: 1, pageComplete: false });
  assert.equal(domain.cursorItem(page.clubs, afterFirst.clubOffset, afterFirst.courseOffset).course.courseID, 'course_b');
  assert.equal(domain.advanceCursor(page.clubs, afterFirst.clubOffset, afterFirst.courseOffset).pageComplete, true);
});

test('provider transport errors settle failed accounting without retrying or creating course data', async () => {
  let providerCalls = 0;
  let failedCost = 0;
  await assert.rejects(() => lifecycle.executeProviderRequest({
    cost: 0.1,
    runId: 'fixture-run',
    path: '/api/v2.3/clubs?pageSize=200',
    reserve: async () => ({ reserved: true, reservationId: 'fixture-reservation' }),
    markInFlight: async () => {},
    limit: async () => {},
    transport: async () => { providerCalls++; throw new Error('PROVIDER_UNAVAILABLE'); },
    digest: () => 'fixture-digest',
    recordObservation: async () => {},
    settleCompleted: async () => {},
    persistPending: async () => {},
    settleTransportFailure: async (_reservation, value) => { failedCost += value.cost; },
    now: () => '2026-08-21T00:00:00.000Z',
  }), /PROVIDER_UNAVAILABLE/);
  assert.equal(providerCalls, 1);
  assert.equal(failedCost, 0.1);
});

test('Admin status is sourced from the server callable and real course documents, not a claimed count', () => {
  const root = new URL('..', import.meta.url);
  const service = readFileSync(new URL('./src/components/admin/v2/courseOperationsService.ts', root), 'utf8');
  const monitor = readFileSync(new URL('./src/components/admin/v2/V2CourseOperationsMonitor.tsx', root), 'utf8');
  const callable = readFileSync(new URL('./functions-course-catalogue/index.js', root), 'utf8');
  assert.match(service, /httpsCallable\(functions,'getGolfApiCatalogueStatus'\)/);
  assert.match(callable, /db\.collection\('courses'\)\.get\(\)/);
  assert.match(callable, /counts=d\.countIdentity\(courses\.docs\.map/);
  assert.match(monitor, /\{shown\(counts\.canonical\)\}\s*\/\s*\{shown\(counts\.usable\)\}/);
  assert.doesNotMatch(`${service}\n${monitor}\n${callable}`, /\b3,?000\+?\s*(courses?)?\b/i);
});
