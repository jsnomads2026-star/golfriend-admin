// B5-R10 — Enterprise course acquisition registry verification.
// Behavioural assertions on the pure model + source-contract assertions on the
// provider, UI, route and CSS. No emulator, no network, no deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  acquisitionSummary,
  ATTRIBUTION_LEVELS,
  COMMISSION_BEARING_STATES,
  CONTRACT_STATES,
  commissionState,
  containsPersonalData,
  conversionHandoff,
  discloseMetric,
  filterProspects,
  HANDOFF_READY_STAGES,
  INTERNAL_ONLY_FIELDS,
  invoiceEligibility,
  MIN_AGGREGATE_COUNT,
  normalizeProspect,
  NOTE_VISIBILITIES,
  OUTREACH_CHANNELS,
  PROSPECT_STAGES,
  shareableProspect,
  WITHHELD_FREE_TEXT,
} from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
/** Comments describe what the code must NOT do, so egress screening runs on code only. */
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// --- contracts -------------------------------------------------------------
assert.equal(PROSPECT_STAGES.length, 12);
assert.equal(CONTRACT_STATES.length, 9);
assert.equal(OUTREACH_CHANNELS.length, 6);
assert.deepEqual([...NOTE_VISIBILITIES], ['internal', 'shareable']);
assert.deepEqual([...ATTRIBUTION_LEVELS], ['authoritative', 'unverified', 'unavailable']);
assert.equal(MIN_AGGREGATE_COUNT, 5);
assert.ok(HANDOFF_READY_STAGES.every((s) => PROSPECT_STAGES.includes(s)));
assert.ok(COMMISSION_BEARING_STATES.every((s) => CONTRACT_STATES.includes(s)));
// The threshold boundary is exact and matches the stated rule ("below this count").
assert.equal(discloseMetric(4, 'authoritative').disclosed, false);
assert.equal(discloseMetric(MIN_AGGREGATE_COUNT, 'authoritative').disclosed, true);

// --- unknown input degrades honestly, never optimistically -----------------
const unknown = normalizeProspect({});
assert.equal(unknown.stage, 'source_unavailable');
assert.equal(unknown.contract.state, 'none');
assert.equal(unknown.demand.attribution, 'unavailable');
assert.equal(unknown.courseName, 'Unverified course');

// --- commission is fail-closed: signed AND effective-dated AND activated ---
const effectiveContract = { state: 'effective', signed: true, effectiveFrom: '2026-07-01', activatedAt: '2026-07-05', commissionBps: 300 };
assert.equal(commissionState(effectiveContract, '2026-08-15').effective, true);
assert.equal(commissionState(effectiveContract, '2026-08-15').commissionBps, 300);
// Each gate is isolated by holding the contract state commission-bearing.
const bearing = (extra) => commissionState({ state: 'effective', ...extra }, '2026-08-15').reason;
assert.equal(commissionState({}, '2026-08-15').reason, 'contract_state_not_commission_bearing');
assert.equal(bearing({}), 'no_signed_agreement');
assert.equal(bearing({ signed: true }), 'no_effective_date');
assert.equal(bearing({ signed: true, effectiveFrom: '2026-09-01' }), 'not_yet_effective');
assert.equal(bearing({ signed: true, effectiveFrom: '2026-01-01', effectiveUntil: '2026-06-30' }), 'agreement_lapsed');
assert.equal(bearing({ signed: true, effectiveFrom: '2026-07-01', commissionBps: 300 }), 'activation_not_verified');
assert.equal(commissionState({ ...effectiveContract, commissionBps: null }, '2026-08-15').reason, 'no_agreed_rate');
assert.equal(commissionState(effectiveContract, 'not-a-date').reason, 'invalid_evaluation_date');
// A commission must AGREE with the recorded contract state, never contradict it.
for (const state of ['none', 'declined', 'lapsed', 'pilot_proposed', 'agreement_sent', 'source_unavailable']) {
  const contradicting = commissionState({ ...effectiveContract, state }, '2026-08-15');
  assert.equal(contradicting.effective, false, `state "${state}" must not yield an effective commission`);
  assert.equal(contradicting.reason, 'contract_state_not_commission_bearing');
  assert.equal(invoiceEligibility({ contract: { ...effectiveContract, state } }, '2026-08-15').invoiceAllowed, false, `state "${state}" must not permit an invoice`);
}
for (const state of ['signed_pending_effective', 'pilot_active', 'effective']) assert.equal(commissionState({ ...effectiveContract, state }, '2026-08-15').effective, true, `state "${state}" must remain commission-bearing`);
// Dates are validated as real calendar days, not merely ISO-shaped strings.
for (const bad of ['0000-00-00', '2026-13-01', '2026-02-30', '2026-00-10']) {
  assert.equal(commissionState({ ...effectiveContract, effectiveFrom: bad }, '2026-08-15').reason, 'no_effective_date', `${bad} must not pass as an effective date`);
  assert.equal(commissionState(effectiveContract, bad).reason, 'invalid_evaluation_date', `${bad} must not pass as an evaluation date`);
}
// Admin reports the recorded state; it never owns it.
assert.equal(commissionState(effectiveContract, '2026-08-15').authority, 'partner-onboarding-domain');

