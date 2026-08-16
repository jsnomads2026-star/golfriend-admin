// B5-R14 — mounted acquisition capabilities: state model, receipts, UI contract.
// Behavioural assertions plus source-contract assertions on the mounted Admin surface.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ADAPTER_STATE_COPY,
  ADAPTER_UI_STATES,
  adapterStateLabel,
  claimsProductionEffect,
  classifyAdapterOutcome,
  deliverabilityState,
  PREVIEW_PERMITTED_STATES,
  REJECTION_CODES,
} from '../src/components/admin/v2/acquisitionAdapterStates.mjs';
import { createReceiptLedger, issueReceipt, RECEIPT_FIELDS, RECEIPT_SCHEMA, receiptIsMinimal } from '../src/components/admin/v2/acquisitionReceipts.mjs';
import { capabilityAvailability, MOUNTED_CAPABILITIES, runCapabilityCommand } from '../src/components/admin/v2/acquisitionOperations.mjs';
import { createPreviewAdapters, PREVIEW_SCENARIOS, PRODUCTION_ACQUISITION_ADAPTERS } from '../src/components/admin/v2/previewAcquisitionAdapters.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// --- the seven states are distinct and complete -------------------------
assert.deepEqual([...ADAPTER_UI_STATES], ['unconfigured', 'unavailable', 'preview_only', 'awaiting_human_approval', 'rejected', 'accepted_by_adapter', 'delivery_confirmed']);
assert.equal(new Set(ADAPTER_UI_STATES).size, 7);
assert.deepEqual([...PREVIEW_PERMITTED_STATES], ['unconfigured', 'unavailable', 'preview_only', 'awaiting_human_approval', 'rejected']);
assert.ok(PREVIEW_PERMITTED_STATES.every((state) => !claimsProductionEffect(state)), 'no preview-permitted state may assert production effect');
assert.equal(claimsProductionEffect('accepted_by_adapter'), true);
assert.equal(claimsProductionEffect('delivery_confirmed'), true);

// --- classification: unconfigured vs unavailable vs rejected ------------
assert.equal(classifyAdapterOutcome({ resolution: { available: false, reason: 'adapter_unavailable' } }), 'unconfigured');
assert.equal(classifyAdapterOutcome({ resolution: { available: false, reason: 'adapter_malformed' } }), 'unavailable');
assert.equal(classifyAdapterOutcome({ resolution: { available: false, reason: 'unknown_adapter' } }), 'unavailable');
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: false, error: { code: 'ADAPTER_UNAVAILABLE' } } }), 'unavailable');
for (const code of REJECTION_CODES) assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: false, error: { code } } }), 'rejected', `${code} must classify as rejected`);
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: { state: 'queued_for_human_approval' } } }), 'awaiting_human_approval');
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: {} } }), 'preview_only');
// Production effect is unreachable from preview mode, whatever the adapter reports.
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: {} }, mode: 'preview', deliveryConfirmed: true }), 'preview_only');
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: {} }, mode: 'production' }), 'accepted_by_adapter');
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: {} }, mode: 'production', deliveryConfirmed: true }), 'delivery_confirmed');
// An unrecognised mode falls back to preview rather than to production.
assert.equal(classifyAdapterOutcome({ resolution: { available: true }, result: { ok: true, value: {} }, mode: 'live', deliveryConfirmed: true }), 'preview_only');

// --- deliverability needs all three conditions --------------------------
assert.equal(deliverabilityState({ screenValid: true, authorized: true, transmitterMounted: true }).deliverable, true);
for (const missing of ['screenValid', 'authorized', 'transmitterMounted']) {
  const conditions = { screenValid: true, authorized: true, transmitterMounted: true, [missing]: false };
  const gate = deliverabilityState(conditions);
  assert.equal(gate.deliverable, false, `${missing} must block delivery`);
  assert.deepEqual(gate.unmet, [missing]);
}
assert.equal(deliverabilityState({ authorized: true }).deliverable, false, 'authorization alone must never deliver');
assert.equal(deliverabilityState().deliverable, false);

