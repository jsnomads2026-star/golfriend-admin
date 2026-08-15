// Partner intake gate (slice 1a/2a — supersedes the L1.4 client-only draft).
// PartnerDocuments now submits a real application via the submitPartnerApplication
// callable (metadata + checklist + consent + attestation), tracks status, and
// keeps an HONEST "file upload not yet available" state (no Storage/binary yet).
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../../src/i18n/locales.ts';
import { DOCUMENTS } from '../../src/i18n/partner/documents.ts';
import { INTAKE } from '../../src/i18n/partner/intake.ts';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL('../../src/' + rel, import.meta.url)), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const compCode = stripComments(src('components/B2B/PartnerDocuments.tsx'));
const dash = src('components/B2B/SmallBusinessDashboard.tsx');

function parity(name, dict) {
  const enKeys = Object.keys(dict.en);
  for (const code of LOCALE_CODES) {
    assert.ok(dict[code], `${name}: missing locale ${code}`);
    assert.deepEqual(Object.keys(dict[code]), enKeys, `${name}: key set mismatch for ${code}`);
    for (const k of enKeys) assert.ok(String(dict[code][k]).length > 0, `${name}.${code}.${k} empty`);
  }
  for (const k of enKeys) assert.notEqual(dict.th[k], dict.en[k], `${name}.th.${k} not translated`);
}

test('DOCUMENTS + INTAKE cover all eight locales with Thai translated', () => {
  parity('DOCUMENTS', DOCUMENTS);
  parity('INTAKE', INTAKE);
});

test('PartnerDocuments uses the canonical localized Portal copy', () => {
  assert.match(compCode, /SMALL_BUSINESS_COPY\[useLocale\(\)\]/);
  for (const literal of ['Document checklist', 'Submit application', 'Attestation', 'File upload not yet available']) {
    assert.ok(!compCode.includes(literal), `hard-coded English "${literal}" still present`);
  }
});

test('documents are read-only server projection with no client writes', () => {
  assert.match(compCode, /resolvePartnerPortalMount\(projection\)/);
  for (const banned of ['addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'uploadBytes']) {
    assert.ok(!compCode.includes(banned), `PartnerDocuments must not perform client write ${banned}`);
  }
});

test('missing evidence stays honestly unavailable with no fabricated success', () => {
  assert.match(compCode, /role="status"/);
  for (const fake of ['uploaded successfully', 'Verification complete', 'files uploaded']) {
    assert.ok(!compCode.includes(fake), `must not fabricate "${fake}"`);
  }
});

test('canonical dashboard mounts the privacy-safe document projection', () => {
  assert.match(dash, /<PartnerDocuments\s+projection=\{data\}/, 'dashboard must render server-projected PartnerDocuments');
  assert.doesNotMatch(compCode, /partnerUid|firebase\/firestore|httpsCallable|localStorage/, 'documents must not accept client identity or bypass the Portal projection');
});
