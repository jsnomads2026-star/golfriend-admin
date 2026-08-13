// Admin partner-application ingestion gate (slice 1a): 8-locale INGESTION dict,
// Thai translated; PartnerIngestion uses the staff-gated callables; App wires it;
// approval never assigns partner status (handoff only).
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { INGESTION } from '../../src/i18n/admin/ingestion.ts';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');
const comp = src('components/admin/PartnerIngestion.tsx');
const app = src('App.tsx');

test('INGESTION covers all eight locales, non-empty, Thai translated', () => {
  const enKeys = Object.keys(INGESTION.en);
  for (const code of LOCALE_CODES) {
    assert.ok(INGESTION[code], `missing locale ${code}`);
    assert.deepEqual(Object.keys(INGESTION[code]), enKeys, `key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(INGESTION[code][k]).length > 0, `${code}.${k} empty`);
  }
  for (const k of Object.keys(INGESTION.en)) assert.notEqual(INGESTION.th[k], INGESTION.en[k], `th.${k} not translated`);
});

test('PartnerIngestion is localized and uses the staff-gated callables', () => {
  assert.match(comp, /useT\(\s*INGESTION\s*\)/, 'must use useT(INGESTION)');
  assert.match(comp, /listPartnerSubmissions/, 'must list via listPartnerSubmissions');
  assert.match(comp, /reviewPartnerSubmission/, 'must review via reviewPartnerSubmission');
  for (const banned of ['addDoc', 'setDoc', 'updateDoc', 'deleteDoc']) {
    assert.ok(!comp.includes(banned), `ingestion must not perform client write ${banned}`);
  }
});

test('App wires the ingestion queue into the partners area', () => {
  assert.match(app, /activeArea === 'partners' && <PartnerIngestion/, 'App must render PartnerIngestion in partners area');
  // gate substring for partner-operations-verify must remain intact
  assert.match(app, /activeArea === 'partners' && <V2PartnerOperations/, 'V2PartnerOperations wiring must remain');
});