// --- receipts: immutable, minimal, idempotent, preview-explicit ---------
const receipt = issueReceipt({ capabilityId: 'acquisition.analytics', state: 'preview_only', mode: 'preview', idempotencyKey: 'ops@leak.example', issuedAt: 'T1' });
assert.ok(Object.isFrozen(receipt));
assert.equal(receipt.schema, RECEIPT_SCHEMA);
assert.equal(receipt.previewOnly, true);
assert.equal(receipt.productionDeliveryClaimed, false);
assert.ok(receiptIsMinimal(receipt));
assert.deepEqual(Object.keys(receipt).sort(), [...RECEIPT_FIELDS].sort());
// The idempotency key may carry operator text, so it is surrogated rather than stored.
assert.doesNotMatch(JSON.stringify(receipt), /ops@leak\.example/);
assert.match(receipt.commandRef, /^cmd-[0-9a-z]+$/);
// A preview command may never record a production effect.
assert.throws(() => issueReceipt({ capabilityId: 'x', state: 'delivery_confirmed', mode: 'preview', idempotencyKey: 'k', issuedAt: 'T' }));
assert.throws(() => issueReceipt({ capabilityId: 'x', state: 'accepted_by_adapter', mode: 'preview', idempotencyKey: 'k', issuedAt: 'T' }));
assert.throws(() => issueReceipt({ capabilityId: 'x', state: 'not_a_state', mode: 'preview', idempotencyKey: 'k', issuedAt: 'T' }));
// Only a production delivery_confirmed receipt may claim delivery.
assert.equal(issueReceipt({ capabilityId: 'x', state: 'delivery_confirmed', mode: 'production', idempotencyKey: 'k', issuedAt: 'T' }).productionDeliveryClaimed, true);
assert.equal(issueReceipt({ capabilityId: 'x', state: 'accepted_by_adapter', mode: 'production', idempotencyKey: 'k', issuedAt: 'T' }).productionDeliveryClaimed, false);

const ledger = createReceiptLedger();
const one = ledger.record({ capabilityId: 'acquisition.analytics', state: 'preview_only', idempotencyKey: 'k1', issuedAt: 'T1' });
const two = ledger.record({ capabilityId: 'acquisition.analytics', state: 'preview_only', idempotencyKey: 'k1', issuedAt: 'T2' });
assert.equal(one.receiptId, two.receiptId);
assert.equal(one.replayed, false);
assert.equal(two.replayed, true);
assert.equal(two.issuedAt, 'T1', 'a replay must preserve the original issue time');
assert.equal(ledger.size(), 1);
// A caller must not be able to mutate the ledger through its readout.
const readout = ledger.list();
assert.ok(Object.isFrozen(readout) && Object.isFrozen(readout[0]));
assert.throws(() => { 'use strict'; readout[0].state = 'delivery_confirmed'; });
assert.equal(ledger.list()[0].state, 'preview_only');

// --- mounted capabilities and production adapters ----------------------
assert.equal(MOUNTED_CAPABILITIES.length, 4);
assert.deepEqual(MOUNTED_CAPABILITIES.map((entry) => entry.capabilityId), ['acquisition.prospect-registry', 'acquisition.opportunity-report', 'acquisition.analytics', 'acquisition.outreach-tracking']);
assert.ok(Object.values(PRODUCTION_ACQUISITION_ADAPTERS).every((adapter) => adapter === null), 'production adapters must remain null');
// Each capability declares the operation it performs, so a card cannot be labelled as one
// thing while doing another. Opportunity evidence is generated LOCALLY and has no adapter:
// it must not be backed by a state-changing conversion submission.
assert.deepEqual(MOUNTED_CAPABILITIES.map((entry) => entry.adapterId), ['acquisition.data-source', null, 'acquisition.jhcc-transmitter', 'acquisition.outreach-delivery']);
assert.deepEqual(MOUNTED_CAPABILITIES.map((entry) => entry.operation), ['load_registry_rows', 'generate_evidence_locally', 'transmit_aggregate_to_jhcc', 'queue_draft_for_approval']);
const productionAvailability = capabilityAvailability(PRODUCTION_ACQUISITION_ADAPTERS);
// Every adapter-backed capability is unconfigured against the null production map.
assert.ok(productionAvailability.filter((entry) => entry.adapterId !== null).every((entry) => entry.state === 'unconfigured' && entry.mounted === false));
// The adapterless capability is honestly preview-only: local generation, no distribution.
const local = productionAvailability.find((entry) => entry.adapterId === null);
assert.equal(local.state, 'preview_only');
assert.equal(local.reason, 'local_generation_no_adapter');

