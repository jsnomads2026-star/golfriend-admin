import assert from 'node:assert';
import { classifyCourseSync, isValidCoordinate, isValidProviderId } from './courseSyncCore.js';
assert.equal(isValidProviderId('course_123'), true);
assert.equal(isValidProviderId('unknown'), false);
assert.equal(isValidCoordinate(0, 0), false);
assert.equal(classifyCourseSync('course_123', { latitude: 12, longitude: 100 }, { courseID: 'course_123', latitude: 12, longitude: 100 }).result, 'nochange');
assert.equal(classifyCourseSync('course_123', { latitude: 12, longitude: 100, manualLock: true }, { courseID: 'course_123', latitude: 13, longitude: 101 }).result, 'skipped_manual');
assert.deepEqual(classifyCourseSync('course_123', {}, { courseID: 'course_123', latitude: 13, longitude: 101 }).after, { latitude: 13, longitude: 101 });
console.log('golf-api course core: validation, idempotency and manual-lock checks passed.');
