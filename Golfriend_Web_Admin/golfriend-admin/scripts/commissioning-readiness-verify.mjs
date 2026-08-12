import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAPABILITY_IDS,
  COMMISSIONING_CONTRACTS,
  COMMISSIONING_LOCALES,
  COMMISSIONING_REGISTRY,
  DEFAULT_COMMISSIONING_ADAPTERS,
  exportCommissioningRegistry,
  validateCommissioningRegistry,
  validateJHCCTransmissionEnvelope,
} from '../src/components/admin/v2/commissioningContracts.ts';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const expectedIds = ['marketing.asset-storage','partners.request-intake','partners.decision-submit','courses.preview-apply','booking.report-ingest','advertising-oem.report-ingest','service-health.report-ingest','jhcc.report-transmit'];
assert.deepEqual(COMMISSIONING_LOCALES, ['en','th','ko','ja','zh','es','fr','de']);
assert.deepEqual(CAPABILITY_IDS, expectedIds);
assert.equal(new Set(CAPABILITY_IDS).size, 8);
assert.equal(COMMISSIONING_CONTRACTS.length, 8);
assert.deepEqual(COMMISSIONING_CONTRACTS.map((contract) => contract.capabilityId), expectedIds);
for (const contract of COMMISSIONING_CONTRACTS) {
  assert.equal(contract.schema.version, 1);
  assert.match(contract.schema.name, /^golfriend\.admin\./);
  for (const field of ['inputType','outputType','errors','authorization','idempotency','auditEvent','localeHandling','dataClassification','retryPolicy','timeoutMs','unavailableBehavior','readinessPrerequisites','prohibitedBehavior']) assert.ok(contract[field], `${contract.capabilityId} missing ${field}`);
  assert.ok(contract.timeoutMs > 0);
}
assert.ok(COMMISSIONING_CONTRACTS.filter((contract) => ['marketing.asset-storage','partners.decision-submit','courses.preview-apply','jhcc.report-transmit'].includes(contract.capabilityId)).every((contract) => /idempotency/i.test(contract.idempotency)));
assert.deepEqual(Object.keys(DEFAULT_COMMISSIONING_ADAPTERS), expectedIds);
assert.ok(Object.values(DEFAULT_COMMISSIONING_ADAPTERS).every((adapter) => adapter === null));
assert.deepEqual(validateCommissioningRegistry(), []);
const duplicateRegistry = [...COMMISSIONING_REGISTRY.slice(0, -1), COMMISSIONING_REGISTRY[0]];
assert.deepEqual(validateCommissioningRegistry(duplicateRegistry), ['Duplicate capability ID','Capability set mismatch']);
const unsupportedRegistry = COMMISSIONING_REGISTRY.map((entry, index) => index === 0 ? { ...entry, currentState:'future_state' } : entry);
assert.match(validateCommissioningRegistry(unsupportedRegistry).join(' '), /unsupported readiness state/);
const missingEvidenceRegistry = COMMISSIONING_REGISTRY.map((entry, index) => index === 0 ? { ...entry, sourceEvidence:'' } : entry);
assert.match(validateCommissioningRegistry(missingEvidenceRegistry).join(' '), /lacks source evidence/);
const falselyCommissionedRegistry = COMMISSIONING_REGISTRY.map((entry, index) => index === 0 ? { ...entry, currentState:'commissioned' } : entry);
assert.match(validateCommissioningRegistry(falselyCommissionedRegistry).join(' '), /lacks commissioned evidence/);
assert.ok(COMMISSIONING_REGISTRY.every((entry) => entry.currentState !== 'commissioned'));
assert.ok(COMMISSIONING_REGISTRY.every((entry) => entry.lastVerifiedBuild === 'B5-R9@5785be1'));
assert.ok(COMMISSIONING_REGISTRY.find((entry) => entry.capabilityId === 'partners.decision-submit').blockedActions.includes('Approve or decline'));
assert.match(COMMISSIONING_REGISTRY.find((entry) => entry.capabilityId === 'courses.preview-apply').blockedActions.join(' '), /mismatched preview\/course IDs/);
assert.match(COMMISSIONING_REGISTRY.find((entry) => entry.capabilityId === 'service-health.report-ingest').blockedActions.join(' '), /Infer healthy/);
assert.match(COMMISSIONING_REGISTRY.find((entry) => entry.capabilityId === 'advertising-oem.report-ingest').blockedActions.join(' '), /campaign delivery/);
assert.match(COMMISSIONING_REGISTRY.find((entry) => entry.capabilityId === 'jhcc.report-transmit').blockedActions.join(' '), /Send automatically/);
assert.ok(Object.isFrozen(COMMISSIONING_REGISTRY));
assert.ok(COMMISSIONING_REGISTRY.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.allowedActions)));
assert.equal(exportCommissioningRegistry(), exportCommissioningRegistry());
assert.deepEqual(JSON.parse(exportCommissioningRegistry()).map((entry) => entry.capability_id), expectedIds);
assert.deepEqual(validateJHCCTransmissionEnvelope({ schema:'golfriend.admin.operations-report.v1', version:1, payload:{}, confirmationId:'preview-confirmation', idempotencyKey:'stable-key' }), []);
assert.deepEqual(validateJHCCTransmissionEnvelope({ schema:'other', version:2 }), ['Unsupported report schema','Unsupported report version','Confirmation is required','Idempotency key is required','Payload is required']);

const contracts = read('src/components/admin/v2/commissioningContracts.ts');
const ui = read('src/components/admin/v2/CommissioningReadiness.tsx');
const css = read('src/components/admin/v2/CommissioningReadiness.css');
const reports = read('src/components/admin/v2/V2AdminReports.tsx');
const course = read('src/components/admin/v2/V2CourseOperations.tsx');
assert.doesNotMatch(contracts + ui + reports, /api[_-]?key|client[_-]?secret|Bearer\s+|https?:\/\//i);
assert.doesNotMatch(contracts + ui + reports, /firebase|firestore|httpsCallable|fetch\s*\(|XMLHttpRequest|sendEmail|setInterval\s*\(/i);
assert.doesNotMatch(contracts + ui, /\bar\b|Arabic/i);
for (const locale of COMMISSIONING_LOCALES) assert.match(ui, new RegExp(`\\n  ${locale}:`));
assert.match(contracts, /Golfriend sells tee times or processes tee-time payments/);
assert.match(contracts, /Unknown must never be converted to healthy/);
assert.match(course, /preview\?\.results\.filter\(\(row\)=>row\.result==='updated'\)/);
assert.doesNotMatch(course, /service\.sync\(\{mode:'apply',limit\}\)/);
assert.match(ui, /<table>/);
assert.match(ui, /scope="col"/);
assert.match(ui, /scope="row"/);
assert.match(ui, /tabIndex=\{0\}/);
assert.match(css, /:focus-visible/);
assert.match(css, /min-height:44px/);
assert.match(css, /overflow-x:auto/);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(reports, /<CommissioningReadiness\s*\/>/);
console.log('B5-R9 commissioning readiness verification PASS: exact contracts/locales/IDs, fail-closed adapters, truthful immutable registry, deterministic export, JHCC validation, authority boundaries, course binding, health honesty, and accessible responsive UI.');
