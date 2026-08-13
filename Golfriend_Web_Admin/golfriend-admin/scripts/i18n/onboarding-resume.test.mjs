// L1 slice 5 gate: partner Onboarding hub localized to all eight locales, Thai
// translated, resumable (reads saved progress), read-only (no writes/callables),
// wired into the dashboard.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { ONBOARDING } from '../../src/i18n/partner/onboarding.ts';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const comp = read('components/B2B/PartnerOnboarding.tsx');
const compCode = stripComments(comp);
const dash = read('components/B2B/SmallBusinessDashboard.tsx');

test('ONBOARDING covers all eight locales with all keys, non-empty', () => {
  const enKeys = Object.keys(ONBOARDING.en);
  for (const code of LOCALE_CODES) {
    assert.ok(ONBOARDING[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(ONBOARDING[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(ONBOARDING[code][k]).length > 0, `${code}.${k} empty`);
  }
});

test('Thai is actually translated (differs from English)', () => {
  for (const k of Object.keys(ONBOARDING.en)) {
    assert.notEqual(ONBOARDING.th[k], ONBOARDING.en[k], `th.${k} not translated`);
  }
});

test('PartnerOnboarding is localized with no hard-coded English', () => {
  assert.match(compCode, /useT\(\s*ONBOARDING\s*\)/, 'must use useT(ONBOARDING)');
  for (const literal of ['Getting started', 'Onboard your course', 'Publish availability', 'Documents & consent']) {
    assert.ok(!compCode.includes(literal), `hard-coded English "${literal}" still present`);
  }
});

test('PartnerOnboarding is read-only (no authoritative writes or callables)', () => {
  for (const banned of ['httpsCallable', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'getFunctions']) {
    assert.ok(!compCode.includes(banned), `onboarding must not use ${banned}`);
  }
});

test('onboarding is resumable (reflects saved progress) and dashboard wires it', () => {
  assert.match(compCode, /localStorage\.getItem/, 'must read saved Documents draft for resume');
  assert.match(compCode, /getDocs/, 'must derive real progress from the partner scope');
  assert.match(dash, /<PartnerOnboarding\s+partnerUid=[^>]*onNavigate=/, 'dashboard must render PartnerOnboarding with onNavigate');
});
