import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/i18n/partner/applicant.ts', import.meta.url), 'utf8');
const LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const KEYS = [
  'smallBusiness', 'enterprise', 'notAuthority', 'signInRequired', 'verifyRequired',
  'loading', 'error', 'offline', 'ready', 'submitted', 'informationNeeded', 'rejected',
  'suspended', 'approved', 'enterPortal', 'legalPending', 'documents', 'agreement',
  'review', 'status', 'unknown', 'invitation',
];

/** Slice each locale object out of the source so values can be compared per locale. */
function localeBlocks() {
  const blocks = {};
  for (const locale of LOCALES) {
    const start = src.indexOf(`\n  ${locale}: {`);
    assert.notEqual(start, -1, `locale block ${locale} missing`);
    const end = src.indexOf('\n  },', start);
    assert.notEqual(end, -1, `locale block ${locale} unterminated`);
    blocks[locale] = src.slice(start, end);
  }
  return blocks;
}

test('exactly the canonical eight locales are declared, in contract order', () => {
  const declared = [...src.matchAll(/^ {2}([a-z]{2}): \{$/gm)].map(m => m[1]);
  assert.deepEqual(declared, LOCALES);
  // The set must come from the canonical source rather than be re-declared here — that is what
  // scripts/i18n/no-duplicate-locale-literals.test.mjs enforces repo-wide, and asserting the
  // literal here put the two gates in direct conflict. The copy blocks checked above still
  // prove exactly the eight locales, in contract order.
  assert.match(src, /APPLICANT_LOCALES = LOCALE_CODES;/);
  assert.match(src, /from '\.\.\/locales/);
});

test('every applicant key exists and is non-empty in all eight locales', () => {
  const blocks = localeBlocks();
  for (const locale of LOCALES) {
    for (const key of KEYS) {
      const match = new RegExp(`${key}: (['"])((?:(?!\\1).)*)\\1`).exec(blocks[locale]);
      assert.ok(match, `${locale}.${key} missing`);
      assert.ok(match[2].trim().length > 0, `${locale}.${key} blank`);
    }
  }
});

test('non-English locales are real translations, not English copies', () => {
  const blocks = localeBlocks();
  // The boundary sentence is the one that must never be mistranslated or copied.
  const boundary = locale => /notAuthority: (['"])((?:(?!\1).)*)\1/.exec(blocks[locale])[2];
  const all = LOCALES.map(boundary);
  assert.equal(new Set(all).size, 8, 'every locale must carry its own boundary wording');
  for (const locale of LOCALES.filter(l => l !== 'en')) {
    assert.notEqual(boundary(locale), boundary('en'), `${locale} duplicates English`);
  }
});

test('the boundary wording never implies account creation, approval or a started trial', () => {
  const blocks = localeBlocks();
  // English is the reviewable one; the others are asserted structurally above.
  const en = /notAuthority: (['"])((?:(?!\1).)*)\1/.exec(blocks.en)[2];
  assert.match(en, /does not create an account/i);
  assert.match(en, /grant Portal access/i);
  assert.match(en, /approve you/i);
  assert.match(en, /start a trial/i);
  // And the legal position stays honest in every locale.
  for (const locale of LOCALES) assert.match(blocks[locale], /legalPending: /);
});

test('an unsupported locale falls back to English rather than rendering a key', () => {
  assert.match(src, /APPLICANT_LOCALES as readonly string\[\]\)\.includes\(locale\)/);
  assert.match(src, /: 'en'\]/);
});
