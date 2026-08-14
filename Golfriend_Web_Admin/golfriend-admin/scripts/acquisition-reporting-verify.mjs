// B5-R12 — Country/course acquisition analytics + the Golfriend-to-JHCC reporting contract.
// Behavioural assertions on the pure model + source-contract assertions on the UI and route.
// No emulator, no network, no transmitter, no deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ACQUISITION_REPORT_SCHEMA,
  ACQUISITION_REPORT_VERSION,
  acquisitionAnalytics,
  acquisitionReportToCsv,
  acquisitionReportToJson,
  acquisitionReportToText,
  buildAcquisitionReport,
  JHCC_PROHIBITED_FIELDS,
  JHCC_TRANSMISSION_SCHEMA,
  jhccDeliveryState,
  validateJhccPayload,
} from '../src/components/admin/v2/acquisitionReportingModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const period = { start: '2026-07-01', end: '2026-07-31' };
const at = '2026-08-15';
const effective = { state: 'effective', signed: true, effectiveFrom: '2026-07-01', activatedAt: '2026-07-05', commissionBps: 300 };
const prospects = [
  { id: 'a', courseName: 'Riverbend', country: 'Thailand', region: 'Chonburi', stage: 'contacted', contactEmail: 'ops@example.invalid', contactPhone: '+66000000', internalNotes: 'internal only', owner: 'Acquisition desk', history: [{ at: '2026-08-04', visibility: 'internal', summary: 'private' }], demand: { attribution: 'unverified', source: 'Local preview fixture', searchInterest: 41, bookingInterest: 7, confirmedBookings: 9 } },
  { id: 'b', courseName: 'Coastal', country: 'Thailand', region: 'Phuket', stage: 'signed', contract: effective, demand: { attribution: 'authoritative', source: 'Attributed source', searchInterest: 30, bookingInterest: 11, confirmedBookings: 8 } },
  { id: 'c', courseName: 'Highland', country: 'Japan', region: 'Nagano', stage: 'pilot_discussion', demand: { attribution: 'authoritative', source: 'Attributed source', searchInterest: 20, bookingInterest: 6, confirmedBookings: 7 } },
];

// --- contracts -------------------------------------------------------------
assert.equal(ACQUISITION_REPORT_SCHEMA, 'golfriend.admin.course-acquisition-report.v1');
assert.equal(ACQUISITION_REPORT_VERSION, 1);
assert.equal(JHCC_TRANSMISSION_SCHEMA, 'golfriend.admin.jhcc-acquisition-report-transmission.v1');
for (const field of ['memberId', 'email', 'phone', 'latitude', 'longitude', 'internalNotes', 'contactEmail']) assert.ok(JHCC_PROHIBITED_FIELDS.includes(field), `${field} must be prohibited for JHCC`);

// --- country and course analytics -----------------------------------------
const analytics = acquisitionAnalytics(prospects, { evaluationDate: at });
assert.equal(analytics.totals.prospects, 3);
assert.equal(analytics.totals.countries, 2);
assert.equal(analytics.totals.commissionEffective, 1);
assert.equal(analytics.totals.opportunityEvidenceOnly, 2);
assert.deepEqual(analytics.countries.map((c) => c.country), ['Japan', 'Thailand']);
assert.equal(analytics.courses.length, 3);
assert.equal(analytics.courses.find((c) => c.prospectId === 'b').commissionEffective, true);
assert.equal(analytics.courses.find((c) => c.prospectId === 'a').commissionReason, 'no_signed_agreement');

