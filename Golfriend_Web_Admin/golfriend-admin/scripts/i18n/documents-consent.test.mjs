// L1 slice 4 gate: partner Documents & Consent localized to all eight locales,
// Thai translated, client-side only (NO authoritative writes / callables), honest
// submission-unavailable state, resumable local draft, wired into the dashboard.
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { DOCUMENTS } from '../../src/i18n/partner/documents.ts';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');
// Strip comments so hard-coded-English checks look at real code, not prose.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const comp = src('components/B2B/PartnerDocuments.tsx');
const compCode = stripComments(comp);
const dash = src('components/B2B/SmallBusinessDashboard.tsx');

test('DOCUMENTS covers all eight locales with all keys, non-empty', () => {
  const enKeys = Object.keys(DOCUMENTS.en);
  for (const code of LOCALE_CODES) {
    assert.ok(DOCUMENTS[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(DOCUMENTS[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(DOCUMENTS[code][k]).length > 0, `${code}.${k} empty`);
  }
});

test('Thai is actually translated (differs from English)', () => {
  for (const k of Object.keys(DOCUMENTS.en)) {
    assert.notEqual(DOCUMENTS.th[k], DOCUMENTS.en[k], `th.${k} not translated`);
  }
});

test('PartnerDocuments is localized and has no hard-coded English', () => {
  assert.match(compCode, /useT\(\s*DOCUMENTS\s*\)/, 'must use useT(DOCUMENTS)');
  for (const literal of ['Documents & Consent', 'Verification documents', 'Choose files', 'Submit for verification']) {
    assert.ok(!compCode.includes(literal), `hard-coded English "${literal}" still present`);
  }
});

test('PartnerDocuments performs NO authoritative writes or callables (client-only)', () => {
  for (const banned of ['httpsCallable', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'uploadBytes', 'getFunctions']) {
    assert.ok(!compCode.includes(banned), `PartnerDocuments must not use ${banned}`);
  }
});

test('submission is honestly unavailable (no fabricated success) and draft is resumable', () => {
  assert.match(comp, /submitUnavailable/, 'must surface the honest unavailable state');
  assert.match(comp, /localStorage\.setItem/, 'must save a resumable draft');
  assert.match(comp, /localStorage\.getItem/, 'must restore a saved draft');
  for (const fake of ['submitted successfully', 'Submission received', 'Verification complete']) {
    assert.ok(!comp.includes(fake), `must not fabricate "${fake}"`);
  }
});

test('consent original text is recorded (preserve-original)', () => {
  assert.match(comp, /consentText/, 'draft must record the consent text shown');
  assert.match(comp, /consentLocale/, 'draft must record the consent locale');
});

test('dashboard renders the Documents tab', () => {
  assert.match(dash, /<PartnerDocuments\s+partnerUid=/, 'SmallBusinessDashboard must render PartnerDocuments');
});
