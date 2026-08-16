// B5-R14 — Admin-side end-to-end acceptance harness for the mounted acquisition capabilities.
// Path under test: operator command → authorization → adapter → transmitter → receipt.
// PREVIEW ADAPTERS ONLY. No real provider, credential, endpoint, email, transmission,
// production data, emulator or device is involved.
import assert from 'node:assert/strict';

import { capabilityAvailability, MOUNTED_CAPABILITIES, runCapabilityCommand, runConversionHandoff } from '../src/components/admin/v2/acquisitionOperations.mjs';
import { createPreviewAdapters, PREVIEW_SCENARIOS, PRODUCTION_ACQUISITION_ADAPTERS, STALE_AUTHORIZATION } from '../src/components/admin/v2/previewAcquisitionAdapters.mjs';
import { createReceiptLedger, receiptIsMinimal, RECEIPT_FIELDS, RECEIPT_SCHEMA } from '../src/components/admin/v2/acquisitionReceipts.mjs';
import { buildAcquisitionReport, JHCC_ACQUISITION_AUTHORIZATION } from '../src/components/admin/v2/acquisitionReportingModel.mjs';
import { renderOutreachTemplate } from '../src/components/admin/v2/courseOpportunityModel.mjs';
import { claimsProductionEffect, PREVIEW_PERMITTED_STATES } from '../src/components/admin/v2/acquisitionAdapterStates.mjs';

const period = { start: '2026-07-01', end: '2026-07-31' };
const at = '2026-08-15';
const prospects = [{ id: 'preview-h1', courseName: 'Riverbend Golf Club', courseId: 'preview-course-riverbend', country: 'Thailand', region: 'Chonburi', stage: 'signed', contactRole: 'Course operations manager', contactLocale: 'th', demand: { attribution: 'authoritative', source: 'Preview attributed source', searchInterest: 41, bookingInterest: 12, confirmedBookings: 9 } }];
const report = buildAcquisitionReport({ prospects, period, generatedAt: '2026-08-15T00:00:00.000Z', evaluationDate: at });
const draft = renderOutreachTemplate({ kind: 'invitation', locale: 'en', prospect: prospects[0] });
const results = [];
const record = (label, ok, detail) => { results.push({ label, ok, detail }); if (!ok) console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); else console.log(`  ✓ ${label}`); };

console.log('\nAcquisition acceptance harness — preview adapters only\n');

// --- 1. Production adapters are unmounted -------------------------------
const production = capabilityAvailability(PRODUCTION_ACQUISITION_ADAPTERS);
record('every adapter-backed capability reports unconfigured against the null production map', production.length === 4 && production.filter((c) => c.adapterId !== null).every((c) => c.state === 'unconfigured' && c.mounted === false));
record('the adapterless capability is honestly local-generation, not silently adapter-backed', production.find((c) => c.adapterId === null)?.reason === 'local_generation_no_adapter');
record('every adapter-backed capability maps to a distinct adapter', new Set(MOUNTED_CAPABILITIES.filter((c) => c.adapterId).map((c) => c.adapterId)).size === 3);
record('each capability declares the operation it performs', MOUNTED_CAPABILITIES.every((c) => typeof c.operation === 'string' && c.operation.length > 0));

// --- 2. Every scenario, end to end, across all four capabilities --------
const observed = new Map();
for (const scenario of PREVIEW_SCENARIOS) {
  const adapters = createPreviewAdapters(scenario);
  const ledger = createReceiptLedger();
  const authorization = scenario === 'stale_authorization' ? STALE_AUTHORIZATION : JHCC_ACQUISITION_AUTHORIZATION;
  const commands = [
    ['acquisition.prospect-registry', { limit: 2 }],
    ['acquisition.outreach-tracking', { draft, recipientSelected: true, humanApproved: true }],
    ['acquisition.opportunity-report', {}],
    ['acquisition.analytics', { report, authorization, evaluationDate: at, confirmed: true }],
  ];
  const states = [];
  for (const [capabilityId, input] of commands) {
    const outcome = await runCapabilityCommand({ capabilityId, adapters, ledger, mode: 'preview', idempotencyKey: `${scenario}:${capabilityId}`, issuedAt: '2026-08-15T00:00:00.000Z', input });
    states.push(`${capabilityId}=${outcome.state}`);
    // Requirement 6: a preview run may never reach a state that asserts production effect.
    record(`[${scenario}] ${capabilityId} stays within the preview state set (${outcome.state})`, PREVIEW_PERMITTED_STATES.includes(outcome.state) && !claimsProductionEffect(outcome.state), outcome.state);
    // Requirement 13: every command yields an immutable, minimal, preview-explicit receipt.
    record(`[${scenario}] ${capabilityId} receipt is minimal, frozen and preview-explicit`, Boolean(outcome.receipt) && receiptIsMinimal(outcome.receipt) && Object.isFrozen(outcome.receipt) && outcome.receipt.previewOnly === true && outcome.receipt.productionDeliveryClaimed === false && outcome.receipt.schema === RECEIPT_SCHEMA);
    // Requirement 9: no identity, contact detail or free text may reach a receipt.
    record(`[${scenario}] ${capabilityId} receipt carries no identity or free text`, !/Riverbend|Chonburi|preview-course-riverbend|preview-h1|operations manager/i.test(JSON.stringify(outcome.receipt)));
  }
  observed.set(scenario, states.join(' '));
}

