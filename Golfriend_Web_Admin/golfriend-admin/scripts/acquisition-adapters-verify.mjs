// B5-R13 — Founder-approved release: outbound free-text minimization, the privacy-safe JHCC
// acquisition contract record, and four fail-closed adapter interfaces.
// Behavioural hostile-input tests. No real provider, credential, endpoint, email or transmission.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  OUTBOUND_FIELD_ALLOWLIST,
  OUTBOUND_PROHIBITED_FIELDS,
  outboundProspect,
  recipientContact,
  WITHHELD_FREE_TEXT,
} from '../src/components/admin/v2/courseAcquisitionModel.mjs';
import { renderOutreachTemplate, buildOpportunityReport, opportunityToJson, opportunityToText } from '../src/components/admin/v2/courseOpportunityModel.mjs';
import {
  buildAcquisitionReport,
  buildJhccAcquisitionPayload,
  JHCC_ACQUISITION_ALLOWED_SECTIONS,
  JHCC_ACQUISITION_AUTHORIZATION,
  jhccDeliveryState,
  validateJhccPayload,
} from '../src/components/admin/v2/acquisitionReportingModel.mjs';
import {
  ADAPTER_ERROR_CODES,
  ADAPTER_IDS,
  DEFAULT_ACQUISITION_ADAPTERS,
  deliverOutreach,
  loadAcquisitionSource,
  resolveAdapter,
  submitConversionHandoff,
  transmitJhccAcquisition,
} from '../src/components/admin/v2/acquisitionAdapters.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const at = '2026-08-15';
const period = { start: '2026-07-01', end: '2026-07-31' };

// Hostile row: every free-text field loaded with personal data.
const hostile = {
  id: 'h1', courseName: 'Riverbend', country: 'Thailand', region: 'Chonburi',
  contactRole: 'GM Somchai Prasert', contactEmail: 'ops@leak.example', contactPhone: '+66812345678',
  internalNotes: 'private qualification note', owner: 'Acquisition desk',
  stage: 'meeting_held', lastContactedAt: '2026-08-04',
  history: [{ at: '2026-08-04', visibility: 'shareable', summary: 'met the owner Somchai at 13.7563,100.5018' }, { at: '2026-08-01', visibility: 'internal', summary: 'internal note' }],
  demand: { attribution: 'authoritative', source: 'ledger for member m_88213 (somchai@x.example)', searchInterest: 41, bookingInterest: 12, confirmedBookings: 9 },
};
const LEAKS = /ops@leak\.example|\+66812345678|private qualification|Acquisition desk|m_88213|somchai@x\.example|met the owner|13\.7563/;

// === 1. Outbound projection: allowlisted structured fields ONLY ============
const out = outboundProspect(hostile);
assert.deepEqual(Object.keys(out).sort(), [...OUTBOUND_FIELD_ALLOWLIST].sort(), 'outbound projection must match the allowlist exactly');
for (const field of OUTBOUND_PROHIBITED_FIELDS) assert.ok(!Object.hasOwn(out, field), `outbound projection exposed prohibited field ${field}`);
// Contact history is reduced to a structured count and a date — never narrative.
assert.equal(out.contactCount, 2);
assert.equal(out.lastContactedAt, '2026-08-04');
assert.doesNotMatch(JSON.stringify(out), LEAKS);
// Screening still applies to the allowlisted strings themselves.
// Withheld values keep a stable surrogate so distinct values do not collapse into one bucket.
assert.match(outboundProspect({ id: 'x', region: 'owner ops@leak.example' }).region, new RegExp(`^${WITHHELD_FREE_TEXT} \\(ref-`));

// === 2. No free text reaches ANY outbound artifact ========================
const report = buildOpportunityReport({ prospect: hostile, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at });
// The demand SOURCE DESCRIPTION is registry free text and must not be carried at all.
assert.deepEqual(Object.keys(report.attribution), ['level']);
assert.equal(report.attribution.level, 'authoritative');
const acquisition = buildAcquisitionReport({ prospects: [hostile], period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at, authorization: JHCC_ACQUISITION_AUTHORIZATION });
const jhcc = buildJhccAcquisitionPayload(acquisition, { opportunityReportsGenerated: 3 });
for (const [name, text] of [
  ['opportunity JSON', opportunityToJson(report)],
  ['opportunity TXT', opportunityToText(report)],
  ['acquisition report', JSON.stringify(acquisition)],
  ['JHCC payload', JSON.stringify(jhcc)],
  ['default draft', JSON.stringify(renderOutreachTemplate({ kind: 'opportunity_summary', locale: 'en', prospect: hostile, report }))],
]) assert.doesNotMatch(text, LEAKS, `${name} carried free-text/personal content`);

