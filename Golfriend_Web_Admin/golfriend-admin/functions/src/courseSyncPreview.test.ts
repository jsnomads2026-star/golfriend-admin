import assert from 'node:assert';
import { assertEmulatorOnlyPreviewTarget, runSyncCoursesFromProviderPreview, type PreviewTarget, type SyntheticProviderOutcome } from './courseSyncPreview.js';

assertEmulatorOnlyPreviewTarget({
  projectId: 'demo-golfriend-course-preview',
  functionsHost: '127.0.0.1:5001',
  firestoreHost: '127.0.0.1:8080',
});
assert.throws(() => assertEmulatorOnlyPreviewTarget({
  projectId: 'golfriend-production',
  functionsHost: 'cloudfunctions.net:443',
  firestoreHost: 'firestore.googleapis.com:443',
}), /loopback emulator hosts/);

const targets: PreviewTarget[] = [
  { courseId: 'empty_course', existing: { latitude: 12, longitude: 100 } },
  { courseId: 'malformed_course', existing: { latitude: 13, longitude: 101 } },
  { courseId: 'ambiguous_course', existing: { latitude: 14, longitude: 102 } },
  { courseId: 'failed_course', existing: { latitude: 15, longitude: 103 } },
  { courseId: 'manual_course', existing: { latitude: 16, longitude: 104, manualLock: true } },
  { courseId: 'trusted_course', existing: { latitude: 17, longitude: 105, trusted: true } },
  { courseId: 'quarantined_course', existing: { latitude: 18, longitude: 106, requiresManualGPS: true } },
];

const outcomes = new Map<string, SyntheticProviderOutcome>([
  ['empty_course', { kind: 'response', course: null }],
  ['malformed_course', { kind: 'response', course: { courseID: 'malformed_course', latitude: 0, longitude: 0 } }],
  ['ambiguous_course', { kind: 'response', course: { courseID: 'different_course', latitude: 1, longitude: 1 } }],
  ['failed_course', { kind: 'failed', message: 'synthetic timeout' }],
  ['manual_course', { kind: 'response', course: { courseID: 'manual_course', latitude: 1, longitude: 1 } }],
  ['trusted_course', { kind: 'response', course: { courseID: 'trusted_course', latitude: 2, longitude: 2 } }],
  ['quarantined_course', { kind: 'response', course: { courseID: 'quarantined_course', latitude: 3, longitude: 3 } }],
]);

const result = runSyncCoursesFromProviderPreview('preview', targets, outcomes);
assert.equal(result.productionWrites, 0);
assert.deepEqual(result.results.map((row) => row.result), [
  'missing', 'conflict', 'conflict', 'error', 'skipped_manual', 'skipped_manual', 'skipped_manual',
]);
for (const row of result.results) {
  const original = targets.find((target) => target.courseId === row.courseId)!.existing;
  assert.deepEqual(row.before, { latitude: original.latitude, longitude: original.longitude });
}
for (const row of result.results.slice(0, 4)) assert.equal(row.after, undefined);
for (const row of result.results.slice(4)) assert.equal(row.after, undefined);
assert.throws(() => runSyncCoursesFromProviderPreview('apply' as 'preview', targets, outcomes), /preview mode only/);

console.log('synthetic-preview — not commissioning');
console.log(`  mode=${result.mode} processed=${result.processed} productionWrites=${result.productionWrites}`);
console.log('  empty=missing malformed=conflict ambiguous=conflict failed=error');
console.log('  manual=preserved trusted=preserved quarantined=preserved');
console.log('courseSyncPreview: 12 boundary assertions passed.');
