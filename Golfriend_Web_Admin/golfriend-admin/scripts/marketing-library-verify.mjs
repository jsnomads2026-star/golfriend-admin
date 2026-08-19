import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  filterMarketingAssets,
  localeCoverageComplete,
  MARKETING_CATEGORIES,
  MARKETING_LOCALES,
  MARKETING_STATUSES,
  marketingSummary,
  normalizeMarketingAsset,
} from '../src/components/admin/v2/marketingLibraryModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const runtime = read('../functions/src/marketingAssetRuntime.ts');
const domain = read('../functions/src/marketingAssetDomain.ts');
const provider = read('../src/components/admin/v2/marketingLibraryProvider.ts');
const ui = read('../src/components/admin/v2/V2MarketingLibrary.tsx');
const app = read('../src/App.tsx');
const firestore = read('../marketing.firestore.rules');
const storage = read('../marketing.storage.rules');

assert.deepEqual(MARKETING_LOCALES, ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']);
assert.deepEqual(MARKETING_STATUSES, ['draft', 'review', 'approved', 'archived']);
assert.deepEqual(MARKETING_CATEGORIES, [
  'app_screenshot',
  'app_store_asset',
  'course_letter',
  'partner_letter',
  'website_image',
  'website_copy',
  'just_golfriend_campaign',
  'logo',
  'advertising',
  'oem_asset',
]);

const assets = [
  normalizeMarketingAsset({
    assetId: 'a',
    title: 'Lounge',
    category: 'app_screenshot',
    page: 'lounge',
    locales: ['en', 'th'],
    state: 'review',
    currentVersionId: 'v1',
    versionCount: 1,
  }),
  normalizeMarketingAsset({
    assetId: 'b',
    title: 'Campaign',
    category: 'just_golfriend_campaign',
    page: 'campaign',
    locales: ['fr'],
    state: 'draft',
  }),
];

assert.equal(marketingSummary(assets).byStatus.review, 1);
assert.deepEqual(
  filterMarketingAssets(assets, { query: 'lounge', category: 'app_screenshot', status: 'review', locale: 'th' }).map((x) => x.id),
  ['a']
);
assert.equal(localeCoverageComplete(assets, 'app_screenshot'), false);

// Backend/runtime boundary checks
assert.match(domain, /MARKETING_MAX_BYTES=8\*1024\*1024/);
assert.match(domain, /Just Golfriend it, my friend/);
assert.match(domain, /createHash/);
assert.match(runtime, /onCall\(\{enforceAppCheck:true/);
assert.match(runtime, /isActiveStaff/);
assert.match(runtime, /MARKETING_ASSET_BUCKET/);
assert.match(runtime, /PROVIDER_UNCONFIGURED/);
assert.match(runtime, /createMarketingAsset/);
assert.match(runtime, /uploadMarketingAssetVersion/);
assert.match(runtime, /transitionMarketingAsset/);
assert.match(runtime, /getMarketingAssetHistory/);
assert.match(runtime, /getMarketingAssetDownload/);
assert.match(runtime, /marketing_asset_receipts/);
assert.doesNotMatch(runtime, /request\.data\?\.(?:collection|bucket|path)/);
assert.match(provider, /httpsCallable/);
assert.match(provider, /crypto\.subtle\.digest/);
assert.match(provider, /firebaseMarketingLibraryProvider/);

// UI localization checks for the component-local pattern
assert.match(ui, /placeholder=\{copy\.search\}/);
assert.match(ui, /aria-label=\{copy\.search\}/);
assert.match(ui, /aria-label=\{copy\.category\}/);
assert.match(ui, /aria-label=\{copy\.state\}/);
assert.match(ui, /aria-label=\{copy\.locales\}/);
assert.match(ui, /aria-label=\{copy\.upload\}/);
assert.match(ui, /copy\.total/);
assert.match(ui, /copy\.versions/);
assert.match(ui, /copy\.updated/);
assert.match(ui, /copy\.authority/);
assert.match(ui, /value="all">\{copy\.all\}/);
assert.match(ui, /copy\.history/);
assert.match(ui, /copy\.create/);
assert.match(ui, /copy\.download/);
assert.match(ui, /copy\.review/);
assert.match(ui, /copy\.approve/);
assert.match(ui, /copy\.archive/);
assert.match(ui, /copy\.draft/);
assert.match(ui, /copy\.noHistory/);
assert.match(ui, /copy\.loading/);
assert.match(ui, /copy\.statusDraft/);
assert.match(ui, /copy\.statusReview/);
assert.match(ui, /copy\.statusApproved/);
assert.match(ui, /copy\.statusArchived/);

for (const locale of MARKETING_LOCALES) {
  assert.match(ui, new RegExp(`\n  ${locale}:`));
}

// Fail-hardcoded-English regression checks (outside locale objects)
const uiRuntime = ui.slice(ui.indexOf('const EN ='));
assert.doesNotMatch(uiRuntime, /<option value="all">All<\/option>/);
assert.doesNotMatch(uiRuntime, /<th>Versions<\/th>/);
assert.doesNotMatch(uiRuntime, /<th>Updated<\/th>/);
assert.doesNotMatch(uiRuntime, /placeholder="Search assets"/);

assert.match(app, /activeArea === 'marketing' && <V2MarketingLibrary/);
assert.match(firestore, /allow read, write: if false/);
assert.match(storage, /allow read, write: if false/);

console.log('Marketing Asset Library verification PASS: locale-complete UI copy, localized status rendering, toolbar/headers/actions, and server-boundary assertions.');