// === 3. A personal name only in an explicitly selected recipient ==========
const anonymous = renderOutreachTemplate({ kind: 'invitation', locale: 'en', prospect: hostile });
assert.equal(anonymous.recipientIncluded, false);
assert.doesNotMatch(anonymous.body, /Somchai/, 'the default draft must carry no personal name');
assert.match(anonymous.body, /Course team/);
const addressed = renderOutreachTemplate({ kind: 'invitation', locale: 'en', prospect: hostile, includeRecipient: true });
assert.equal(addressed.recipientIncluded, true);
assert.match(addressed.body, /GM Somchai Prasert/, 'an explicitly selected recipient may appear in a draft');
assert.equal(addressed.deliveryAvailable, false, 'a recipient never enables delivery');
// Every locale must have a name-free fallback.
for (const locale of ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']) assert.doesNotMatch(renderOutreachTemplate({ kind: 'invitation', locale, prospect: hostile }).body, /Somchai/, `${locale} default draft leaked a name`);
// The recipient projection is never usable as analytics input.
assert.equal(recipientContact(hostile).approvalRequired, true);
assert.equal(recipientContact({ id: 'x', contactRole: 'call +66812345678' }).contactRole, WITHHELD_FREE_TEXT);

// === 4. Privacy-safe JHCC acquisition contract record =====================
assert.equal(JHCC_ACQUISITION_AUTHORIZATION.approved, true);
assert.equal(JHCC_ACQUISITION_AUTHORIZATION.effectiveFrom, '2026-08-15');
assert.equal(JHCC_ACQUISITION_AUTHORIZATION.scope, 'aggregate_oversight_only');
assert.deepEqual([...JHCC_ACQUISITION_ALLOWED_SECTIONS], ['prospectCounts', 'prospectStatus', 'countryCoverage', 'courseCoverage', 'opportunityReportCounts', 'portalConversionStatus', 'dataCompleteness']);
for (const section of JHCC_ACQUISITION_ALLOWED_SECTIONS) assert.ok(Object.hasOwn(jhcc, section), `JHCC payload missing approved section ${section}`);
// Aggregate oversight only: no course identity, region or contact history.
assert.doesNotMatch(JSON.stringify(jhcc), /Riverbend|Chonburi|courseName|region|history|contactRole/);
assert.equal(validateJhccPayload(jhcc).valid, true);
assert.equal(jhcc.prospectCounts.total, 1);
assert.equal(jhcc.opportunityReportCounts.generated, 3);
assert.equal(jhcc.opportunityReportCounts.generated >= 0, true);
assert.equal(buildJhccAcquisitionPayload(acquisition, { opportunityReportsGenerated: -5 }).opportunityReportCounts.generated, 0, 'a negative count must not be emitted');
assert.ok(Object.isFrozen(jhcc));

// === 5. Transmission stays disabled without a mounted transmitter =========
// The Founder authorization IS on record, so authorization alone must not enable delivery.
assert.equal(acquisition.delivery.authorized, true);
assert.equal(acquisition.delivery.contractRef, 'GOLFRIEND-JHCC-ACQUISITION-2026-08-15');
assert.equal(acquisition.delivery.transmitterMounted, false);
assert.equal(acquisition.delivery.transmitter, null);
assert.equal(acquisition.delivery.deliverable, false, 'an approved authorization must not be sufficient to deliver');
assert.equal(acquisition.delivery.lastSuccessfulAt, null);

// === 6. Adapters are fail-closed =========================================
assert.deepEqual([...ADAPTER_IDS], ['acquisition.data-source', 'acquisition.outreach-delivery', 'acquisition.portal-conversion', 'acquisition.jhcc-transmitter']);
assert.ok(Object.values(DEFAULT_ACQUISITION_ADAPTERS).every((adapter) => adapter === null), 'every production adapter must be null');
assert.equal(resolveAdapter(DEFAULT_ACQUISITION_ADAPTERS, 'acquisition.data-source').available, false);
assert.equal(resolveAdapter(DEFAULT_ACQUISITION_ADAPTERS, 'not.a.real.adapter').reason, 'unknown_adapter');
assert.equal(resolveAdapter(null, 'acquisition.data-source').available, false, 'a missing adapter map must fail closed');

const unavailable = await Promise.all([
  loadAcquisitionSource(DEFAULT_ACQUISITION_ADAPTERS, {}),
  deliverOutreach(DEFAULT_ACQUISITION_ADAPTERS, { draft: anonymous, recipientSelected: true, humanApproved: true }),
  submitConversionHandoff(DEFAULT_ACQUISITION_ADAPTERS, { prospect: hostile, idempotencyKey: 'k1' }),
  transmitJhccAcquisition(DEFAULT_ACQUISITION_ADAPTERS, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k1' }),
]);
for (const result of unavailable) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ADAPTER_UNAVAILABLE');
  assert.equal(result.error.retryable, false, 'an absent adapter is not a transient failure');
  assert.equal(result.delivered, false);
  assert.ok(ADAPTER_ERROR_CODES.includes(result.error.code));
}

// === 7. Even a MOUNTED preview adapter refuses to send ===================
let sendAttempts = 0;
const previewAdapters = {
  'acquisition.data-source': { label: 'local preview', async load() { return [hostile, hostile]; } },
  'acquisition.outreach-delivery': { async queueForApproval() { sendAttempts += 1; return { queuedId: 'queued-1' }; } },
  'acquisition.portal-conversion': { async submit() { return { handoffId: 'handoff-1', partnerStatus: 'active_partner' }; } },
  'acquisition.jhcc-transmitter': { async transmit() { return { receiptId: 'receipt-1' }; } },
};

// Data source: rows come back through the outbound allowlist, never raw.
const loaded = await loadAcquisitionSource(previewAdapters, { limit: 1 });
assert.equal(loaded.ok, true);
assert.equal(loaded.value.prospects.length, 1, 'limit must be enforced');
assert.deepEqual(Object.keys(loaded.value.prospects[0]).sort(), [...OUTBOUND_FIELD_ALLOWLIST].sort());
assert.doesNotMatch(JSON.stringify(loaded.value), LEAKS);
assert.equal((await loadAcquisitionSource(previewAdapters, { limit: 0 })).error.code, 'VALIDATION_FAILED');
assert.equal((await loadAcquisitionSource(previewAdapters, { limit: 5000 })).error.code, 'VALIDATION_FAILED');
assert.equal((await loadAcquisitionSource({ 'acquisition.data-source': { async load() { return 'not-an-array'; } } }, {})).error.code, 'VALIDATION_FAILED');

// Outreach: refuses without explicit recipient selection AND human approval.
assert.equal((await deliverOutreach(previewAdapters, { draft: anonymous })).error.code, 'NOT_ELIGIBLE');
assert.equal((await deliverOutreach(previewAdapters, { draft: anonymous, recipientSelected: true })).error.code, 'AUTHORIZATION_REQUIRED');
assert.equal((await deliverOutreach(previewAdapters, { draft: { subject: '', body: '' }, recipientSelected: true, humanApproved: true })).error.code, 'VALIDATION_FAILED');
// A draft that claims it can be delivered is rejected outright.
assert.equal((await deliverOutreach(previewAdapters, { draft: { ...anonymous, deliveryAvailable: true }, recipientSelected: true, humanApproved: true })).error.code, 'VALIDATION_FAILED');
assert.equal(sendAttempts, 0, 'no queueing may occur on any refused path');
const queued = await deliverOutreach(previewAdapters, { draft: anonymous, recipientSelected: true, humanApproved: true });
assert.equal(queued.ok, true);
assert.equal(queued.value.sent, false, 'a mounted preview adapter must still not send');
assert.equal(queued.value.state, 'queued_for_human_approval');
assert.equal(queued.delivered, false);

// Conversion: never grants partner status even when the adapter claims it.
assert.equal((await submitConversionHandoff(previewAdapters, { prospect: hostile })).error.code, 'VALIDATION_FAILED', 'an idempotency key is required');
assert.equal((await submitConversionHandoff(previewAdapters, { prospect: { id: 'p', stage: 'contacted' }, idempotencyKey: 'k' })).error.code, 'NOT_ELIGIBLE');
const converted = await submitConversionHandoff(previewAdapters, { prospect: hostile, idempotencyKey: 'k1' });
assert.equal(converted.ok, true);
assert.equal(converted.value.partnerStatusGranted, false, 'an adapter claiming active_partner must not grant partner status');
assert.equal(converted.value.provisioningAuthority, 'staff');
assert.doesNotMatch(JSON.stringify(converted), /active_partner/);

// JHCC transmitter: all four conditions required, screen before confirmation.
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: jhcc, authorization: null, confirmed: true, idempotencyKey: 'k', evaluationDate: at })).error.code, 'AUTHORIZATION_REQUIRED');
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: jhcc, authorization: { approved: false, contractRef: 'x' }, confirmed: true, idempotencyKey: 'k', evaluationDate: at })).error.code, 'AUTHORIZATION_REQUIRED');
// A malformed call reports a validation problem, not a fake authorization refusal.
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k' })).error.code, 'VALIDATION_FAILED');
// An inherited `rejected` flag is not a decline — hasOwn discipline, as in resolveAdapter.
assert.equal((await submitConversionHandoff({ 'acquisition.portal-conversion': { async submit() { return Object.assign(Object.create({ rejected: true }), { handoffId: 'H-1' }); } } }, { prospect: { id: 'p', stage: 'signed' }, idempotencyKey: 'k' })).value.handoffId, 'H-1');
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, evaluationDate: at })).error.code, 'VALIDATION_FAILED');
// A payload carrying personal data is blocked BEFORE confirmation is even considered.
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: { ...jhcc, leak: 'ops@leak.example' }, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k', evaluationDate: at })).error.code, 'PRIVACY_SCREEN_FAILED');
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: { ...jhcc, memberId: 'm1' }, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k', evaluationDate: at })).error.code, 'PRIVACY_SCREEN_FAILED');
assert.equal((await transmitJhccAcquisition(previewAdapters, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: false, idempotencyKey: 'k', evaluationDate: at })).error.code, 'AUTHORIZATION_REQUIRED');

