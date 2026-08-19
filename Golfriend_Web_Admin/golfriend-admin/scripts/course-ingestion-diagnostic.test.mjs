// FILE: scripts/course-ingestion-diagnostic.test.mjs
// Focused tests for the ingestion diagnostic model functions:
//   - summarizeCourses.usable (new field)
//   - normalizeIngestionStatus (new function)
// Run: node scripts/course-ingestion-diagnostic.test.mjs
import assert from 'node:assert/strict';
import { normalizeIngestionStatus, normalizeCourse, markDuplicates, summarizeCourses } from '../src/components/admin/v2/courseOperationsModel.mjs';

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// ---- usable courses ----

check('usable counts courses with coordinates and no manual-review flag', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const courses = markDuplicates([
    normalizeCourse('a', { courseID:'c1', clubName:'Active', country:'TH', region:'East', latitude:12, longitude:100, cachedAt:'2026-08-10T00:00:00Z' }, now),
    normalizeCourse('b', { courseID:'c2', clubName:'Quarantined', country:'TH', region:'East', latitude:13, longitude:101, requiresManualGPS:true, cachedAt:'2026-08-10T00:00:00Z' }, now),
    normalizeCourse('c', { courseID:'c3', clubName:'No GPS', country:'TH', region:'West' }, now),
  ]);
  const s = summarizeCourses(courses);
  assert.equal(s.total, 3, 'total');
  assert.equal(s.withCoordinates, 2, 'withCoordinates');
  assert.equal(s.usable, 1, 'usable excludes requiresManualGPS courses');
});

check('usable is 0 when all courses are quarantined', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const courses = markDuplicates([
    normalizeCourse('a', { courseID:'c1', clubName:'Q1', country:'TH', region:'East', latitude:12, longitude:100, requiresManualGPS:true, cachedAt:'2026-08-10T00:00:00Z' }, now),
  ]);
  assert.equal(summarizeCourses(courses).usable, 0);
});

check('usable is 0 for empty catalogue', () => {
  assert.equal(summarizeCourses([]).usable, 0);
});

check('usable equals withCoordinates when no quarantined courses', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  const courses = markDuplicates([
    normalizeCourse('a', { courseID:'c1', clubName:'A', country:'TH', region:'East', latitude:12, longitude:100, cachedAt:'2026-08-10T00:00:00Z' }, now),
    normalizeCourse('b', { courseID:'c2', clubName:'B', country:'TH', region:'West', latitude:13, longitude:101, cachedAt:'2026-08-10T00:00:00Z' }, now),
  ]);
  const s = summarizeCourses(courses);
  assert.equal(s.usable, s.withCoordinates, 'usable === withCoordinates when none quarantined');
});

// ---- normalizeIngestionStatus ----

check('normalizes null gracefully', () => {
  const r = normalizeIngestionStatus(null);
  assert.equal(r.source, 'golfapi.io v2.3');
  assert.equal(r.lastCommitAt, null);
  assert.equal(r.added, null);
  assert.equal(r.failed, null);
  assert.equal(r.estimatedCallsUsed, null);
  assert.equal(r.errors, null);
});

check('normalizes undefined gracefully', () => {
  const r = normalizeIngestionStatus(undefined);
  assert.equal(r.source, 'golfapi.io v2.3');
  assert.equal(r.lastCommitAt, null);
});

check('normalizes a valid usage document with ISO timestamp', () => {
  const raw = {
    lastCommitAt: '2026-08-18T14:30:00.000Z',
    estimatedCallsUsed: 142,
    lastCommitResult: { added: 7, skippedExisting: 3, reviewRequired: 1, failed: 0, apiCallsUsed: 10, errors: [] },
    lastCommitJobId: 'job_abc123',
  };
  const r = normalizeIngestionStatus(raw);
  assert.equal(r.source, 'golfapi.io v2.3');
  assert.equal(r.lastCommitAt, '2026-08-18T14:30:00.000Z');
  assert.equal(r.estimatedCallsUsed, 142);
  assert.equal(r.added, 7);
  assert.equal(r.skippedExisting, 3);
  assert.equal(r.reviewRequired, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.lastCommitJobId, 'job_abc123');
  assert.deepEqual(r.errors, []);
});

check('handles Firestore Timestamp-like objects for lastCommitAt', () => {
  const raw = {
    lastCommitAt: { toDate: () => new Date('2026-08-15T10:00:00.000Z') },
    estimatedCallsUsed: 50,
    lastCommitResult: { added: 2, skippedExisting: 0, reviewRequired: 0, failed: 0, apiCallsUsed: 2, errors: [] },
  };
  const r = normalizeIngestionStatus(raw);
  assert.equal(r.lastCommitAt, '2026-08-15T10:00:00.000Z');
  assert.equal(r.estimatedCallsUsed, 50);
});

check('surfaces failed courses and caps errors at 5', () => {
  const manyErrors = Array.from({length: 8}, (_, i) => ({ courseID: `bad_${i}`, message: 'GPS missing' }));
  const raw = {
    lastCommitAt: '2026-08-18T14:30:00.000Z',
    estimatedCallsUsed: 20,
    lastCommitResult: { added: 0, skippedExisting: 0, reviewRequired: 0, failed: 8, apiCallsUsed: 8, errors: manyErrors },
  };
  const r = normalizeIngestionStatus(raw);
  assert.equal(r.failed, 8);
  assert.equal(r.errors?.length, 5, 'errors capped at 5');
  assert.equal(r.errors?.[0].courseID, 'bad_0');
});

check('missing lastCommitResult returns null count fields', () => {
  const raw = { estimatedCallsUsed: 5, lastCallAt: '2026-08-01T00:00:00.000Z' };
  const r = normalizeIngestionStatus(raw);
  assert.equal(r.added, null);
  assert.equal(r.failed, null);
  assert.equal(r.reviewRequired, null);
  assert.equal(r.estimatedCallsUsed, 5);
});

check('invalid lastCommitAt string returns null', () => {
  const raw = { lastCommitAt: 'not-a-date', estimatedCallsUsed: 3, lastCommitResult: null };
  const r = normalizeIngestionStatus(raw);
  assert.equal(r.lastCommitAt, null);
  assert.equal(r.estimatedCallsUsed, 3);
});

console.log(`\ncourse-ingestion-diagnostic: ${passed} checks passed.`);