// --- an unsigned course receives opportunity evidence, never an invoice ----
const unsigned = normalizeProspect({ id: 'p1', courseName: 'Riverbend', country: 'Thailand', stage: 'contacted', contactLocale: 'th', lastContactedAt: '2026-08-04', nextFollowUpAt: '2026-08-10' });
const signed = normalizeProspect({ id: 'p2', courseName: 'Coastal', country: 'Thailand', stage: 'signed', contract: effectiveContract });
assert.equal(invoiceEligibility(unsigned, '2026-08-15').invoiceAllowed, false);
assert.equal(invoiceEligibility(unsigned, '2026-08-15').entitlement, 'opportunity_evidence_only');
assert.match(invoiceEligibility(unsigned, '2026-08-15').notice, /never|No invoice/i);
assert.equal(invoiceEligibility(signed, '2026-08-15').invoiceAllowed, true);
assert.equal(invoiceEligibility(signed, '2026-08-15').entitlement, 'commission_invoice_permitted');

// --- aggregate disclosure protects individual movement --------------------
assert.equal(discloseMetric(4, 'authoritative').reason, 'suppressed_low_volume');
assert.equal(discloseMetric(9, 'authoritative').disclosed, true);
assert.equal(discloseMetric(9, 'unverified', { requireAuthoritative: true }).reason, 'not_authoritatively_attributed');
assert.equal(discloseMetric(9, 'unavailable').reason, 'source_unavailable');
assert.equal(discloseMetric(null, 'authoritative').reason, 'not_recorded');
assert.equal(discloseMetric(9, 'authoritative').value, 9);

// --- shareable artifacts carry no internal field and no internal note -----
const withSecrets = shareableProspect({ id: 'p3', courseName: 'Highland', contactEmail: 'ops@example.invalid', contactPhone: '+66000000', internalNotes: 'internal qualification', owner: 'Acquisition desk', history: [{ at: '2026-01-01', visibility: 'internal', summary: 'private note' }, { at: '2026-01-02', visibility: 'shareable', summary: 'meeting held' }] });
const serialized = JSON.stringify(withSecrets);
for (const field of INTERNAL_ONLY_FIELDS) assert.ok(!Object.hasOwn(withSecrets, field), `shareable payload leaked ${field}`);
assert.doesNotMatch(serialized, /ops@example\.invalid|\+66000000|internal qualification|private note|Acquisition desk/);
assert.equal(withSecrets.history.length, 1);
assert.equal(withSecrets.history[0].summary, 'meeting held');
// Internal notes are withheld rather than silently dropped from the registry view.
assert.equal(normalizeProspect({ history: [{ visibility: 'internal', summary: 'secret' }] }).history[0].summary, 'Internal note withheld');
// Free text in ANY shareable field is screened, not just the fields we expected to be risky.
for (const field of ['courseName', 'country', 'region', 'contactRole']) {
  for (const hostile of ['reach ops@course.example', 'call +66812345678', 'home 13.7563,100.5018', 'host 203.150.19.44', 'id 66812345678']) {
    const screened = shareableProspect({ id: 'p9', [field]: hostile });
    assert.equal(screened[field], WITHHELD_FREE_TEXT, `${field} leaked hostile free text: ${hostile}`);
  }
}
// A shareable history summary is screened too, and the demand source is exposed only screened.
assert.equal(shareableProspect({ id: 'p9', history: [{ visibility: 'shareable', summary: 'met ops@course.example' }] }).history[0].summary, WITHHELD_FREE_TEXT);
assert.equal(shareableProspect({ id: 'p9', demand: { source: 'ledger for somchai@x.example' } }).demandSource, WITHHELD_FREE_TEXT);
assert.equal(shareableProspect({ id: 'p9', demand: { source: 'Attributed booking ledger' } }).demandSource, 'Attributed booking ledger');
// The screen must not fire on ordinary business text or ISO dates.
assert.equal(shareableProspect({ id: 'p9', courseName: 'Riverbend Golf Club' }).courseName, 'Riverbend Golf Club');
assert.equal(containsPersonalData('2026-08-15'), false);
assert.equal(containsPersonalData('2026-08-15T00:00:00.000Z'), false);
assert.equal(containsPersonalData(66812345678), true, 'numeric values must be screened, not only strings');

