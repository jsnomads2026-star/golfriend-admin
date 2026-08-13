// Guardrail: English-fallback translation behavior.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../../src/i18n/core.ts';

const dict = {
  en: { greeting: 'Hello', only_en: 'English only', filled: 'Filled EN', bothblank: '' },
  th: { greeting: 'สวัสดี', filled: '', bothblank: '' },
};

test('returns the value in the requested locale when present', () => {
  assert.equal(translate(dict, 'th', 'greeting'), 'สวัสดี');
  assert.equal(translate(dict, 'en', 'greeting'), 'Hello');
});

test('falls back to English when the key is missing in the locale', () => {
  assert.equal(translate(dict, 'th', 'only_en'), 'English only');
});

test('falls back to English when the locale value is blank', () => {
  assert.equal(translate(dict, 'th', 'filled'), 'Filled EN');
});

test('blank in both locale and English returns the key (never blank)', () => {
  assert.equal(translate(dict, 'th', 'bothblank'), 'bothblank');
});

test('unknown locale resolves through English', () => {
  assert.equal(translate(dict, 'ar', 'greeting'), 'Hello');
  assert.equal(translate(dict, 'zz', 'only_en'), 'English only');
});

test('missing key in both locale and English returns the key (never blank)', () => {
  assert.equal(translate(dict, 'th', 'nope'), 'nope');
  assert.equal(translate(dict, 'en', 'nope'), 'nope');
});
