// L1 slice 1 gate: partner sign-in localized to all eight locales, Thai actually
// translated, and no hard-coded English left in the sign-in surfaces.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { SIGN_IN } from '../../src/i18n/partner/signIn.ts';
import { ACCESS_STATES } from '../../src/i18n/partner/accessStates.ts';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');

function assertDictParity(name, dict) {
  const enKeys = Object.keys(dict.en);
  for (const code of LOCALE_CODES) {
    assert.ok(dict[code], `${name}: missing locale ${code}`);
    for (const key of enKeys) {
      const v = dict[code][key];
      assert.ok(v != null && String(v).length > 0, `${name}.${code}.${key} empty`);
    }
    assert.deepEqual(Object.keys(dict[code]), enKeys, `${name}.${code} key set mismatch`);
  }
}

test('SIGN_IN covers all eight locales with all keys, non-empty', () => {
  assertDictParity('SIGN_IN', SIGN_IN);
});

test('ACCESS_STATES covers all eight locales with all keys, non-empty', () => {
  assertDictParity('ACCESS_STATES', ACCESS_STATES);
});

test('Thai is actually translated (differs from English) for sign-in surfaces', () => {
  for (const key of Object.keys(SIGN_IN.en)) {
    assert.notEqual(SIGN_IN.th[key], SIGN_IN.en[key], `SIGN_IN.th.${key} not translated`);
  }
  for (const key of Object.keys(ACCESS_STATES.en)) {
    assert.notEqual(ACCESS_STATES.th[key], ACCESS_STATES.en[key], `ACCESS_STATES.th.${key} not translated`);
  }
});

test('B2BStorefront routes copy through the provider (no hard-coded English login labels)', () => {
  const s = src('components/public/B2BStorefront.tsx');
  assert.match(s, /useT\(\s*SIGN_IN\s*\)/, 'B2BStorefront must use useT(SIGN_IN)');
  for (const literal of ['Partner login', 'Business email', 'Existing partner', 'Back to Golfriend', 'Golfriend Partner Portal']) {
    assert.ok(!s.includes(literal), `hard-coded English "${literal}" still present in B2BStorefront`);
  }
  // The non-financial precommission marker must be preserved (storefront gate).
  assert.match(s, /data-policy-unavailable="non-financial-precommission"/);
});

test('App.tsx routes access-state copy through the provider', () => {
  const s = src('App.tsx');
  assert.match(s, /ACCESS_STATES/, 'App.tsx must import ACCESS_STATES');
  assert.match(s, /t\(access\.state\)/, 'App.tsx must localize the access-state title');
});
