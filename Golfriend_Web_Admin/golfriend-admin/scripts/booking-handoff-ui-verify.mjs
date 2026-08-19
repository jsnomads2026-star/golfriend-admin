import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'public', 'BookingHandoff.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const locales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredKeys = [
  'title',
  'when',
  'seatsLeft',
  'signInTitle',
  'signInBody',
  'continueApp',
  'requestBtn',
  'requestBtnAria',
  'requesting',
  'booking_pending',
  'booking_cancelled',
  'cancelBtn',
  'cancelBtnAria',
  'cancelling',
  'messageTitle',
  'messagePlaceholder',
  'messageInputAria',
  'sendBtn',
  'sendBtnAria',
  'sending',
  'noMessages',
  'you',
  'course',
  'errorGeneric',
  'back',
  'backAria',
];

const marker = "const DICT: Record<Lang, Record<string, string>> = {";
const dictStart = source.indexOf(marker);
assert.ok(dictStart >= 0, 'DICT block missing');

const dictBlockStart = source.indexOf('{', dictStart);
let depth = 0;
let dictBlockEnd = -1;
for (let i = dictBlockStart; i < source.length; i += 1) {
  const ch = source[i];
  if (ch === '{') depth += 1;
  if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      dictBlockEnd = i;
      break;
    }
  }
}
assert.ok(dictBlockEnd > dictBlockStart, 'DICT block close missing');
const dictBlock = source.slice(dictBlockStart, dictBlockEnd + 1);

function blockFor(locale) {
  const startKey = `${locale}: {`;
  const start = dictBlock.indexOf(startKey);
  assert.ok(start >= 0, `locale block missing: ${locale}`);

  const afterStart = start + startKey.length;
  const nextStarts = locales
    .filter((l) => l !== locale)
    .map((l) => dictBlock.indexOf(`${l}: {`, afterStart))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b);

  const end = nextStarts.length ? nextStarts[0] : dictBlock.lastIndexOf('},\n};');
  return dictBlock.slice(start, end);
}

function valueInBlock(locale, key) {
  const block = blockFor(locale);
  const match = new RegExp(`\\b${key}\\s*:\\s*(['\"])(.*?)\\1`).exec(block);
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

for (const key of ['title', 'when', 'seatsLeft', 'signInTitle', 'signInBody', 'continueApp', 'requestBtn', 'requesting', 'booking_pending', 'booking_cancelled', 'cancelBtn', 'cancelling', 'messageTitle', 'messagePlaceholder', 'sendBtn', 'sending', 'noMessages', 'errorGeneric', 'back']) {
  assert.ok(source.includes(`t('${key}')`) || source.includes(`t(\"${key}\")`), `render must use t('${key}')`);
}

const nonEnglishTranslatedKeys = ['title', 'signInTitle', 'requestBtn', 'cancelBtn', 'messageTitle', 'sendBtn', 'continueApp'];
for (const locale of locales.filter((l) => l !== 'en')) {
  for (const key of nonEnglishTranslatedKeys) {
    assert.notEqual(
      valueInBlock(locale, key),
      valueInBlock('en', key),
      `${locale}.${key} should not duplicate English`
    );
  }
}

assert.ok(source.includes("aria-label={t('requestBtnAria')}") || source.includes('aria-label={t("requestBtnAria")}'), 'missing request button accessible label');
assert.ok(source.includes("aria-label={t('cancelBtnAria')}") || source.includes('aria-label={t("cancelBtnAria")}'), 'missing cancel button accessible label');
assert.ok(source.includes("aria-label={t('sendBtnAria')}") || source.includes('aria-label={t("sendBtnAria")}'), 'missing send button accessible label');
assert.ok(source.includes("aria-label={t('messageInputAria')}") || source.includes('aria-label={t("messageInputAria")}'), 'missing message input accessible label');
assert.ok(source.includes("aria-label={t('backAria')}") || source.includes('aria-label={t("backAria")}'), 'missing back button accessible label');

console.log('BookingHandoff locale verification PASS: SP-20 visibility and accessibility locale coverage verified for 8 locales.');
