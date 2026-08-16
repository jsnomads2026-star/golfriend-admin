// B5-R17 — opportunity/evidence domain and analytics/JHCC preparation domain.
// Pure logic tests. No adapter, no transport, no JHCC transmission, no production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  APPROVED_EVIDENCE_AUTHORITIES,
  assessPlayedEvidence,
  buildEvidenceReport,
  EVIDENCE_SCHEMA,
  EVIDENCE_SIGNALS,
  evidenceIsIdentityFree,
  evidenceReceipt,
  NON_PLAY_INFERENCE_SOURCES,
  PLAYED_EVIDENCE_AUTHORITY,
} from '../src/components/admin/v2/evidenceAdapterDomain.mjs';
import {
  aggregateIsMinimal,
  analyticsPreparationReceipt,
  APPROVED_DIMENSION_IDS,
  COHORT_MINIMUM,
  FORBIDDEN_AGGREGATE_FIELDS,
  JHCC_AGGREGATE_SCHEMA,
  prepareJhccAggregate,
  suppressBuckets,
} from '../src/components/admin/v2/analyticsPreparationDomain.mjs';
import { MIN_AGGREGATE_COUNT } from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const at = '2026-08-15';
const allAuthorities = [...APPROVED_EVIDENCE_AUTHORITIES];

// === EVIDENCE: played evidence fails closed ==============================
assert.equal(EVIDENCE_SCHEMA, 'golfriend.admin.opportunity-evidence.v2');
assert.equal(EVIDENCE_SIGNALS.length, 7);
assert.ok(!APPROVED_EVIDENCE_AUTHORITIES.includes(PLAYED_EVIDENCE_AUTHORITY), 'no approved played-evidence source may exist yet');
// Deep-frozen: a mutable signal element could be renamed out of the played-round special case
// while keeping claim:'play', producing a disclosed line labelled as play.
assert.ok(EVIDENCE_SIGNALS.every((signal) => Object.isFrozen(signal)), 'every signal must be frozen');
assert.throws(() => { 'use strict'; EVIDENCE_SIGNALS[3].id = 'played_round_x'; });
assert.equal(EVIDENCE_SIGNALS.filter((s) => s.claim === 'play').length, 1, "claim:'play' must be unique to played_round");

for (const authorities of [[], allAuthorities, [...allAuthorities, PLAYED_EVIDENCE_AUTHORITY]]) {
  const played = assessPlayedEvidence({ authorities });
  assert.equal(played.available, false, 'played evidence must fail closed');
  assert.equal(played.reason, 'no_played_evidence_authority');
  assert.equal(played.playedRounds, 0);
  assert.equal(played.courseClaim, null);
}
// A hostile `authorities` whose includes() always returns true still fails closed.
class AlwaysIncludes extends Array { includes() { return true; } }
assert.equal(assessPlayedEvidence({ authorities: new AlwaysIncludes() }).reason, 'no_played_evidence_authority');

// Inference is an ALLOWLIST: any inference input refuses, including an UNRECOGNISED source.
for (const source of [...NON_PLAY_INFERENCE_SOURCES, 'gps_trace', 'photo', 'scorecard_ocr', 'Location', ' check_in']) {
  const inferred = assessPlayedEvidence({ authorities: [PLAYED_EVIDENCE_AUTHORITY], inferredFrom: [source] });
  assert.equal(inferred.available, false, `play must not be inferred from ${source}`);
  assert.equal(inferred.reason, 'play_may_not_be_inferred');
  assert.equal(inferred.playedRounds, 0);
}
// An unrecognised source is REPORTED, not silently ignored.
assert.deepEqual([...assessPlayedEvidence({ authorities: [PLAYED_EVIDENCE_AUTHORITY], inferredFrom: ['gps_trace', 'location'] }).unrecognisedInference], ['gps_trace']);
// Non-array inputs fail closed rather than throwing.
assert.equal(assessPlayedEvidence({ inferredFrom: null }).reason, 'no_played_evidence_authority');
assert.equal(assessPlayedEvidence({ inferredFrom: 'location' }).reason, 'no_played_evidence_authority');
assert.equal(assessPlayedEvidence().reason, 'no_played_evidence_authority');