// --- conversion handoff never grants partner status -----------------------
const blocked = conversionHandoff(unsigned);
assert.equal(blocked.eligible, false);
assert.match(blocked.blockedReason, /not a handoff-ready stage/);
const ready = conversionHandoff(signed);
assert.equal(ready.eligible, true);
assert.equal(ready.targetPipeline, 'partner_submissions');
assert.equal(ready.targetStatus, 'draft');
assert.equal(ready.partnerStatusGranted, false);
assert.equal(ready.provisioningAuthority, 'staff');
assert.equal(ready.submissionAvailable, false);
assert.match(ready.notice, /Preview only/);

// --- filtering, sorting and summary --------------------------------------
const rows = [unsigned, signed];
assert.deepEqual(filterProspects(rows, { query: 'riverbend' }).map((r) => r.id), ['p1']);
assert.deepEqual(filterProspects(rows, { stage: 'signed' }).map((r) => r.id), ['p2']);
assert.deepEqual(filterProspects(rows, { contract: 'effective' }).map((r) => r.id), ['p2']);
assert.deepEqual(filterProspects(rows, { locale: 'th' }).map((r) => r.id), ['p1']);
assert.deepEqual(filterProspects(rows, { sort: 'course' }).map((r) => r.id), ['p2', 'p1']);
const summary = acquisitionSummary(rows, '2026-08-15');
assert.equal(summary.total, 2);
assert.equal(summary.invoiceable, 1);
assert.equal(summary.opportunityEvidenceOnly, 1);
assert.equal(summary.followUpsDue, 1);

// --- source contracts ----------------------------------------------------
const model = read('../src/components/admin/v2/courseAcquisitionModel.mjs');
const types = read('../src/components/admin/v2/courseAcquisitionModel.d.mts');
const provider = read('../src/components/admin/v2/courseAcquisitionProvider.ts');
const ui = read('../src/components/admin/v2/V2CourseAcquisition.tsx');
const css = read('../src/components/admin/v2/V2CourseAcquisition.css');
const app = read('../src/App.tsx');
const canonical = read('../src/i18n/locales.ts');

// The canonical eight-locale set stays single-sourced in src/i18n/locales.ts.
const canonicalCodes = canonical.match(/LOCALE_CODES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
assert.equal(canonicalCodes.length, 8);
assert.doesNotMatch(model + types + provider + ui, /\[\s*'en'\s*,\s*'th'\s*,\s*'ko'/);
assert.match(ui, /import \{ LOCALE_CODES[^}]*\} from "\.\.\/\.\.\/\.\.\/i18n\/locales"/);
assert.match(types, /import type\{CanonicalLocale\}from'\.\.\/\.\.\/\.\.\/i18n\/locales'/);

// Route: mounted inside the existing eight-area allowlist, no new area.
assert.match(app, /activeArea === 'partners' && <V2CourseAcquisition/);

// No client authority, no transport, no message delivery — screened across the MODEL too,
// not only the UI, and covering every egress primitive rather than just fetch.
assert.doesNotMatch(codeOnly(model + ui + provider), /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|sendEmail|nodemailer|smtp|mailto:|<form\s+action/i);
assert.match(provider, /outreachService:null/);
assert.match(provider, /handoffService:null/);
assert.match(provider, /source:'local-preview'/);

// Honest vocabulary: no claimed delivery, approval, payment or attribution.
assert.doesNotMatch(ui + provider, /email sent|account created|partner approved|invoice raised|notification sent|delivered successfully|transmission successful/i);
assert.match(ui, /never an invoice/);
assert.match(ui, /Submit handoff unavailable/);
assert.match(ui, /internal notes withheld/i);
assert.match(ui, /navigator\.clipboard\.writeText/);
assert.match(ui, /aria-modal="true"/);
assert.match(ui, /useDialogFocus/);
assert.match(ui, /onKeyDown=\{\(event\)/);

// Responsive and accessible boundaries.
assert.match(css, /@media\(max-width:700px\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /min-height:44px/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Course acquisition verification PASS: stages/contract states, fail-closed commission gating, unsigned-course invoice prohibition, aggregate suppression, shareable-payload redaction, non-granting conversion handoff, single-sourced locales, route, no-write/no-transport and responsive boundaries.');
