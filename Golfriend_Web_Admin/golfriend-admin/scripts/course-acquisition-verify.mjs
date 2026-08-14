// B5-R10 — Enterprise course acquisition registry verification.
// Behavioural assertions on the pure model + source-contract assertions on the
// provider, UI, route and CSS. No emulator, no network, no deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  acquisitionSummary,
  ATTRIBUTION_LEVELS,
  CONTRACT_STATES,
  commissionState,
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
} from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// --- contracts -------------------------------------------------------------
assert.equal(PROSPECT_STAGES.length, 12);
assert.equal(CONTRACT_STATES.length, 9);
assert.equal(OUTREACH_CHANNELS.length, 6);
assert.deepEqual([...NOTE_VISIBILITIES], ['internal', 'shareable']);
assert.deepEqual([...ATTRIBUTION_LEVELS], ['authoritative', 'unverified', 'unavailable']);
assert.equal(MIN_AGGREGATE_COUNT, 5);
assert.ok(HANDOFF_READY_STAGES.every((s) => PROSPECT_STAGES.includes(s)));

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
assert.equal(commissionState({}, '2026-08-15').reason, 'no_signed_agreement');
assert.equal(commissionState({ signed: true }, '2026-08-15').reason, 'no_effective_date');
assert.equal(commissionState({ signed: true, effectiveFrom: '2026-09-01' }, '2026-08-15').reason, 'not_yet_effective');
assert.equal(commissionState({ signed: true, effectiveFrom: '2026-01-01', effectiveUntil: '2026-06-30' }, '2026-08-15').reason, 'agreement_lapsed');
assert.equal(commissionState({ signed: true, effectiveFrom: '2026-07-01', commissionBps: 300 }, '2026-08-15').reason, 'activation_not_verified');
assert.equal(commissionState({ ...effectiveContract, commissionBps: null }, '2026-08-15').reason, 'no_agreed_rate');
assert.equal(commissionState(effectiveContract, 'not-a-date').reason, 'invalid_evaluation_date');
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
assert.match(ui, /import \{ LOCALE_CODES \} from "\.\.\/\.\.\/\.\.\/i18n\/locales"/);
assert.match(types, /import type\{CanonicalLocale\}from'\.\.\/\.\.\/\.\.\/i18n\/locales'/);

// Route: mounted inside the existing eight-area allowlist, no new area.
assert.match(app, /activeArea === 'partners' && <V2CourseAcquisition/);

// No client authority, no transport, no message delivery from this surface.
assert.doesNotMatch(ui + provider, /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|fetch\s*\(|XMLHttpRequest|sendEmail/i);
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
