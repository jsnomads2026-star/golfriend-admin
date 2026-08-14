// B5-R11 — Localized outreach drafts + privacy-safe opportunity evidence verification.
// Behavioural assertions on the pure model + source-contract assertions on the UI.
// No emulator, no network, no message delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildOpportunityReport,
  DELIVERY_NOTICE,
  INTEREST_METRICS,
  OPPORTUNITY_SCHEMA,
  OPPORTUNITY_VERSION,
  OUTREACH_COPY,
  OUTREACH_TEMPLATE_KINDS,
  opportunityToJson,
  opportunityToText,
  renderOutreachTemplate,
  TRANSACTION_METRICS,
} from '../src/components/admin/v2/courseOpportunityModel.mjs';
import { MIN_AGGREGATE_COUNT } from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const canonical = read('../src/i18n/locales.ts');
const canonicalCodes = canonical.match(/LOCALE_CODES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));

// --- contracts -------------------------------------------------------------
assert.equal(OPPORTUNITY_SCHEMA, 'golfriend.admin.course-opportunity-evidence.v1');
assert.equal(OPPORTUNITY_VERSION, 1);
assert.equal(OUTREACH_TEMPLATE_KINDS.length, 5);
assert.deepEqual([...INTEREST_METRICS], ['search_interest', 'saved_course', 'booking_interest']);
assert.deepEqual([...TRANSACTION_METRICS], ['confirmed_bookings', 'played_rounds']);

// --- exact eight-locale parity against the canonical source ----------------
assert.equal(canonicalCodes.length, 8);
assert.deepEqual(Object.keys(OUTREACH_COPY), canonicalCodes);
for (const locale of canonicalCodes) {
  const copy = OUTREACH_COPY[locale];
  for (const key of ['disclaimer', 'evidenceHeading', 'suppressed', 'notAttributed']) {
    assert.equal(typeof copy[key], 'string', `${locale}.${key} must be a string`);
    assert.ok(copy[key].trim().length > 0, `${locale}.${key} must not be empty`);
  }
  for (const kind of OUTREACH_TEMPLATE_KINDS) {
    assert.ok(copy[kind], `${locale} is missing template ${kind}`);
    assert.ok(copy[kind].subject.trim().length > 0, `${locale}.${kind}.subject must not be empty`);
    assert.ok(copy[kind].body.trim().length > 0, `${locale}.${kind}.body must not be empty`);
    // Real translations, not English placeholders.
    if (locale !== 'en') {
      assert.notEqual(copy[kind].subject, OUTREACH_COPY.en[kind].subject, `${locale}.${kind}.subject duplicates English`);
      assert.notEqual(copy[kind].body, OUTREACH_COPY.en[kind].body, `${locale}.${kind}.body duplicates English`);
    }
  }
  if (locale !== 'en') assert.notEqual(copy.disclaimer, OUTREACH_COPY.en.disclaimer, `${locale} disclaimer duplicates English`);
}

// --- evidence: interest may be aggregated, transactions require attribution -
const unverified = { id: 'p1', courseName: 'Riverbend', country: 'Thailand', region: 'Chonburi', contactRole: 'Course operations manager', contactEmail: 'ops@example.invalid', contactPhone: '+66000000', internalNotes: 'internal qualification', owner: 'Acquisition desk', demand: { attribution: 'unverified', source: 'Local preview fixture', observedFrom: '2026-07-01', observedUntil: '2026-07-31', searchInterest: 41, savedCourse: 12, bookingInterest: 7, confirmedBookings: 9, playedRounds: 6 } };
const report = buildOpportunityReport({ prospect: unverified, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: '2026-08-15' });
assert.deepEqual(report.claims, ['search_interest', 'saved_course', 'booking_interest']);
assert.deepEqual(report.withheld.map((w) => w.id), ['confirmed_bookings', 'played_rounds']);
assert.ok(report.withheld.every((w) => w.reason === 'not_authoritatively_attributed'));

const authoritative = { ...unverified, demand: { ...unverified.demand, attribution: 'authoritative', source: 'Authoritative booking ledger' } };
const trusted = buildOpportunityReport({ prospect: authoritative, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: '2026-08-15' });
assert.deepEqual(trusted.claims, ['search_interest', 'saved_course', 'booking_interest', 'confirmed_bookings', 'played_rounds']);

