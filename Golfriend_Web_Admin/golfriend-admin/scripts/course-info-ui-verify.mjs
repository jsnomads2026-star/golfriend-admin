import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'public', 'CourseInfo.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const locales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredKeys = [
  'courseInfo',
  'club',
  'location',
  'address',
  'holes',
  'coordinates',
  'language',
  'notProvided',
  'viewTeeTimes',
  'viewTeeTimesAria',
  'holesUnit',
  'loading',
  'empty',
  'error',
  'retry',
  'sectionLabel',
  'titleUnknown',
];

const requiredRenderKeys = [
  'loading',
  'empty',
  'error',
  'retry',
  'language',
  'viewTeeTimes',
  'viewTeeTimesAria',
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
assert.ok(braceEnd > braceStart, 'DICT block close missing');
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

function keyHasValue(locale, key) {
  const block = blockFor(locale);
  const match = new RegExp(`\\b${key}\\s*:\\s*[\"']([^\"']+)[\"']`).exec(block);
  assert.ok(match, `${locale}.${key} missing`);
  const value = match[1].trim();
  assert.ok(value.length > 0, `${locale}.${key} empty`);
  return value;
}

for (const locale of locales) {
  for (const key of requiredKeys) {
    keyHasValue(locale, key);
  }
}

for (const locale of locales.filter((l) => l !== 'en')) {
  const compareKeys = ['courseInfo', 'loading', 'empty', 'error', 'retry', 'viewTeeTimes', 'viewTeeTimesAria'];
  for (const key of compareKeys) {
    assert.notEqual(
      keyHasValue(locale, key),
      keyHasValue('en', key),
      `${locale}.${key} should be localized`
    );
  }
}

for (const key of requiredRenderKeys) {
  assert.ok(
    source.includes(`t('${key}')`) || source.includes(`t(\"${key}\")`),
    `render must use t('${key}')`
  );
}

assert.ok(
  source.includes("role=\"status\"") || source.includes("role=\"alert\""),
  'loading/empty/error a11y states missing'
);
assert.ok(source.includes("aria-label={t('language')}") || source.includes('aria-label={`${t(\'language\')'), 'language group aria label missing');
assert.ok(source.includes("aria-label={t('retry')}") || source.includes("aria-label={`${t('retry')}"), 'retry button aria label missing');
assert.ok(source.includes("aria-label={t('viewTeeTimesAria')}"), 'view tee-times aria label missing');
assert.ok(source.includes("status?: 'loading'"), 'status prop should support loading state');
assert.ok(source.includes('onRetry?: () => void'), 'onRetry prop should support error recovery action');

console.log('CourseInfo locale verification PASS: 8 locales and visible copy/local states verified.');