// --- preview adapters are never production-approved --------------------
for (const scenario of PREVIEW_SCENARIOS) {
  for (const adapter of Object.values(createPreviewAdapters(scenario))) {
    if (adapter) assert.notEqual(adapter.productionApproved, true, `a preview adapter in "${scenario}" claimed production approval`);
  }
}
// A production run refuses without a production-approved adapter, and a preview run refuses
// to exercise one — so the mode always agrees with what is actually mounted.
const previewSet = createPreviewAdapters('accept');
const productionAttempt = await runCapabilityCommand({ capabilityId: 'acquisition.prospect-registry', adapters: previewSet, ledger: createReceiptLedger(), mode: 'production', idempotencyKey: 'm1', issuedAt: 'T', input: {} });
assert.equal(productionAttempt.state, 'rejected', 'a production run against a preview adapter must be refused');
assert.equal(productionAttempt.error.code, 'AUTHORIZATION_REQUIRED');
const approvedSet = { ...previewSet, 'acquisition.data-source': { productionApproved: true, label: 'approved', async load() { return []; } } };
const previewAttempt = await runCapabilityCommand({ capabilityId: 'acquisition.prospect-registry', adapters: approvedSet, ledger: createReceiptLedger(), mode: 'preview', idempotencyKey: 'm2', issuedAt: 'T', input: {} });
assert.equal(previewAttempt.state, 'rejected', 'a production-approved adapter must not be exercised in preview');
assert.equal(previewAttempt.error.code, 'AUTHORIZATION_REQUIRED');

// --- a replay whose outcome CHANGED must not return the earlier receipt --
const conflictLedger = createReceiptLedger();
const firstOutcome = conflictLedger.record({ capabilityId: 'acquisition.analytics', state: 'preview_only', idempotencyKey: 'c1', issuedAt: 'T1' });
const changed = conflictLedger.record({ capabilityId: 'acquisition.analytics', state: 'rejected', idempotencyKey: 'c1', issuedAt: 'T2' });
assert.equal(changed.state, 'rejected', 'a receipt must report the outcome that actually happened');
assert.equal(changed.supersedesReceiptId, firstOutcome.receiptId);
assert.equal(changed.replayed, false);
assert.equal(conflictLedger.history().length, 2, 'the superseded receipt is retained');

// --- adapter faults are contained, never escaping to the caller ---------
const hostileRow = { 'acquisition.data-source': { label: 'x', async load() { return [new Proxy({}, { get() { throw new Error('row getter exploded'); } })]; } } };
const contained = await runCapabilityCommand({ capabilityId: 'acquisition.prospect-registry', adapters: hostileRow, ledger: createReceiptLedger(), idempotencyKey: 'h1', issuedAt: 'T', input: {} });
assert.equal(contained.ok, false);
assert.equal(contained.state, 'rejected');
assert.doesNotMatch(contained.error.message, /Somchai|@/);
assert.equal(PREVIEW_SCENARIOS.length, 8);
assert.deepEqual([...PREVIEW_SCENARIOS], ['accept', 'approval_queue', 'reject', 'exception', 'malformed', 'missing_transmitter', 'stale_authorization', 'duplicate_command']);
// The missing-transmitter scenario really has no transmitter mounted.
assert.equal(createPreviewAdapters('missing_transmitter')['acquisition.jhcc-transmitter'], null);
assert.throws(() => createPreviewAdapters('not-a-scenario'));

