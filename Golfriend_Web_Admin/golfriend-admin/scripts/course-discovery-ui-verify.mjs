import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'public', 'CourseDiscovery.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const locales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredKeys = [
  'heading',
  'sub',
  'language',
  'loading',
  'empty',
  'noSlots',
  'openTeeTimes',
  'book',
  'seatsLeft',
  'error',
  'back',
  'backAria',
  'courseCardAria',
  'requestSlotAria',
];

const marker = 'const DICT: Record<Lang, Record<string, string>> = {';
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

  const endIndex = nextStarts.length ? nextStarts[0] : dictBlock.lastIndexOf('},\n};');
  return dictBlock.slice(startIndex, endIndex);
}

function valueInBlock(locale, key) {
  const block = blockFor(locale);
  const match = new RegExp(`\\b${key}\\s*:\\s*([\\"'])(.*?)\\1`).exec(block);
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

const renderUsedKeys = [
  'heading',
  'sub',
  'language',
  'loading',
  'empty',
  'noSlots',
  'openTeeTimes',
  'book',
  'seatsLeft',
  'error',
  'back',
  'backAria',
  'courseCardAria',
  'requestSlotAria',
];
for (const key of renderUsedKeys) {
  assert.ok(source.includes(`t('${key}')`) || source.includes(`t(\"${key}\")`), `render must use t('${key}')`);
}

for (const locale of locales.filter((l) => l !== 'en')) {
  const compareKeys = ['heading', 'sub', 'loading', 'empty', 'error', 'openTeeTimes'];
  for (const key of compareKeys) {
    assert.notEqual(
      valueInBlock(locale, key),
      valueInBlock('en', key),
      `${locale}.${key} should not copy English`
    );
  }
}

assert.ok(source.includes("aria-label={t('language')}") || source.includes("aria-label={`${t('language')}"), 'language accessibility text missing');
assert.ok(source.includes("aria-label={t('backAria')}") || source.includes("aria-label={`${t('backAria')}"), 'back accessibility label missing');
assert.ok(source.includes("aria-label={`${t('courseCardAria')}"), 'course card accessible label missing');
assert.ok(source.includes("aria-label={`${t('requestSlotAria')}"), 'slot request accessible label missing');

console.log('CourseDiscovery locale verification PASS: 8 locales and localized copy keys verified.');
