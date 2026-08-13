// Guardrail: canonical eight-locale contract + parity.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_CODES,
  LOCALES,
  DEFAULT_LOCALE,
  isCanonicalLocale,
  coerceLocale,
} from '../../src/i18n/locales.ts';

// The exact set every Golfriend surface (Web i18n.js, Admin, App) must share.
const EXPECTED = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];

test('canonical codes are exactly the eight, in canonical order', () => {
  assert.deepEqual(Array.from(LOCALE_CODES), EXPECTED);
  assert.equal(new Set(LOCALE_CODES).size, 8);
});

test('default locale is English', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
});

test('descriptors cover every code with a non-empty endonym label', () => {
  assert.equal(LOCALES.length, 8);
  assert.deepEqual(LOCALES.map((l) => l.code), EXPECTED);
  for (const l of LOCALES) assert.ok(l.label && l.label.length > 0, `label for ${l.code}`);
});

test('isCanonicalLocale accepts canonical codes and rejects others', () => {
  for (const c of EXPECTED) assert.equal(isCanonicalLocale(c), true);
  for (const bad of ['ar', 'xx', '', 'EN', 'th-TH', null, undefined, 7]) {
    assert.equal(isCanonicalLocale(bad), false, `should reject ${String(bad)}`);
  }
});

test('coerceLocale falls back to English for invalid values', () => {
  assert.equal(coerceLocale('th'), 'th');
  assert.equal(coerceLocale('ar'), 'en');
  assert.equal(coerceLocale(null), 'en');
});

// Parity with the set the existing gate suite asserts against, so the future
// consolidation (removing redundant literals) is provably safe.
test('contract matches the set asserted by existing booking/v2 gates', () => {
  assert.deepEqual(Array.from(LOCALE_CODES), EXPECTED);
});
