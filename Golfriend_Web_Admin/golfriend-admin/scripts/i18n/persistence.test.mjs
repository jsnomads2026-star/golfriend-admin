// Guardrail: persisted Admin language selection + cross-surface handoff resolution.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  HANDOFF_COOKIE,
  readStoredLocale,
  writeStoredLocale,
  readHandoffParam,
  readHandoffCookie,
  resolveInitialLocale,
} from '../../src/i18n/core.ts';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

test('writes and reads back a persisted choice under the Admin key', () => {
  const s = makeStorage();
  writeStoredLocale('th', s);
  assert.equal(s.map.get(STORAGE_KEY), 'th');
  assert.equal(readStoredLocale(s), 'th');
});

test('rejects an invalid persisted value', () => {
  assert.equal(readStoredLocale(makeStorage({ [STORAGE_KEY]: 'ar' })), null);
  assert.equal(readStoredLocale(makeStorage({ [STORAGE_KEY]: 'xx' })), null);
  assert.equal(readStoredLocale(makeStorage()), null);
});

test('parses a valid handoff param and rejects an invalid one', () => {
  assert.equal(readHandoffParam('?lang=th'), 'th');
  assert.equal(readHandoffParam('?foo=1&lang=de'), 'de');
  assert.equal(readHandoffParam('?lang=ar'), null);
  assert.equal(readHandoffParam(''), null);
});

test('reads a valid handoff cookie and rejects an invalid one', () => {
  assert.equal(readHandoffCookie(`${HANDOFF_COOKIE}=ko`), 'ko');
  assert.equal(readHandoffCookie(`x=1; ${HANDOFF_COOKIE}=ja; y=2`), 'ja');
  assert.equal(readHandoffCookie(`${HANDOFF_COOKIE}=ar`), null);
  assert.equal(readHandoffCookie('other=1'), null);
});

test('resolves initial locale by precedence: param > stored > cookie > navigator > default', () => {
  assert.equal(resolveInitialLocale({ param: 'th', stored: 'de', cookie: 'ko', navigator: 'ja' }), 'th');
  assert.equal(resolveInitialLocale({ stored: 'de', cookie: 'ko', navigator: 'ja' }), 'de');
  assert.equal(resolveInitialLocale({ cookie: 'ko', navigator: 'ja-JP' }), 'ko');
  assert.equal(resolveInitialLocale({ navigator: 'ja-JP' }), 'ja');
  assert.equal(resolveInitialLocale({ navigator: 'pt-BR' }), 'en');
  assert.equal(resolveInitialLocale({}), 'en');
  // invalid values are skipped, not leaked
  assert.equal(resolveInitialLocale({ param: 'ar', stored: 'th' }), 'th');
});
