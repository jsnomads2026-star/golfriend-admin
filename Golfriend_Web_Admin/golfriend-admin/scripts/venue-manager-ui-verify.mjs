import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'B2B', 'enterprise', 'VenueManager.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const locales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredKeys = [
  'title',
  'subtitle',
  'onboardHeader',
  'selectVenuePrompt',
  'onboardButton',
  'onboardButtonBusy',
  'onboardDescription',
  'loading',
  'empty',
  'retry',
  'retryAria',
  'noOnboarded',
  'operatedHeader',
  'totalLabel',
  'activeLabel',
  'idLabel',
  'notificationMissingVenue',
  'onboardSuccess',
  'onboardError',
  'onboardBusyStatus',
  'loadingError',
  'selectAria',
  'onboardAria',
  'retryStatusAria',
  'venueCardAria',
  'activeStatus',
  'emptyState',
  'statusBadge',
];

const marker = "const DICT: Record<Lang, Record<string, string>> = {";
const start = source.indexOf(marker);
assert.ok(start >= 0, 'DICT block missing');

const braceStart = source.indexOf('{', start);
let depth = 0;
let braceEnd = -1;
for (let i = braceStart; i < source.length; i += 1) {
  const ch = source[i];
  if (ch === '{') depth += 1;
  if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      braceEnd = i;
      break;
    }
  }
}
assert.ok(braceEnd > braceStart, 'DICT object close missing');
const dictBlock = source.slice(braceStart, braceEnd + 1);

function blockFor(locale) {
  const startKey = `${locale}: {`;
  const startIndex = dictBlock.indexOf(startKey);
  assert.ok(startIndex >= 0, `locale block missing: ${locale}`);
  const afterStart = startIndex + startKey.length;
  const nextStarts = locales
    .filter((l) => l !== locale)
    .map((l) => dictBlock.indexOf(`${l}: {`, afterStart))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);
  const endIndex = nextStarts.length ? nextStarts[0] : dictBlock.lastIndexOf('\n};');
  return dictBlock.slice(startIndex, endIndex);
}

function valueInBlock(locale, key) {
  const block = blockFor(locale);
  const match = new RegExp(`\\b${key}\\s*:\\s*([\"'])([\\s\\S]*?)\\1`).exec(block);
  assert.ok(match, `${locale}.${key} missing`);
  const value = match[2].trim();
  assert.ok(value.length > 0, `${locale}.${key} empty`);
  return value;
}

for (const locale of locales) {
  for (const key of requiredKeys) {
    valueInBlock(locale, key);
  }
}

for (const locale of locales.filter((l) => l !== 'en')) {
  for (const key of ['title', 'subtitle', 'onboardHeader', 'selectVenuePrompt', 'onboardButton', 'loading', 'empty', 'retry', 'operatedHeader']) {
    assert.notEqual(
      valueInBlock(locale, key),
      valueInBlock('en', key),
      `${locale}.${key} should be localized`
    );
  }
}

for (const phrase of [
  "t('title')",
  "t('subtitle')",
  "t('onboardHeader')",
  "t('selectVenuePrompt')",
  "t('onboardButton')",
  "t('onboardButtonBusy')",
  "t('onboardDescription')",
  "t('loading')",
  "t('empty')",
  "t('retry')",
  "t('emptyState')",
  "t('operatedHeader')",
  "t('totalLabel')",
  "t('activeLabel')",
  "t('idLabel')",
  "t('onboardAria')",
  "t('selectAria')",
  "t('retryAria')",
  "t('activeStatus')",
  "t('venueCardAria')",
  "t('onboardBusyStatus')",
]) {
  assert.ok(source.includes(phrase), `render must use ${phrase}`);
}

assert.ok(source.includes("role=\"status\""), 'status role missing for async list/state changes');
assert.ok(source.includes("role=\"alert\""), 'alert role missing for errors');
assert.ok(source.includes('onClick={loadVault}'), 'retry should call loadVault');
assert.ok(source.includes("aria-label={t('selectAria')}") && source.includes("aria-label={t('onboardAria')}"), 'accessible button/select labels missing');

console.log('VenueManager locale verification PASS: 8 locales and completion-focused visibility/accessibility checks passed.');