// === 7b. Gaps the first review found: malformed adapters, faults, bad transmitters ====
// A non-null value is not an adapter. These must fail CLOSED, not reach the call site.
for (const bogus of [0, '', false, NaN, 'evil', 42, {}, { load: 'not-a-function' }]) {
  const resolved = resolveAdapter({ 'acquisition.data-source': bogus }, 'acquisition.data-source');
  assert.equal(resolved.available, false, `malformed adapter treated as mounted: ${String(bogus)}`);
  assert.equal(resolved.reason, 'adapter_malformed', `a non-adapter value must be reported as malformed: ${String(bogus)}`);
  assert.equal(resolved.adapter, null);
  const result = await loadAcquisitionSource({ 'acquisition.data-source': bogus }, {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ADAPTER_UNAVAILABLE');
}
// A throwing or rejecting adapter becomes a typed refusal, never an escaping exception.
const throwing = { 'acquisition.data-source': { load() { throw new Error('boom'); } }, 'acquisition.outreach-delivery': { queueForApproval() { throw new Error('boom'); } }, 'acquisition.portal-conversion': { submit() { return Promise.reject(new Error('boom')); } }, 'acquisition.jhcc-transmitter': { transmit() { return Promise.reject(new Error('boom')); } } };
for (const [label, invocation] of [
  ['data-source', loadAcquisitionSource(throwing, {})],
  ['outreach', deliverOutreach(throwing, { draft: anonymous, recipientSelected: true, humanApproved: true })],
  ['conversion', submitConversionHandoff(throwing, { prospect: hostile, idempotencyKey: 'k' })],
  ['transmitter', transmitJhccAcquisition(throwing, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k', evaluationDate: at })],
]) {
  const settled = await invocation;
  assert.equal(settled.ok, false, `${label} did not contain the adapter fault`);
  assert.equal(settled.error.code, 'ADAPTER_UNAVAILABLE');
  assert.equal(settled.delivered, false);
}
// A transmitter is an object exposing transmit(). Nothing else may read as mounted.
for (const bogus of [false, 0, '', NaN, 'not-a-transmitter', {}, { transmit: 'nope' }]) {
  const built = buildAcquisitionReport({ prospects: [], period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at, authorization: JHCC_ACQUISITION_AUTHORIZATION, transmitter: bogus });
  assert.equal(built.delivery.transmitterMounted, false, `bogus transmitter read as mounted: ${String(bogus)}`);
  assert.equal(built.delivery.transmitter, null);
  assert.equal(built.delivery.deliverable, false);
}
// An unstable payload must not be able to serialize differently after the screen: the
// SCREENED copy is what gets transmitted.
let serializations = 0;
let transmitted = null;
const unstable = { toJSON() { serializations += 1; return serializations === 1 ? { clean: true } : { email: 'leak@real.example', memberId: 'm_1' }; } };
const capture = { 'acquisition.jhcc-transmitter': { async transmit(input) { transmitted = JSON.stringify(input.payload); return { receiptId: 'receipt-1' }; } } };
const sent = await transmitJhccAcquisition(capture, { payload: unstable, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k', evaluationDate: at });
assert.equal(sent.ok, true);
assert.doesNotMatch(transmitted, /leak@real\.example|m_1/, 'the transmitter received unscreened content');
assert.equal(transmitted, '{"clean":true}');
// A hostile adapter return value cannot smuggle an object into the result.
const hostileReturn = { 'acquisition.portal-conversion': { async submit() { return { handoffId: { partnerStatus: 'active_partner', granted: true } }; } } };
const smuggled = await submitConversionHandoff(hostileReturn, { prospect: hostile, idempotencyKey: 'k' });
assert.equal(smuggled.value.handoffId, null, 'a non-string adapter identifier must be dropped');
assert.doesNotMatch(JSON.stringify(smuggled), /active_partner|granted/);
const hostileReceipt = { 'acquisition.jhcc-transmitter': { async transmit() { return { receiptId: { accepted: 'JHCC received' } }; } } };
const claimed = await transmitJhccAcquisition(hostileReceipt, { payload: jhcc, authorization: JHCC_ACQUISITION_AUTHORIZATION, confirmed: true, idempotencyKey: 'k', evaluationDate: at });
assert.equal(claimed.value.receiptId, null);
assert.equal(claimed.value.acceptedByJhcc, false, 'acceptance may not be claimed without a real receipt identifier');
// A blank or non-string contract reference is not an authorization.
for (const bad of [[], {}, 123, '   ', null]) assert.equal(jhccDeliveryState({ approved: true, contractRef: bad, effectiveFrom: '2026-01-01' }, at).reason, 'no_contract_reference');
// Caller-supplied period fields cannot ride into the JHCC payload.
const labelled = buildAcquisitionReport({ prospects: [hostile], period: { start: '2026-07-01', end: '2026-07-31', label: 'push led by Somchai Prasert, 12 Soi 4' }, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at, authorization: JHCC_ACQUISITION_AUTHORIZATION });
const projected = buildJhccAcquisitionPayload(labelled);
assert.deepEqual(Object.keys(projected.period), ['start', 'end']);
assert.doesNotMatch(JSON.stringify(projected), /Somchai|Soi 4/);
// A personal value used as an object KEY is screened, not only values.
assert.equal(validateJhccPayload({ countryCoverage: { prospectsPerCountry: { 'ops@leak.example': 3 } } }).valid, false);

// === 8. No real provider, credential, endpoint, email or transmission =====
const adapters = read('../src/components/admin/v2/acquisitionAdapters.mjs');
assert.doesNotMatch(codeOnly(adapters), /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|httpsCallable|firebase|firestore|nodemailer|smtp|mailto:|<form\s+action/i);
assert.doesNotMatch(adapters, /https?:\/\/(?!example\.invalid)/i, 'no real endpoint may be embedded');
assert.doesNotMatch(adapters, /api[_-]?key|client[_-]?secret|private[_-]?key|Bearer\s|password|token\s*[:=]\s*['"]/i);
assert.doesNotMatch(codeOnly(adapters), /setInterval\s*\(|setTimeout\s*\(|cron|schedule/i, 'no background schedule may exist');
assert.doesNotMatch(codeOnly(adapters), /delivered successfully|message sent|email sent|JHCC received|transmission successful/i);

console.log('Acquisition adapters and Founder-release verification PASS: outbound allowlist exact with prohibited fields absent, contact history reduced to counts, no free text in any outbound artifact, personal name only in an explicitly selected recipient draft across eight locales, privacy-safe JHCC aggregate contract effective 2026-08-15, transmission disabled without a mounted transmitter, four adapters fail-closed and non-retryable when absent, mounted preview adapters still refuse to send or grant partner status, and no provider/credential/endpoint/email/schedule material.');