// --- exact eight-locale state copy against the canonical source --------
const canonical = read('../src/i18n/locales.ts');
const canonicalCodes = canonical.match(/LOCALE_CODES = \[([^\]]+)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
assert.deepEqual(Object.keys(ADAPTER_STATE_COPY), canonicalCodes);
for (const locale of canonicalCodes) {
  for (const key of [...ADAPTER_UI_STATES, 'modePreview', 'modeProduction']) {
    const value = ADAPTER_STATE_COPY[locale][key];
    assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
    assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    if (locale !== 'en') assert.notEqual(value, ADAPTER_STATE_COPY.en[key], `${locale}.${key} duplicates English`);
  }
}
// An unknown locale falls back to the state id, never to English prose.
assert.equal(adapterStateLabel('rejected', 'xx'), 'rejected');
assert.equal(adapterStateLabel('rejected', 'th'), ADAPTER_STATE_COPY.th.rejected);

// --- source contracts on the mounted surface ---------------------------
const states = read('../src/components/admin/v2/acquisitionAdapterStates.mjs');
const receipts = read('../src/components/admin/v2/acquisitionReceipts.mjs');
const operations = read('../src/components/admin/v2/acquisitionOperations.mjs');
const preview = read('../src/components/admin/v2/previewAcquisitionAdapters.mjs');
const ui = read('../src/components/admin/v2/V2CourseAcquisition.tsx');
const reportUi = read('../src/components/admin/v2/V2AcquisitionReport.tsx');
const css = read('../src/components/admin/v2/V2CourseAcquisition.css');

// No locale set is redeclared; no transport exists anywhere in the mounted path.
assert.doesNotMatch(states + receipts + operations + preview, /\[\s*'en'\s*,\s*'th'\s*,\s*'ko'/);
assert.doesNotMatch(codeOnly(states + receipts + operations + preview + ui + reportUi), /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|sendEmail|nodemailer|smtp|mailto:|<form\s+action/i);
assert.doesNotMatch(codeOnly(preview), /https?:\/\//i, 'a preview adapter may not carry an endpoint');
assert.doesNotMatch(preview, /api[_-]?key|client[_-]?secret|private[_-]?key|Bearer\s/i);
// The UI mounts production adapters, never a preview set by default.
assert.match(ui, /adapters = PRODUCTION_ACQUISITION_ADAPTERS/);
assert.match(ui, /mode = "preview"/);
// The mounted panel renders every capability with its state and an accessible live region.
assert.match(ui, /MOUNTED_CAPABILITIES\.map/);
assert.match(ui, /adapterStateLabel\(/);
assert.match(ui, /data-capability=\{capabilityId\}/);
assert.match(ui, /data-state=\{state\}/);
assert.match(ui, /role="status" aria-live="polite"/);
assert.match(ui, /disabled=\{!mountState\?\.mounted\}/);
assert.match(ui, /No adapter mounted/);
// The reports surface states the three delivery conditions explicitly.
assert.match(reportUi, /Privacy screen:/);
assert.match(reportUi, /Authorization:/);
assert.match(reportUi, /Transmitter:/);
assert.match(reportUi, /An approved authorization\s*\n?\s*alone is never sufficient/);
assert.match(reportUi, /aria-live="polite"/);
// Responsive and accessible boundaries for the new panel.
assert.match(css, /\.acq-adapter-grid/);
assert.match(css, /min-height:44px/);
assert.match(css, /@media\(max-width:700px\)/);

console.log('Mounted acquisition capability verification PASS: seven distinct states, unconfigured/unavailable/rejected separation, production effect unreachable from preview, three-condition deliverability with authorization never sufficient, immutable minimal idempotent receipts with surrogated command refs, four capabilities mounted against null production adapters, eight deterministic preview scenarios, exact eight-locale state copy, no transport or credential material, and accessible responsive mounting.');