// --- 3. Each required scenario produced its distinctive outcome ---------
const outcomeOf = (scenario, capabilityId) => observed.get(scenario).split(' ').find((entry) => entry.startsWith(capabilityId)).split('=')[1];
record('accept: the registry serves rows in preview only', outcomeOf('accept', 'acquisition.prospect-registry') === 'preview_only');
record('approval_queue: outreach halts awaiting human approval', outcomeOf('approval_queue', 'acquisition.outreach-tracking') === 'awaiting_human_approval');
record('reject: an adapter decline is reported as rejected, not unavailable', outcomeOf('reject', 'acquisition.outreach-tracking') === 'rejected', outcomeOf('reject', 'acquisition.outreach-tracking'));
record('exception: an adapter fault is contained as unavailable', outcomeOf('exception', 'acquisition.prospect-registry') === 'unavailable');
record('malformed: a malformed response is rejected, never accepted', outcomeOf('malformed', 'acquisition.prospect-registry') === 'rejected');
record('missing_transmitter: JHCC reports unconfigured with no delivery', outcomeOf('missing_transmitter', 'acquisition.analytics') === 'unconfigured');
record('stale_authorization: an out-of-window authorization is rejected', outcomeOf('stale_authorization', 'acquisition.analytics') === 'rejected');

// --- 4. Duplicate / replayed command is idempotent ----------------------
const replayAdapters = createPreviewAdapters('duplicate_command');
const replayLedger = createReceiptLedger();
const first = await runCapabilityCommand({ capabilityId: 'acquisition.prospect-registry', adapters: replayAdapters, ledger: replayLedger, idempotencyKey: 'replay-key', issuedAt: 'T1', input: { limit: 1 } });
const second = await runCapabilityCommand({ capabilityId: 'acquisition.prospect-registry', adapters: replayAdapters, ledger: replayLedger, idempotencyKey: 'replay-key', issuedAt: 'T2', input: { limit: 1 } });
record('duplicate_command: a replay returns the original receipt id', first.receipt.receiptId === second.receipt.receiptId);
record('duplicate_command: the replay is flagged and the original issue time is preserved', second.receipt.replayed === true && second.receipt.issuedAt === 'T1');
record('duplicate_command: the ledger does not double-count', replayLedger.size() === 1);
record('duplicate_command: the ledger readout is frozen against caller mutation', Object.isFrozen(replayLedger.list()) && Object.isFrozen(replayLedger.list()[0]));

// --- 5. Delivery requires all three conditions, never authorization alone
const mounted = createPreviewAdapters('accept');
const jhccOk = await runCapabilityCommand({ capabilityId: 'acquisition.analytics', adapters: mounted, ledger: createReceiptLedger(), idempotencyKey: 'gate-1', issuedAt: 'T', input: { report, authorization: JHCC_ACQUISITION_AUTHORIZATION, evaluationDate: at, confirmed: true } });
record('all three delivery conditions satisfied under a mounted preview transmitter', jhccOk.gate.deliverable === true && jhccOk.gate.unmet.length === 0);
record('an approved authorization alone never delivers: preview still yields preview_only', jhccOk.state === 'preview_only' && jhccOk.receipt.productionDeliveryClaimed === false);
const noTransmitter = await runCapabilityCommand({ capabilityId: 'acquisition.analytics', adapters: createPreviewAdapters('missing_transmitter'), ledger: createReceiptLedger(), idempotencyKey: 'gate-2', issuedAt: 'T', input: { report, authorization: JHCC_ACQUISITION_AUTHORIZATION, evaluationDate: at, confirmed: true } });
record('a missing transmitter blocks delivery despite a valid authorization', noTransmitter.state === 'unconfigured');
const unconfirmed = await runCapabilityCommand({ capabilityId: 'acquisition.analytics', adapters: mounted, ledger: createReceiptLedger(), idempotencyKey: 'gate-3', issuedAt: 'T', input: { report, authorization: JHCC_ACQUISITION_AUTHORIZATION, evaluationDate: at, confirmed: false } });
record('an unconfirmed command is rejected before the transmitter is reached', unconfirmed.state === 'rejected');

// --- 6. JHCC receives aggregate counts only -----------------------------
record('the JHCC gate screened a payload carrying no identity or narrative', jhccOk.screen.valid === true && !/Riverbend|Chonburi|preview-course-riverbend|contactRole|history/i.test(JSON.stringify(jhccOk.screen.screened)));

// --- 7. A conversion claim of active_partner stays informational -------
// Conversion is its own explicit operation, not a side effect of the report card.
const converted = await runConversionHandoff({ adapters: mounted, ledger: createReceiptLedger(), idempotencyKey: 'conv-1', issuedAt: 'T', prospect: prospects[0] });
record('a conversion adapter claiming active_partner grants no partner status', converted.value.partnerStatusGranted === false && converted.value.provisioningAuthority === 'staff' && !/active_partner/.test(JSON.stringify(converted)));
record('the opportunity-report card generates locally and submits nothing', (await runCapabilityCommand({ capabilityId: 'acquisition.opportunity-report', adapters: mounted, ledger: createReceiptLedger(), idempotencyKey: 'op-1', issuedAt: 'T', input: {} })).value.generatedLocally === true);

// --- 8. Receipt shape is exactly the minimum-necessary set --------------
record('receipt field set is exactly the declared minimum', Object.keys(converted.receipt).length === RECEIPT_FIELDS.length && Object.keys(converted.receipt).every((key) => RECEIPT_FIELDS.includes(key)));

const failed = results.filter((entry) => !entry.ok);
console.log(`\nAcceptance harness: ${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) { console.error('Acceptance harness FAILED.'); process.exit(1); }
console.log('Acquisition acceptance harness PASS: preview-only end-to-end path across eight scenarios — command, authorization, adapter, transmitter gate and immutable idempotent receipt.');
