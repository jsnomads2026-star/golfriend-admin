// ==========================================
// FILE: functions/src/courseSync.test.ts
// Focused unit tests for the pure course-sync core. Runs on plain node:assert
// (no test framework) via `npm run test:core` after tsc. Exits non-zero on
// the first failed assertion.
// ==========================================
import assert from 'node:assert';
import {
  isValidProviderId,
  isValidCoordinate,
  isManualLocked,
  providerIdMatches,
  classifyCourseSync,
} from './courseSync.js';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// --- provider id validation ---
check('valid provider ids accepted', () => {
  assert.ok(isValidProviderId('0111398836469497431'));
  assert.ok(isValidProviderId('abc-123_XY'));
});
check('invalid provider ids rejected', () => {
  assert.equal(isValidProviderId(''), false);
  assert.equal(isValidProviderId('unknown'), false);
  assert.equal(isValidProviderId('ab'), false);
  assert.equal(isValidProviderId(12345 as unknown), false);
  assert.equal(isValidProviderId('has space'), false);
});

// --- coordinate validation ---
check('valid coordinates accepted', () => {
  assert.ok(isValidCoordinate(12.9236, 100.8825));
  assert.ok(isValidCoordinate('13.75', '100.50'));
});
check('invalid coordinates rejected', () => {
  assert.equal(isValidCoordinate(0, 0), false); // null island
  assert.equal(isValidCoordinate(91, 100), false); // out of range
  assert.equal(isValidCoordinate(10, 200), false);
  assert.equal(isValidCoordinate('n/a', 5), false);
});

// --- manual lock detection ---
check('manual lock detected', () => {
  assert.ok(isManualLocked({ manualLock: true }));
  assert.ok(isManualLocked({ gpsSource: 'manual' }));
  assert.equal(isManualLocked({ gpsSource: 'golfapi' }), false);
  assert.equal(isManualLocked({}), false);
});

// --- deterministic matching ---
check('deterministic id match', () => {
  assert.ok(providerIdMatches('course_1', { courseID: 'course_1' }));
  assert.equal(providerIdMatches('course_1', { courseID: 'course_2' }), false);
  assert.equal(providerIdMatches('course_1', { courseID: 'unknown' }), false);
});

// --- classification / diff ---
check('missing provider result', () => {
  const r = classifyCourseSync('course_1', { latitude: 10, longitude: 20 }, null);
  assert.equal(r.result, 'missing');
  assert.deepEqual(r.before, { latitude: 10, longitude: 20 });
});
check('id conflict', () => {
  const r = classifyCourseSync('course_1', {}, { courseID: 'course_9', latitude: 10, longitude: 20 });
  assert.equal(r.result, 'conflict');
});
check('coordinate conflict', () => {
  const r = classifyCourseSync('course_1', {}, { courseID: 'course_1', latitude: 0, longitude: 0 });
  assert.equal(r.result, 'conflict');
});
check('updates broken coordinates', () => {
  const r = classifyCourseSync('course_1', { latitude: 0, longitude: 0 }, { courseID: 'course_1', latitude: 12.9, longitude: 100.8 });
  assert.equal(r.result, 'updated');
  assert.deepEqual(r.after, { latitude: 12.9, longitude: 100.8 });
});
check('idempotent when already correct', () => {
  const r = classifyCourseSync('course_1', { latitude: 12.9, longitude: 100.8 }, { courseID: 'course_1', latitude: 12.9, longitude: 100.8 });
  assert.equal(r.result, 'nochange');
  assert.equal(r.after, undefined);
});
check('manual correction preserved on divergent provider data', () => {
  const r = classifyCourseSync('course_1', { latitude: 12.9, longitude: 100.8, manualLock: true }, { courseID: 'course_1', latitude: 5.0, longitude: 50.0 });
  assert.equal(r.result, 'skipped_manual');
  assert.equal(r.after, undefined);
});
check('manual lock nochange when identical', () => {
  const r = classifyCourseSync('course_1', { lat: 12.9, lng: 100.8, gpsSource: 'manual' }, { courseID: 'course_1', latitude: 12.9, longitude: 100.8 });
  assert.equal(r.result, 'nochange');
});

console.log(`\ncourseSync core: ${passed} checks passed.`);