// A rollup is only as trustworthy as its least-attributed input.
const thailand = analytics.countries.find((c) => c.country === 'Thailand');
assert.equal(thailand.demand.attribution, 'unverified');
assert.equal(thailand.demand.bookingInterest.value, 18);
assert.equal(thailand.demand.confirmedBookings.disclosed, false);
assert.equal(thailand.demand.confirmedBookings.reason, 'not_authoritatively_attributed');
const japan = analytics.countries.find((c) => c.country === 'Japan');
assert.equal(japan.demand.attribution, 'authoritative');
assert.equal(japan.demand.confirmedBookings.disclosed, true);
// A rollup states its own coverage: a total built from a subset is reported as partial,
// never presented as a complete figure for the group.
const partial = acquisitionAnalytics([
  { id: 'k1', country: 'Korea', demand: { attribution: 'authoritative', confirmedBookings: 9 } },
  { id: 'k2', country: 'Korea', demand: { attribution: 'authoritative' } },
], { evaluationDate: at }).countries[0].demand.confirmedBookings;
assert.equal(partial.disclosed, true);
assert.equal(partial.value, 9);
assert.equal(partial.partialCoverage, true);
assert.deepEqual(partial.coverage, { contributing: 1, total: 2 });
const complete = analytics.countries.find((c) => c.country === 'Japan').demand.confirmedBookings;
assert.equal(complete.partialCoverage, false);
assert.deepEqual(complete.coverage, { contributing: 1, total: 1 });
// A withheld metric is never labelled partial.
assert.equal(thailand.demand.confirmedBookings.partialCoverage, false);

// Low-volume rollups stay suppressed even when authoritatively attributed.
assert.equal(acquisitionAnalytics([{ id: 'x', country: 'Korea', demand: { attribution: 'authoritative', confirmedBookings: 2 } }], { evaluationDate: at }).countries[0].demand.confirmedBookings.reason, 'suppressed_low_volume');

// --- JHCC delivery is fail-closed ----------------------------------------
assert.equal(jhccDeliveryState(null, at).reason, 'no_authorization_record');
assert.equal(jhccDeliveryState({ approved: false, contractRef: 'X', effectiveFrom: '2026-01-01' }, at).reason, 'authorization_not_approved');
assert.equal(jhccDeliveryState({ approved: true, effectiveFrom: '2026-01-01' }, at).reason, 'no_contract_reference');
assert.equal(jhccDeliveryState({ approved: true, contractRef: 'X' }, at).reason, 'no_effective_date');
assert.equal(jhccDeliveryState({ approved: true, contractRef: 'X', effectiveFrom: '2026-09-01' }, at).reason, 'not_yet_effective');
assert.equal(jhccDeliveryState({ approved: true, contractRef: 'X', effectiveFrom: '2026-01-01', effectiveUntil: '2026-06-30' }, at).reason, 'authorization_lapsed');
const authorized = jhccDeliveryState({ approved: true, contractRef: 'JHCC-2026-01', effectiveFrom: '2026-08-01' }, at);
assert.equal(authorized.authorized, true);
assert.equal(authorized.contractRef, 'JHCC-2026-01');

// --- privacy screening blocks personal data before any delivery ----------
assert.equal(validateJhccPayload({ rows: [{ memberId: 'm1' }] }).valid, false);
assert.deepEqual(validateJhccPayload({ rows: [{ memberId: 'm1' }] }).prohibitedKeys, ['memberId']);
assert.equal(validateJhccPayload({ a: 'ops@course.example' }).valid, false);
assert.equal(validateJhccPayload({ a: '+66000000' }).valid, false);
assert.equal(validateJhccPayload({ a: '13.7563, 100.5018' }).valid, false);
assert.equal(validateJhccPayload({ a: '084512345678' }).valid, false);
// ISO dates and timestamps are structural, not personal, and must not false-positive.
assert.equal(validateJhccPayload({ generatedAt: '2026-08-15T00:00:00.000Z', day: '2026-08-15' }).valid, true);

