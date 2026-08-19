import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'public', 'LandingPage.tsx');
const source = fs.readFileSync(componentPath, 'utf8');

const locales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredKeys = [
  'tagline',
  'subTagline',
  'appStoreBadge',
  'googlePlayBadge',
  'reliabilityTitle',
  'reliabilityBody',
  'freemiumTitle',
  'freemiumBody',
  'b2bTitle',
  'b2bBody',
  'partnerPlans',
];

function extractCopyBlock() {
  const marker = "const COPY: Record<Lang, {";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'COPY object missing');
  const objectStart = source.indexOf('= {', start);
  assert.ok(objectStart >= 0, 'COPY object open missing');
  const braceStart = source.indexOf('{', objectStart);
  assert.ok(braceStart >= 0, 'COPY brace open missing');

  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return source.slice(braceStart, end + 1);
}

const copyBlock = extractCopyBlock();

function quotedValue(block, key) {
  const valueMatch = new RegExp(`\\b${key}\\s*:\\s*([\\\"\\'])([\\s\\S]*?)\\1`, 'm').exec(block);
  assert.ok(valueMatch, `${key} missing`);
  return valueMatch[2].trim();
}

for (const locale of locales) {
  assert.match(copyBlock, new RegExp(`\\b${locale}\\s*:\\s*{`), `locale block missing: ${locale}`);
}

for (const locale of locales) {
  for (const key of requiredKeys) {
    const localeBlock = new RegExp(`\\b${locale}\\s*:\\s*{([\\s\\S]*?)\\n\\s*},`, 'm').exec(copyBlock)?.[1];
    assert.ok(localeBlock, `block missing for locale ${locale}`);
    const value = quotedValue(localeBlock, key);
    assert.ok(value.length > 0, `${locale}.${key} is empty`);
  }
}

for (const key of requiredKeys) {
  assert.match(source, new RegExp(`\\{t\\.${key}\\}`), `landing render missing copy key usage: ${key}`);
}

const renderLocales = source.includes("const t = useMemo(() => COPY[resolveLocale()], []);");
assert.ok(renderLocales, 'locale resolution/render source missing');
assert.ok(source.includes('aria-label={t.appStoreBadge}'), 'App Store badge missing accessible label');
assert.ok(source.includes('aria-label={t.googlePlayBadge}'), 'Google Play badge missing accessible label');

console.log('Landing page UI verification PASS: SP-16 locales and localized render keys verified.');