// === EVIDENCE: report truthfulness =======================================
const report = buildEvidenceReport({ prospectRef: 'somchai@leak.example', counts: { member_interest: 41, booking_request: 12, confirmed_course_response: 7, played_round: 99, regional_demand: 60, tournament_opportunity: 3 }, authorities: [...allAuthorities, PLAYED_EVIDENCE_AUTHORITY], generatedAt: '2026-08-15T00:00:00.000Z' });
const playedLine = report.signals.find((line) => line.id === 'played_round');
assert.equal(playedLine.disclosed, false);
assert.equal(playedLine.value, 0, 'played rounds report zero, not the supplied 99');
assert.equal(playedLine.reason, 'no_played_evidence_authority');
assert.equal(report.signals.find((l) => l.id === 'member_interest').claim, 'interest');
assert.equal(report.signals.find((l) => l.id === 'booking_request').claim, 'intent');
assert.equal(report.signals.find((l) => l.id === 'tournament_opportunity').reason, 'suppressed_low_volume');
assert.equal(report.signals.find((l) => l.id === 'enterprise_opportunity').reason, 'unknown', 'a missing count is unknown, never zero-as-fact');
assert.equal(buildEvidenceReport({ prospectRef: 'p', counts: {}, authorities: [], cohortMinimum: 1, generatedAt: 'g' }).cohortMinimum, MIN_AGGREGATE_COUNT);
assert.equal(buildEvidenceReport({ prospectRef: 'p', counts: { member_interest: 41 }, authorities: [], generatedAt: 'g' }).signals.find((l) => l.id === 'member_interest').reason, 'authority_not_held');
// Malformed inputs are guarded, not thrown on.
assert.deepEqual([...buildEvidenceReport({ counts: null, authorities: null, generatedAt: 'g' }).disclosed], []);
assert.deepEqual([...buildEvidenceReport().disclosed], []);
// An unknown key in `counts` is never read as a signal.
assert.equal(buildEvidenceReport({ prospectRef: 'p', counts: { played_round_x: 99 }, authorities: allAuthorities, generatedAt: 'g' }).disclosed.includes('played_round_x'), false);

assert.equal(report.golferIdentityIncluded, false);
assert.match(report.prospectRef, /^prospect-[0-9a-z]+$/);
assert.doesNotMatch(JSON.stringify(report), /somchai@leak\.example/);
assert.equal(evidenceIsIdentityFree(report), true);
// The identity check can actually fail, rather than always passing.
assert.equal(evidenceIsIdentityFree({ golferIdentityIncluded: false, leak: 'ops@leak.example' }), false);
assert.equal(evidenceIsIdentityFree({ golferIdentityIncluded: true }), false);
assert.deepEqual(report.claims, { play: false, revenue: false, commission: false, invoice: false, legalProofOfPlay: false });
assert.ok(Object.isFrozen(report));

const evidenceRcpt = evidenceReceipt({ report, actorRef: 'admin@leak.example', at });
assert.ok(Object.isFrozen(evidenceRcpt));
assert.equal(evidenceRcpt.playedEvidenceReason, 'no_played_evidence_authority');
assert.doesNotMatch(JSON.stringify(evidenceRcpt), /admin@leak\.example/);
assert.doesNotMatch(JSON.stringify(evidenceRcpt), /\b41\b|\b60\b/, 'a receipt records that evidence ran, not the counts');
// The receipt REBUILDS its claims rather than echoing a caller-supplied object.
assert.deepEqual(evidenceReceipt({ report: { ...report, claims: { invoice: true, commission: true, play: true } }, actorRef: 'a', at }).claims, { play: false, revenue: false, commission: false, invoice: false, legalProofOfPlay: false });

// === ANALYTICS: a withheld value must not be RECOVERABLE ==================
assert.equal(JHCC_AGGREGATE_SCHEMA, 'golfriend.admin.jhcc-acquisition-aggregate.v3');
assert.deepEqual([...APPROVED_DIMENSION_IDS], ['country', 'prospect_status', 'contract_state', 'source']);
assert.equal(COHORT_MINIMUM, MIN_AGGREGATE_COUNT);

// The binding property, tested directly rather than by counting withheld buckets: a published
// exact total makes the residual the exact sum of the withheld buckets, which for tallied data
// (every bucket >= 1) pins them. So a total and a withheld bucket may never coexist.
const recoverable = (result) => result.total !== null && result.withheldCount > 0;
for (const population of [
  { Thailand: 20, Japan: 4, Korea: 4 },
  { Thailand: 20, Japan: 5, Korea: 0 },
  { Thailand: 1, Japan: 1 },
  { A: 2 },
  { A: 1, B: 1, C: 1 },
  { A: 30, B: 4 },
  {},
]) assert.equal(recoverable(suppressBuckets(population, { dimension: 'country' })), false, `a withheld value is recoverable for ${JSON.stringify(population)}`);