// --- the report itself carries no personal data and no invoice -----------
const report = buildAcquisitionReport({ prospects, period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at });
assert.equal(report.validation.valid, true);
assert.equal(report.delivery.status, 'unavailable');
assert.equal(report.delivery.transmitter, null);
assert.equal(report.delivery.deliverable, false);
assert.equal(report.delivery.lastSuccessfulAt, null);
const serialized = acquisitionReportToJson(report);
assert.doesNotMatch(serialized, /ops@example\.invalid|\+66000000|internal only|Acquisition desk|private/);
// The analytics payload carries no monetary field at all; only the limitations may name money,
// and there only to state that it is excluded.
assert.doesNotMatch(JSON.stringify(report.analytics), /invoice|price|currency|revenue|amount|commissionBps/i);
assert.doesNotMatch(serialized, /[$€£¥]|\bUSD\b|\bTHB\b|\bEUR\b|\bJPY\b/);
assert.ok(report.limitations.some((l) => /No invoice, price or commission amount is included for an unsigned course/.test(l)));
assert.ok(Object.isFrozen(report));

// An authorized contract flips delivery, and a failed screen still blocks it.
const withAuth = buildAcquisitionReport({ prospects, period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at, authorization: { approved: true, contractRef: 'JHCC-2026-01', effectiveFrom: '2026-08-01' } });
assert.equal(withAuth.delivery.authorized, true);
assert.equal(withAuth.delivery.deliverable, true);
assert.equal(withAuth.delivery.transmitter, null, 'no transmitter may exist in this build');
const leaky = buildAcquisitionReport({ prospects: [{ id: 'z', courseName: 'ops@leak.example', country: 'Thailand' }], period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at, authorization: { approved: true, contractRef: 'JHCC-2026-01', effectiveFrom: '2026-08-01' } });
assert.equal(leaky.validation.valid, false);
assert.equal(leaky.delivery.deliverable, false, 'a payload failing privacy screening must never be deliverable');

// --- deterministic exports -----------------------------------------------
assert.deepEqual(JSON.parse(acquisitionReportToJson(report)), JSON.parse(JSON.stringify(report)));
assert.match(acquisitionReportToText(report), /Automatic JHCC acquisition delivery awaiting an approved reporting contract/);
assert.match(acquisitionReportToText(report), /Schema: golfriend\.admin\.course-acquisition-report\.v1/);
assert.equal(acquisitionReportToCsv(report).split('\n').length, 3);
assert.match(acquisitionReportToCsv(report), /not_authoritatively_attributed/);

// --- source contracts ----------------------------------------------------
const model = read('../src/components/admin/v2/acquisitionReportingModel.mjs');
const types = read('../src/components/admin/v2/acquisitionReportingModel.d.mts');
const ui = read('../src/components/admin/v2/V2AcquisitionReport.tsx');
const css = read('../src/components/admin/v2/V2AcquisitionReport.css');
const app = read('../src/App.tsx');

assert.match(app, /activeArea === 'reports' && <V2AcquisitionReport/);
assert.doesNotMatch(model + types + ui, /\[\s*'en'\s*,\s*'th'\s*,\s*'ko'/);
assert.doesNotMatch(model + ui, /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|XMLHttpRequest|sendEmail|smtp/i);
assert.doesNotMatch(model + ui, /fetch\s*\(/);
// False-claim vocabulary. "revenue" is permitted only in the limitation that excludes it.
assert.doesNotMatch(model + ui, /JHCC received|transmission successful|delivered successfully|report sent|revenue total|revenue of/i);
assert.match(ui, /Transmit to JHCC unavailable/);
assert.match(ui, /disabled=\{!transmitter\}/);
assert.match(ui, /transmitter = null/);
assert.match(ui, /authorization = null/);
assert.match(ui, /JHCC receives oversight reporting\s*\n?\s*only and is never the booking engine or a payment processor/);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /min-height:44px/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Acquisition reporting verification PASS: country/course analytics, weakest-attribution rollups, low-volume suppression, fail-closed JHCC authorization, prohibited-field and personal-value screening with no ISO-date false positives, screening blocks delivery, null transmitter, deterministic TXT/CSV/JSON exports, route and responsive boundaries.');
