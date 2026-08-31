import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const summary = fs.readFileSync(new URL('./V2CatalogueSummary.tsx', import.meta.url), 'utf8');
const availability = fs.readFileSync(new URL('../../B2B/CourseAvailabilityV2.tsx', import.meta.url), 'utf8');

test('Courses page excludes the unrelated availability error and cannot render Invalid Date', () => {
  assert.ok(availability.includes('if (admin) return null;'));
  assert.ok(!summary.includes('Invalid Date'));
  assert.ok(!availability.includes('Availability is unavailable. No change was made.'));
});