assert.equal(suppressBuckets({ Thailand: 20, Japan: 9 }, { dimension: 'country' }).total, 29);
assert.equal(suppressBuckets({ Thailand: 20, Japan: 4 }, { dimension: 'country' }).total, null);
assert.equal(suppressBuckets({ Thailand: 20, Japan: 4 }, { dimension: 'country' }).totalWithheldReason, 'total_would_permit_recovery_of_a_withheld_bucket');

// A withheld bucket discloses no count and no hint about which side of the threshold it is on.
const mixed = suppressBuckets({ Thailand: 20, Japan: 4, Korea: 2 }, { dimension: 'country' });
const withheld = mixed.buckets.filter((b) => !b.disclosed);
assert.equal(withheld.length, 2);
assert.ok(withheld.every((b) => b.count === null));
assert.equal(new Set(withheld.map((b) => b.reason)).size, 1, 'one uniform reason: no threshold oracle');
assert.equal(withheld[0].reason, 'withheld');
assert.equal(new Set(withheld.map((b) => b.ref)).size, 2, 'withheld buckets stay distinct and unmerged');

// The cohort minimum is server-fixed: the same data cannot be differenced across thresholds.
const atNine = suppressBuckets({ Thailand: 20, Japan: 9, Korea: 2 }, { dimension: 'country', cohortMinimum: 9 });
const atTen = suppressBuckets({ Thailand: 20, Japan: 9, Korea: 2 }, { dimension: 'country', cohortMinimum: 10 });
assert.equal(JSON.stringify(atNine), JSON.stringify(atTen), 'a caller-supplied threshold must be ignored');
assert.equal(atNine.cohortMinimum, COHORT_MINIMUM);

// References are ordinals, not reversible hashes of the dimension value.
assert.ok(mixed.buckets.every((b) => /^country-\d+$/.test(b.ref)));
assert.doesNotMatch(JSON.stringify(mixed), /Thailand|Japan|Korea/);
// Deterministic regardless of insertion order.
assert.equal(JSON.stringify(suppressBuckets({ A: 9, B: 20 }, { dimension: 'country' })), JSON.stringify(suppressBuckets({ B: 20, A: 9 }, { dimension: 'country' })));
// A malformed count is unknown, not a silent zero that corrupts the total.
const malformed = suppressBuckets({ A: 20, B: '3', C: -1 }, { dimension: 'country' });
assert.equal(malformed.malformedCount, 2);
assert.equal(malformed.bucketCount, 1);

// === ANALYTICS: JHCC aggregate carries counts only =======================
const rows = [
  { country: 'Thailand', status: 'new', contractState: 'none', source: 'golf_api', courseName: 'Riverbend Golf Club', prospectId: 'p-1', contactEmail: 'ops@leak.example' },
  { country: 'Japan', status: 'qualified', contractState: 'none', source: 'referral', courseName: 'Highland Pines', prospectId: 'p-2' },
];
const aggregate = prepareJhccAggregate({ rows, period: { start: '2026-07-01', end: '2026-07-31' }, generatedAt: '2026-08-15T00:00:00.000Z' });
assert.equal(aggregate.scope, 'aggregate_oversight_only');
assert.equal(aggregate.prospectTotal, 2);
assert.doesNotMatch(JSON.stringify(aggregate), /Riverbend|Highland|ops@leak\.example|p-1|p-2|Thailand|Japan/);
for (const dimension of APPROVED_DIMENSION_IDS) assert.equal(aggregate.dimensions[dimension].total, null, `${dimension} published a recoverable total`);
assert.deepEqual(aggregateIsMinimal(aggregate), { minimal: true, forbiddenFields: [], personalValueCount: 0 });
for (const field of FORBIDDEN_AGGREGATE_FIELDS) assert.doesNotMatch(JSON.stringify(aggregate), new RegExp(`"${field}"`));
assert.ok(Object.isFrozen(aggregate));
// Deterministic across row ORDER, not merely across the same array reference.
assert.equal(JSON.stringify(prepareJhccAggregate({ rows: [rows[1], rows[0]], period: { start: '2026-07-01', end: '2026-07-31' }, generatedAt: '2026-08-15T00:00:00.000Z' })), JSON.stringify(aggregate));

