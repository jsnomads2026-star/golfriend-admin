// L1 slice 3 gate: partner Course & Availability localized to all eight locales,
// Thai actually translated, no hard-coded English, authoritative callables intact.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { COURSE_AVAILABILITY } from '../../src/i18n/partner/courseAvailability.ts';

const raw = fs.readFileSync(fileURLToPath(new URL('../../src/components/B2B/CourseAvailability.tsx', import.meta.url)), 'utf8');

test('COURSE_AVAILABILITY covers all eight locales with all keys, non-empty', () => {
  const enKeys = Object.keys(COURSE_AVAILABILITY.en);
  for (const code of LOCALE_CODES) {
    assert.ok(COURSE_AVAILABILITY[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(COURSE_AVAILABILITY[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(COURSE_AVAILABILITY[code][k]).length > 0, `${code}.${k} empty`);
  }
});

test('interpolation placeholders are preserved in every locale', () => {
  for (const code of LOCALE_CODES) {
    assert.ok(COURSE_AVAILABILITY[code].onboardedMsg.includes('{name}'), `${code}.onboardedMsg missing {name}`);
    assert.ok(COURSE_AVAILABILITY[code].publishedMsg.includes('{date}'), `${code}.publishedMsg missing {date}`);
    assert.ok(COURSE_AVAILABILITY[code].publishedMsg.includes('{time}'), `${code}.publishedMsg missing {time}`);
  }
});

test('Thai is actually translated (differs from English)', () => {
  for (const k of Object.keys(COURSE_AVAILABILITY.en)) {
    assert.notEqual(COURSE_AVAILABILITY.th[k], COURSE_AVAILABILITY.en[k], `th.${k} not translated`);
  }
});

test('CourseAvailability routes copy through the provider (no hard-coded English)', () => {
  assert.match(raw, /useT\(\s*COURSE_AVAILABILITY\s*\)/, 'must use useT(COURSE_AVAILABILITY)');
  for (const literal of [
    'Course & Availability', 'Onboard a Course', 'Publish Availability',
    'Your Published Tee-Times', 'No tee-times published yet', 'Select a course to onboard',
  ]) {
    assert.ok(!raw.includes(literal), `hard-coded English "${literal}" still present`);
  }
});

test('authoritative course callables are preserved', () => {
  for (const callable of ['claimCourseOperator', 'manageTeeTimeSlot']) {
    assert.match(raw, new RegExp(callable), `callable ${callable} missing`);
  }
});
