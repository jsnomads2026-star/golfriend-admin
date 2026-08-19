import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const componentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'admin', 'v2', 'V2PartnerApplications.tsx');
const source = fs.readFileSync(componentPath, 'utf8');
const LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];

const requiredKeys = [
  'title', 'lead', 'loading', 'empty', 'error', 'retry', 'note', 'reply', 'send', 'start', 'info', 'approve', 'reject',
  'audit', 'boundary', 'documents', 'documentReason', 'verify', 'decline', 'alternative', 'reasonRequired', 'checklist',
  'checklistSatisfied', 'checklistMissing', 'contract', 'contractLead', 'scope', 'scopeCourse', 'scopeService', 'effectiveFrom',
  'commission', 'legalComplete', 'legalReference', 'legalPending', 'approveContract', 'contractRecorded', 'noContract',
  'agreement', 'agreementNone'
];

const requiredStatusKeys = ['submitted', 'under_review', 'info_needed', 'approved', 'rejected'];

function extractBlock(startIndex) {
  let depth = 0;
  let end = startIndex;
  for (let i = startIndex; i < source.length; i += 1) {
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
  return {start: startIndex + 1, end, block: source.slice(startIndex + 1, end)};
}

function localeBlock(locale) {
  if (locale === 'en') {
    const enStart = source.indexOf('const EN = {');
    assert.ok(enStart >= 0, 'EN dictionary missing');
    return extractBlock(source.indexOf('{', enStart)).block;
  }

  const marker = new RegExp(`\\n\\s*${locale}:\\s*\\{`, 'm');
  const match = marker.exec(source);
  assert.ok(match, `${locale} locale block missing`);
  const blockStart = source.indexOf('{', match.index);
  assert.ok(blockStart >= 0, `${locale} locale block malformed`);
  return extractBlock(blockStart).block;
}

function quotedValue(block, key) {
  const valueMatch = new RegExp(`\\b${key}\\s*:\\s*([\\"\\'])([\\s\\S]*?)\\1`).exec(block);
  assert.ok(valueMatch, `missing ${key} value`);
  return valueMatch[2].replace(/^\\s+|\\s+$/g, '');
}

for (const locale of LOCALES) {
  const b = localeBlock(locale);
  assert.doesNotMatch(b, /\.{3}EN/, `${locale} uses inherited English spread`);

  for (const key of requiredKeys) {
    const keyMatch = new RegExp(`\\b${key}\\s*:`).exec(b);
    assert.ok(keyMatch, `${locale}.${key} missing`);
    const value = quotedValue(b, key);
    if (locale !== 'en') {
      const enValue = quotedValue(localeBlock('en'), key);
      assert.notEqual(value, enValue, `${locale}.${key} duplicates English`);
    }
  }
}

const statusStart = source.indexOf('const APPLICATION_STATUS:');
assert.ok(statusStart >= 0, 'APPLICATION_STATUS declaration missing');
const statusOpen = source.indexOf('{', statusStart);
assert.ok(statusOpen >= 0, 'APPLICATION_STATUS object open missing');
const statusBlock = extractBlock(statusOpen).block;
const statusEnStart = source.indexOf('const STATUS_EN');
assert.ok(statusEnStart >= 0, 'STATUS_EN declaration missing');
const statusEnOpen = source.indexOf('{', statusEnStart);
assert.ok(statusEnOpen >= 0, 'STATUS_EN object open missing');
const statusEnBlock = extractBlock(statusEnOpen).block;

for (const locale of LOCALES) {
  if (locale === 'en') {
    assert.match(statusEnBlock, new RegExp(`\\bsubmitted\\s*:\\s*([\\"\\'])`), 'en status key missing');
  } else {
    assert.match(statusBlock, new RegExp(`\\b${locale}\\s*:\\s*\\{`), `${locale} status locale missing`);
  }
}
for (const key of requiredStatusKeys) {
  assert.match(statusEnBlock, new RegExp(`\\b${key}\\s*:\\s*([\\"\\'])`), `en status key missing: ${key}`);
}
for (const locale of LOCALES.filter((locale) => locale !== 'en')) {
  const block = new RegExp(`\\b${locale}\\s*:\\s*\\{([\\s\\S]*?)\\}`, 'm').exec(statusBlock)?.[1] ?? '';
  for (const key of requiredStatusKeys) {
    assert.match(block, new RegExp(`\\b${key}\\s*:\\s*([\\"\\'])`), `${locale} status key missing: ${key}`);
  }
}

assert.match(source, /const applicationStatusLabel = \(status: string\)/, 'status label helper missing');
assert.match(source, /\{copy\.retry\}/, 'retry action is not rendered');
assert.match(source, /\{applicationStatusLabel\(item\.status\)\}/, 'list item status not localized');
assert.match(source, /\{applicationStatusLabel\(application\.status\)\}/, 'detail status not localized');

console.log('Partner applications UI verification PASS: SP-14 locale completeness and status/error states verified.');