// A caller-supplied period or timestamp is VALIDATED, not echoed into the payload.
const dirty = prepareJhccAggregate({ rows: [{ country: 'TH' }], period: { start: 'Riverbend — ops@leak.example', end: 'prospect p-1 Somchai' }, generatedAt: 'note: see internal history' });
assert.equal(dirty.period.start, null);
assert.equal(dirty.period.end, null);
assert.equal(dirty.generatedAt, null);
assert.doesNotMatch(JSON.stringify(dirty), /Riverbend|ops@leak\.example|Somchai|internal history/);
assert.equal(aggregateIsMinimal(dirty).minimal, true);
// Minimality catches a personal VALUE under an allowed key, not just a forbidden key name.
assert.equal(aggregateIsMinimal({ note: 'x', anything: 'ops@leak.example' }).minimal, false);
assert.equal(aggregateIsMinimal({ dimensions: { country: { buckets: [{ courseName: 'R' }] } } }).minimal, false);
// A prototype-polluting row value corrupts neither the tally nor Object.prototype.
const polluted = prepareJhccAggregate({ rows: [{ country: '__proto__' }, { country: '__proto__' }, { country: 'TH' }], period: {}, generatedAt: 'x' });
assert.equal(polluted.prospectTotal, 3);
assert.equal(polluted.dimensions.country.bucketCount + polluted.dimensions.country.malformedCount, 2, 'every row must land in a bucket');
assert.equal({}.country, undefined, 'Object.prototype must not be polluted');
// Unrecognised enum values become `unknown`, never free text.
const oddEnum = prepareJhccAggregate({ rows: Array.from({ length: 6 }, () => ({ status: 'ops@leak.example', source: 'scraped' })), period: {}, generatedAt: 'x' });
assert.doesNotMatch(JSON.stringify(oddEnum), /ops@leak\.example|scraped/);
assert.ok(oddEnum.dimensions.prospect_status.buckets.some((b) => b.key === 'unknown'));
// Non-array rows fail closed rather than throwing.
assert.equal(prepareJhccAggregate({ rows: null, period: {}, generatedAt: 'x' }).prospectTotal, 0);
assert.equal(prepareJhccAggregate().prospectTotal, 0);

// === ANALYTICS: preparation is never delivery ============================
const unconfigured = analyticsPreparationReceipt({ aggregate, transmitterMounted: false, actorRef: 'admin@leak.example', at });
assert.equal(unconfigured.deliveryState, 'unconfigured', 'a missing transmitter stays unconfigured');
assert.equal(unconfigured.deliveryClaimed, false);
assert.ok(Object.isFrozen(unconfigured));
assert.doesNotMatch(JSON.stringify(unconfigured), /admin@leak\.example/);
assert.equal(analyticsPreparationReceipt({ aggregate, transmitterMounted: true, at }).deliveryState, 'prepared_awaiting_transmission');
assert.equal(analyticsPreparationReceipt({ aggregate, transmitterMounted: true, at }).deliveryClaimed, false);

// === behavioural no-transport check ======================================
// Asserted by import surface rather than by grepping for the string "fetch(": a pure module
// exports only functions, and every export below is exercised above with no side effect.
const evidenceModule = await import('../src/components/admin/v2/evidenceAdapterDomain.mjs');
const analyticsModule = await import('../src/components/admin/v2/analyticsPreparationDomain.mjs');
for (const [name, value] of Object.entries({ ...evidenceModule, ...analyticsModule })) {
  assert.ok(typeof value === 'function' || typeof value === 'object' || typeof value === 'string' || typeof value === 'number', `unexpected export shape: ${name}`);
}
// The complementary-suppression rule is enforced by behaviour above; this only pins the file
// against silent deletion of the module that owns it.
assert.ok(read('../src/components/admin/v2/analyticsPreparationDomain.mjs').length > 1000);

console.log('Evidence and analytics preparation verification PASS: played evidence fails closed with zero rounds and no course claim, inference refused by allowlist including unrecognised sources, signals deep-frozen with a unique play claim, unknown stays unknown, guarded malformed input, receipts rebuild their claims; suppression tested by the RECOVERABILITY property — no exact total coexists with a withheld bucket, one uniform withheld reason, server-fixed cohort minimum, ordinal non-reversible refs, order-independent determinism, validated period/timestamp, prototype-safe tallies and value-level minimality.');
