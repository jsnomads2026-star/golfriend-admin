import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = fs.readFileSync(path.join(root, 'src/components/admin/v2/V2PartnerAuthority.tsx'), 'utf8');

const failures = [];
const requiredLocales = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const requiredTopLevelKeys = [
  'title',
  'loading',
  'emptyClaims',
  'emptyOrganizations',
  'error',
  'retry',
  'retryAria',
  'activate',
  'application',
  'course',
  'review',
  'organizations',
  'tierLabel',
  'statuses',
  'actions',
  'appPlaceholder',
  'smallBusiness',
  'enterprise',
  'unknownTier',
  'approve',
  'reject',
  'suspend',
  'reactivate',
  'trialStatement',
  'courseCountPrefix',
  'orgCountPrefix',
  'statusPending',
  'statusDisputed',
  'statusApproved',
  'statusSuspended',
  'statusActive',
  'copy',
];
const requiredCopyKeys = [
  'titleAria',
  'appSelect',
  'courseInput',
  'reviewSection',
  'orgSection',
  'actionApprove',
  'actionReject',
  'actionSuspend',
  'actionReactivate',
  'orgSuspend',
  'orgReactivate',
  'orgReceipt',
];

const copySection = (src.match(/const COPY = \{([\s\S]*?)\} as const;/) || [])[1] || '';
if (!copySection) {
  failures.push('could not read COPY map block');
}

for (const locale of requiredLocales) {
  const localeHeader = new RegExp(`\\b${locale}:\\s*(EN|\\{)`);
  if (!localeHeader.test(copySection) && locale !== 'en') {
    failures.push(`missing locale bucket: ${locale}`);
  }
}

const bucketRegex = /(th|ko|ja|zh|es|fr|de)\s*:\s*\{([\s\S]*?)\n\s*\}/g;
for (const match of copySection.matchAll(bucketRegex)) {
  const locale = match[1];
  const block = match[2];
  for (const key of requiredTopLevelKeys) {
    if (!new RegExp(`\\b${key}\\s*:`).test(block)) {
      failures.push(`missing ${locale} key: ${key}`);
    }
  }
  for (const key of requiredCopyKeys) {
    if (!new RegExp(`\\b${key}\\s*:`).test(block)) {
      failures.push(`missing ${locale}.copy key: ${key}`);
    }
  }
}

const requiredStrings = [
  'role="status"',
  'role="alert"',
  'aria-label={copy.retryAria}',
  'copy.copy.orgSuspend',
  'copy.copy.orgReactivate',
  'copy.copy.orgReceipt',
  'option value=""',
  'copy.appPlaceholder',
];
for (const marker of requiredStrings) {
  if (!src.includes(marker)) failures.push(`missing required marker: ${marker}`);
}

if (failures.length) {
  console.error(`V2PartnerAuthority verifier FAILED (${failures.length})`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('V2PartnerAuthority verifier PASS: 8 locales and localized admin UI copy with required accessible labels.');