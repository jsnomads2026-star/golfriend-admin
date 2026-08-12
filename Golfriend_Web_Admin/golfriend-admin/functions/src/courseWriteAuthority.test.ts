import assert from 'node:assert';
import { normalizeManualCourseCorrection } from './courseWriteAuthority.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

check('accepts a bounded canonical manual correction', () => {
  assert.deepEqual(normalizeManualCourseCorrection({ courseId: 'course_123', latitude: 13.75, longitude: 100.5 }), {
    courseId: 'course_123', latitude: 13.75, longitude: 100.5,
  });
});
check('rejects malformed identifiers, null island, and out-of-range coordinates', () => {
  assert.throws(() => normalizeManualCourseCorrection({ courseId: '../secret', latitude: 13, longitude: 100 }));
  assert.throws(() => normalizeManualCourseCorrection({ courseId: 'course_123', latitude: 0, longitude: 0 }));
  assert.throws(() => normalizeManualCourseCorrection({ courseId: 'course_123', latitude: 91, longitude: 100 }));
});
check('rejects unsupported authority metadata', () => {
  assert.throws(() => normalizeManualCourseCorrection({ courseId: 'course_123', latitude: 13, longitude: 100, trusted: false }));
  assert.throws(() => normalizeManualCourseCorrection({ courseId: 'course_123', latitude: 13, longitude: 100, gpsSource: 'golfapi' }));
});

console.log(`\ncourseWriteAuthority: ${passed} checks passed.`);
