import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const src = read('src/components/admin/v2/V2AdminOverview.tsx');

const failures = [];
const requiredLocales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
for (const locale of requiredLocales) {
  if (!new RegExp(`\\b${locale}:\\s*\{`).test(src)) {
    failures.push(`missing locale bucket ${locale}`);
  }
}

const requiredKeys = [
  'heroTitle',
  'heroLead',
  'boundaries',
  'authority',
  'authorityTitle',
  'authorityLead',
  'courseData',
  'courseDataTitle',
  'courseDataLead',
  'teeTimes',
  'teeTimesTitle',
  'teeTimesLead',
  'areas',
  'openArea',
  'areaIndexPrefix',
  'operations',
];
for (const key of requiredKeys) {
  if (!src.includes(`'${key}'`) && !src.includes(`"${key}"`)) {
    failures.push(`overview copy key missing usage: ${key}`);
  }
}

const requiredMarkup = [
  '<h2>{copy.heroTitle}</h2>',
  '<h2>{copy.boundaries}</h2>',
  '<section className="v2-admin-principles"',
  '<section className="v2-admin-area-grid"',
  'aria-label={copy.areas}',
  'aria-label={`',
  '{copy.openArea}',
  '<h2>{copy.areas}</h2>',
  'aria-hidden="true">↗</i>',
  'useAdminLocale',
];
for (const snippet of requiredMarkup) {
  if (!src.includes(snippet)) failures.push(`missing UI marker ${snippet}`);
}

if (/.addEventListener|location\.reload|window\.alert/.test(src)) {
  failures.push('unrelated behavior present in overview component');
}

if (failures.length) {
  console.error(`V2AdminOverview verifier FAILED (${failures.length})`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('V2AdminOverview verifier PASS: 8 locales, localized headings/descriptions, and accessible button labels.');
