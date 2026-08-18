import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const component = read('../src/components/B2B/PartnerTrialReceipt.tsx');
const service = read('../src/components/B2B/partnerTrialReceiptService.ts');
const copy = read('../src/i18n/partner/trialReceipt.ts');
const smallBusiness = read('../src/components/B2B/SmallBusinessDashboard.tsx');
const enterprise = read('../src/components/B2B/EnterpriseDashboard.tsx');
const adminAuthority = read('../src/components/admin/v2/V2PartnerAuthority.tsx');

const LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];

test('one component serves both Portal and Admin, so the two cannot diverge', () => {
  assert.match(smallBusiness, /import PartnerTrialReceipt from '\.\/PartnerTrialReceipt'/);
  assert.match(enterprise, /import PartnerTrialReceipt from '\.\/PartnerTrialReceipt'/);
  assert.match(adminAuthority, /import PartnerTrialReceipt from "\.\.\/\.\.\/B2B\/PartnerTrialReceipt"/);
  assert.match(smallBusiness, /<PartnerTrialReceipt\/>/);
  assert.match(enterprise, /<PartnerTrialReceipt\/>/);
  assert.match(adminAuthority, /<PartnerTrialReceipt admin organizationId=\{receiptOrg\}\/>/);
});

test('each surface consumes its own callable and no other', () => {
  assert.match(service, /httpsCallable\(getFunctions\(\), name\)/);
  assert.match(service, /mine: \(organizationId\?: string\) => call\("getPartnerTrialReceiptV1"/);
  assert.match(service, /forOrganization: \(organizationId: string\) => call\("getAdminPartnerTrialReceiptV1"/);
});

test('the UI never recalculates a money value', () => {
  // Only formatting of stored minor units is permitted. No arithmetic on amounts.
  assert.doesNotMatch(component, /normalMinor\s*[-+*]\s*/);
  assert.doesNotMatch(component, /dueMinor\s*[-+*]\s*/);
  assert.doesNotMatch(component, /reduce\(/, 'totals must come from the stored receipt, not be re-summed');
  assert.doesNotMatch(component, /discountMinor\s*=\s*/);
  // The only division is minor-units-to-major inside the formatter.
  assert.match(component, /minor \/ 100/);
  assert.equal((component.match(/\/ 100/g) || []).length, 2, 'only the currency formatter may scale minor units');
});

test('a failed digest verification shows a security error rather than data', () => {
  assert.match(component, /result\.verification\.valid === false/);
  assert.match(component, /copy\.securityError/);
  // The security branch must return before any statement value is rendered.
  const securityIndex = component.indexOf('copy.securityError');
  const tableIndex = component.indexOf('<table>');
  assert.ok(securityIndex < tableIndex, 'the digest check must precede rendering');
});

test('loading, offline, unavailable and unknown states are all distinct and honest', () => {
  for (const state of ['copy.loading', 'copy.offline', 'copy.unavailable', 'copy.unknown']) {
    assert.ok(component.includes(state), `missing ${state}`);
  }
  assert.match(service, /navigator\.onLine === false/);
  assert.match(service, /reason: "unknown"/, 'an off-contract response must be unknown, not rendered');
  assert.doesNotMatch(service, /error\.message|error\.code/, 'raw provider errors must never surface');
});

test('Admin is read-only: no cancel control and no editable receipt field', () => {
  assert.match(component, /!admin && onCancelTrial/);
  assert.doesNotMatch(component, /<input[^>]*(normalMinor|dueMinor|discountMinor)/);
  assert.doesNotMatch(component, /contentEditable/);
});

test('cancellation requires an explicit confirmation step', () => {
  assert.match(component, /confirming \? \(/);
  assert.match(component, /copy\.cancelConfirmYes/);
  assert.match(component, /copy\.cancelConfirmNo/);
  assert.match(component, /role="alert">\{copy\.cancelConfirm\}/);
});

test('trial presentation derives only from stored dates and stored cancellation', async () => {
  const {trialPresentation, remainingDays} = await import('../src/components/B2B/trialPresentation.mjs');
  const trial = {startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z', cancelledAt: null};
  const at = iso => Date.parse(iso);
  assert.equal(trialPresentation(trial, at('2026-09-02T00:00:00.000Z')).status, 'active');
  assert.equal(trialPresentation(trial, at('2026-11-25T00:00:00.000Z')).status, 'expiring');
  assert.equal(trialPresentation(trial, at('2026-11-25T00:00:00.000Z')).remaining, 5);
  assert.equal(trialPresentation(trial, at('2026-11-30T00:00:00.000Z')).status, 'expired');
  assert.equal(trialPresentation(trial, at('2027-01-01T00:00:00.000Z')).remaining, 0, 'never negative');
  const cancelled = {...trial, cancelledAt: '2026-10-01T00:00:00.000Z'};
  const view = trialPresentation(cancelled, at('2026-10-10T00:00:00.000Z'));
  assert.equal(view.status, 'cancelled');
  assert.equal(view.readOnly, true);
  assert.equal(view.readOnlyUntil, '2026-10-31T00:00:00.000Z', '30-day read-only/export window');
  assert.equal(trialPresentation(cancelled, at('2026-12-01T00:00:00.000Z')).readOnly, false);
  assert.equal(remainingDays('2026-11-30T00:00:00.000Z', at('2027-01-01T00:00:00.000Z')), 0);
});

test('exactly the canonical eight locales, each a real translation', () => {
  const declared = [...copy.matchAll(/^ {2}([a-z]{2}): \{$/gm)].map(m => m[1]);
  assert.deepEqual(declared, LOCALES);
  const boundary = [...copy.matchAll(/securityError: (['"])((?:(?!\1).)*)\1/g)].map(m => m[2]);
  assert.equal(boundary.length, 8);
  assert.equal(new Set(boundary).size, 8, 'every locale needs its own security-error wording');
  // No English leaking into a non-English locale value.
  for (const locale of ['th', 'ko', 'ja', 'zh']) {
    const start = copy.indexOf(`\n  ${locale}: {`);
    const block = copy.slice(start, copy.indexOf('\n  },', start));
    assert.doesNotMatch(block, /: '[A-Za-z][A-Za-z ]{14,}'/, `${locale} contains untranslated English`);
  }
});

test('the external-money boundary is shown from the stored receipt, not from local copy', () => {
  assert.match(component, /\{statement\.externalMoneyBoundary\}/);
  assert.match(component, /copy\.legalPending/);
});