// Low-volume buckets stay suppressed even with authoritative attribution.
const thin = buildOpportunityReport({ prospect: { ...authoritative, demand: { ...authoritative.demand, confirmedBookings: 3, playedRounds: 2 } }, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: '2026-08-15' });
assert.deepEqual(thin.withheld.map((w) => w.reason), ['suppressed_low_volume', 'suppressed_low_volume']);
assert.equal(thin.privacy.minimumAggregate, MIN_AGGREGATE_COUNT);

// --- an opportunity report carries evidence, never an invoice -------------
assert.equal(report.invoice.included, false);
assert.equal(report.invoice.permitted, false);
assert.equal(report.invoice.entitlement, 'opportunity_evidence_only');
assert.equal(report.privacy.memberIdentityIncluded, false);
assert.equal(report.privacy.preciseMovementIncluded, false);
assert.equal(report.privacy.internalNotesIncluded, false);
assert.equal(report.delivery.status, 'unavailable');
// No price, currency or revenue field anywhere in the serialized evidence.
assert.doesNotMatch(opportunityToJson(report), /price|currency|revenue|invoiceAmount|amountDue/i);
assert.doesNotMatch(opportunityToText(report), /price|currency|revenue/i);

// --- drafts are generated, never delivered, and never leak ----------------
for (const kind of OUTREACH_TEMPLATE_KINDS) {
  for (const locale of canonicalCodes) {
    const draft = renderOutreachTemplate({ kind, locale, prospect: unverified });
    assert.equal(draft.deliveryAvailable, false);
    assert.equal(draft.notice, DELIVERY_NOTICE);
    assert.doesNotMatch(draft.subject + draft.body, /\{[a-z]+\}/i, `${locale}.${kind} left an unresolved placeholder`);
    assert.doesNotMatch(draft.subject + draft.body, /ops@example\.invalid|\+66000000|internal qualification|Acquisition desk/, `${locale}.${kind} leaked an internal field`);
    assert.ok(draft.body.includes(OUTREACH_COPY[locale].disclaimer), `${locale}.${kind} dropped the disclaimer`);
  }
}
assert.throws(() => renderOutreachTemplate({ kind: 'send_invoice', locale: 'en', prospect: unverified }));
assert.throws(() => renderOutreachTemplate({ kind: 'invitation', locale: 'ar', prospect: unverified }));

// A draft carrying evidence states withheld metrics rather than omitting them.
const evidenced = renderOutreachTemplate({ kind: 'opportunity_summary', locale: 'th', prospect: unverified, report });
assert.equal(evidenced.evidenceIncluded, true);
assert.match(evidenced.body, /confirmed_bookings/);
assert.ok(evidenced.body.includes(OUTREACH_COPY.th.notAttributed));

// --- source contracts ----------------------------------------------------
const model = read('../src/components/admin/v2/courseOpportunityModel.mjs');
const types = read('../src/components/admin/v2/courseOpportunityModel.d.mts');
const ui = read('../src/components/admin/v2/V2CourseAcquisition.tsx');
const css = read('../src/components/admin/v2/V2CourseAcquisition.css');

// Locale set stays single-sourced; no redeclaration of the canonical array/union.
assert.doesNotMatch(model + types + ui, /\[\s*'en'\s*,\s*'th'\s*,\s*'ko'/);
assert.match(ui, /import \{ LOCALE_CODES, coerceLocale \} from "\.\.\/\.\.\/\.\.\/i18n\/locales"/);

// No transport, no callable, no client authority, no real email delivery.
assert.doesNotMatch(model + ui, /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|XMLHttpRequest|sendEmail|nodemailer|smtp|mailto:/i);
assert.doesNotMatch(model + ui, /fetch\s*\(/);
assert.doesNotMatch(model + ui, /email sent|message sent|notification sent|delivered successfully|transmission successful|invoice raised/i);

// Honest UI affordances.
assert.match(ui, /Build opportunity evidence/);
assert.match(ui, /Generate draft/);
assert.match(ui, /Send draft unavailable/);
assert.match(ui, /Not claimed — no authoritative attribution/);
assert.match(ui, /No member identity, internal note or precise personal movement/);
assert.match(ui, /disabled>Send draft unavailable/);
assert.match(css, /\.acq-draft pre/);

console.log('Course opportunity verification PASS: exact eight-locale outreach copy with real translations, five template kinds, interest-vs-transaction attribution gating, low-volume suppression, evidence-never-invoice, no price/revenue field, internal-field redaction, unresolved-placeholder check, and generation-without-delivery boundaries.');
