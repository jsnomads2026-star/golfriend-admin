// Admin Marketing organized-sections gate: 8-locale MARKETING dict (Thai
// translated), MarketingSections is localized + read-only (no writes, no
// publish claims), and V2MarketingLibrary mounts it.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { MARKETING } from '../../src/i18n/admin/marketing.ts';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');
const comp = read('components/admin/v2/MarketingSections.tsx');
const lib = read('components/admin/v2/V2MarketingLibrary.tsx');

test('MARKETING covers all eight locales, non-empty, Thai translated', () => {
  const enKeys = Object.keys(MARKETING.en);
  for (const code of LOCALE_CODES) {
    assert.ok(MARKETING[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(MARKETING[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(MARKETING[code][k]).length > 0, `${code}.${k} empty`);
  }
  for (const k of Object.keys(MARKETING.en)) assert.notEqual(MARKETING.th[k], MARKETING.en[k], `th.${k} not translated`);
});

test('MarketingSections is localized, read-only, and makes no publish claim', () => {
  assert.match(comp, /useT\(\s*MARKETING\s*\)/, 'must use useT(MARKETING)');
  for (const banned of ['httpsCallable', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'uploadBytes', 'getFunctions']) {
    assert.ok(!comp.includes(banned), `MarketingSections must not use ${banned}`);
  }
  for (const claim of [/published/i, /production approved/i, /campaign deployed/i]) {
    assert.doesNotMatch(comp, claim, `must not claim ${claim}`);
  }
});

test('V2MarketingLibrary mounts the organized sections (marketing area preserved)', () => {
  assert.match(lib, /<MarketingSections\s+assets=/, 'must render <MarketingSections assets=…');
  // gate-locked strings must remain intact
  assert.match(lib, /Preview unavailable/);
  assert.match(lib, /Admin upload coming after storage approval/);
  assert.match(lib, /No production inventory is asserted/);
});
