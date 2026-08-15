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
  APPROVED_DIMENSIONS,
  FORBIDDEN_AGGREGATE_FIELDS,
  JHCC_AGGREGATE_SCHEMA,
  prepareJhccAggregate,
  suppressBuckets,
} from '../src/components/admin/v2/analyticsPreparationDomain.mjs';
import { MIN_AGGREGATE_COUNT } from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const at = '2026-08-15';
const allAuthorities = [...APPROVED_EVIDENCE_AUTHORITIES];

// === EVIDENCE: played evidence fails closed ==============================
assert.equal(EVIDENCE_SCHEMA, 'golfriend.admin.opportunity-evidence.v2');
assert.equal(EVIDENCE_SIGNALS.length, 7);
assert.equal(PLAYED_EVIDENCE_AUTHORITY, 'played_evidence');
// The authority does not exist in this build. That is the whole point.
assert.ok(!APPROVED_EVIDENCE_AUTHORITIES.includes(PLAYED_EVIDENCE_AUTHORITY), 'no approved played-evidence source may exist yet');

// Absent the authority: withheld, zero, no claim — even if the caller asserts it holds it.
for (const authorities of [[], allAuthorities, [...allAuthorities, PLAYED_EVIDENCE_AUTHORITY]]) {
  const played = assessPlayedEvidence({ authorities });
  assert.equal(played.available, false, 'played evidence must fail closed');
  assert.equal(played.reason, 'no_played_evidence_authority');
  assert.equal(played.playedRounds, 0, 'played rounds are counted as zero');
  assert.equal(played.courseClaim, null, 'no course claim is generated');
}

// Play may never be inferred, from any single signal or any combination of them.
for (const source of NON_PLAY_INFERENCE_SOURCES) {
  const inferred = assessPlayedEvidence({ authorities: [PLAYED_EVIDENCE_AUTHORITY], inferredFrom: [source] });
  assert.equal(inferred.available, false, `play must not be inferred from ${source}`);
  assert.equal(inferred.reason, 'play_may_not_be_inferred');
  assert.equal(inferred.playedRounds, 0);
}
const combined = assessPlayedEvidence({ authorities: [PLAYED_EVIDENCE_AUTHORITY], inferredFrom: ['booking_request', 'location', 'check_in', 'user_statement'] });
assert.equal(combined.available, false, 'accumulating interest signals never amounts to play');
assert.deepEqual([...combined.rejectedInference], ['booking_request', 'location', 'check_in', 'user_statement']);
for (const banned of ['search', 'course_selection', 'match_activity', 'booking_request', 'location', 'check_in', 'user_statement', 'unconfirmed_activity']) assert.ok(NON_PLAY_INFERENCE_SOURCES.includes(banned), `${banned} must be named as a non-play source`);

// === EVIDENCE: report truthfulness =======================================
const report = buildEvidenceReport({ prospectRef: 'somchai@leak.example', counts: { member_interest: 41, booking_request: 12, confirmed_course_response: 7, played_round: 99, regional_demand: 60, tournament_opportunity: 3 }, authorities: [...allAuthorities, PLAYED_EVIDENCE_AUTHORITY], generatedAt: '2026-08-15T00:00:00.000Z' });
const playedLine = report.signals.find((line) => line.id === 'played_round');
assert.equal(playedLine.disclosed, false, 'a supplied played count must never be disclosed');
assert.equal(playedLine.value, 0, 'played rounds report zero, not the supplied 99');
assert.equal(playedLine.reason, 'no_played_evidence_authority');
// Each line states what it is evidence OF, so interest cannot be read as play.
assert.equal(report.signals.find((l) => l.id === 'member_interest').claim, 'interest');
assert.equal(report.signals.find((l) => l.id === 'booking_request').claim, 'intent');
assert.equal(playedLine.claim, 'play');
// Cohort suppression and unknown-stays-unknown.
assert.equal(report.signals.find((l) => l.id === 'tournament_opportunity').reason, 'suppressed_low_volume');
assert.equal(report.signals.find((l) => l.id === 'enterprise_opportunity').reason, 'unknown', 'a missing count is unknown, never zero-as-fact');
assert.equal(report.cohortMinimum, MIN_AGGREGATE_COUNT);
// A caller cannot lower the cohort threshold below the floor.
assert.equal(buildEvidenceReport({ prospectRef: 'p', counts: {}, authorities: [], cohortMinimum: 1, generatedAt: 'g' }).cohortMinimum, MIN_AGGREGATE_COUNT);
// No authority held means every authoritative line is withheld, not defaulted.
const unauthorized = buildEvidenceReport({ prospectRef: 'p', counts: { member_interest: 41 }, authorities: [], generatedAt: 'g' });
assert.equal(unauthorized.signals.find((l) => l.id === 'member_interest').reason, 'authority_not_held');

// Golfer identity never reaches acquisition evidence; the subject is a surrogate.
assert.equal(report.golferIdentityIncluded, false);
assert.match(report.prospectRef, /^prospect-[0-9a-z]+$/);
assert.doesNotMatch(JSON.stringify(report), /somchai@leak\.example/);
assert.equal(evidenceIsIdentityFree(report), true);
// No commercial or legal claim is ever asserted.
assert.deepEqual(report.claims, { play: false, revenue: false, commission: false, invoice: false, legalProofOfPlay: false });
assert.ok(Object.isFrozen(report));

const evidenceRcpt = evidenceReceipt({ report, actorRef: 'admin@leak.example', at });
assert.ok(Object.isFrozen(evidenceRcpt));
assert.equal(evidenceRcpt.playedEvidenceAvailable, false);
assert.equal(evidenceRcpt.playedEvidenceReason, 'no_played_evidence_authority');
assert.doesNotMatch(JSON.stringify(evidenceRcpt), /admin@leak\.example/);
assert.doesNotMatch(JSON.stringify(evidenceRcpt), /\b41\b|\b60\b/, 'a receipt records that evidence ran, not the counts');

// === ANALYTICS: two-stage suppression ====================================
assert.equal(JHCC_AGGREGATE_SCHEMA, 'golfriend.admin.jhcc-acquisition-aggregate.v2');
assert.deepEqual([...APPROVED_DIMENSIONS], ['country', 'prospect_status', 'contract_state', 'source']);

// One below-threshold bucket is recoverable by subtraction, so a second is withheld with it.
const single = suppressBuckets({ Thailand: 20, Japan: 9, Korea: 2 }, { dimension: 'country' });
assert.equal(single.withheldCount, 2, 'a lone withheld bucket must trigger complementary suppression');
assert.ok(single.buckets.some((b) => b.reason === 'below_cohort_minimum'));
assert.ok(single.buckets.some((b) => b.reason === 'complementary_suppression'));
assert.equal(single.total, 31, 'the total is publishable once two buckets are withheld together');
// Withheld buckets keep DISTINCT surrogates and are never merged into one residual.
const withheldRefs = single.buckets.filter((b) => !b.disclosed).map((b) => b.ref);
assert.equal(new Set(withheldRefs).size, 2, 'withheld buckets must stay distinct');
assert.ok(single.buckets.every((b) => !b.disclosed || typeof b.count === 'number'));
assert.ok(single.buckets.filter((b) => !b.disclosed).every((b) => b.count === null), 'a withheld bucket carries no count');
// Nothing withheld: the total is safe to publish.
const clean = suppressBuckets({ Thailand: 20, Japan: 9 }, { dimension: 'country' });
assert.equal(clean.withheldCount, 0);
assert.equal(clean.total, 29);
// Two already-small buckets need no complement and stay separable.
const twoSmall = suppressBuckets({ A: 2, B: 3, C: 30 }, { dimension: 'country' });
assert.equal(twoSmall.withheldCount, 2);
assert.equal(new Set(twoSmall.buckets.map((b) => b.ref)).size, 3);
// A single bucket that is itself below the minimum cannot publish a total either.
const lone = suppressBuckets({ A: 2 }, { dimension: 'country' });
assert.equal(lone.total, null);
assert.equal(lone.totalWithheldReason, 'total_would_reveal_a_withheld_bucket');
// Bucket surrogates never contain the dimension value.
assert.doesNotMatch(JSON.stringify(single.buckets), /Thailand|Japan|Korea/);
// The same value always yields the same surrogate; different values never collide.
assert.equal(suppressBuckets({ Thailand: 1 }, { dimension: 'country' }).buckets[0].ref, suppressBuckets({ Thailand: 1 }, { dimension: 'country' }).buckets[0].ref);
assert.notEqual(suppressBuckets({ Thailand: 1 }, { dimension: 'country' }).buckets[0].ref, suppressBuckets({ Japan: 1 }, { dimension: 'country' }).buckets[0].ref);

// === ANALYTICS: JHCC aggregate carries counts only =======================
const rows = [
  { country: 'Thailand', status: 'new', contractState: 'none', source: 'golf_api', courseName: 'Riverbend Golf Club', prospectId: 'p-1', contactEmail: 'ops@leak.example' },
  { country: 'Japan', status: 'qualified', contractState: 'none', source: 'referral', courseName: 'Highland Pines', prospectId: 'p-2' },
];
const aggregate = prepareJhccAggregate({ rows, period: { start: '2026-07-01', end: '2026-07-31' }, generatedAt: '2026-08-15T00:00:00.000Z' });
assert.equal(aggregate.scope, 'aggregate_oversight_only');
assert.equal(aggregate.prospectTotal, 2);
assert.deepEqual(Object.keys(aggregate.dimensions), [...APPROVED_DIMENSIONS]);
// No name, identifier, contact detail or narrative survives into the aggregate.
assert.doesNotMatch(JSON.stringify(aggregate), /Riverbend|Highland|ops@leak\.example|p-1|p-2|Thailand|Japan|golf_api|referral/);
assert.deepEqual(aggregateIsMinimal(aggregate), { minimal: true, forbiddenFields: [] });
for (const field of FORBIDDEN_AGGREGATE_FIELDS) assert.doesNotMatch(JSON.stringify(aggregate), new RegExp(`"${field}"`), `${field} must not appear`);
assert.ok(Object.isFrozen(aggregate));
// Determinism: the same input always produces the same payload.
assert.equal(JSON.stringify(prepareJhccAggregate({ rows, period: { start: '2026-07-01', end: '2026-07-31' }, generatedAt: '2026-08-15T00:00:00.000Z' })), JSON.stringify(aggregate));
// The minimality check actually catches a forbidden field rather than always passing.
assert.equal(aggregateIsMinimal({ dimensions: { country: { buckets: [{ courseName: 'Riverbend' }] } } }).minimal, false);

// === ANALYTICS: preparation is never delivery ============================
const unconfigured = analyticsPreparationReceipt({ aggregate, transmitterMounted: false, actorRef: 'admin@leak.example', at });
assert.equal(unconfigured.deliveryState, 'unconfigured', 'a missing transmitter stays unconfigured');
assert.equal(unconfigured.deliveryClaimed, false);
assert.ok(Object.isFrozen(unconfigured));
assert.doesNotMatch(JSON.stringify(unconfigured), /admin@leak\.example/);
const mountedReceipt = analyticsPreparationReceipt({ aggregate, transmitterMounted: true, actorRef: 'a', at });
assert.equal(mountedReceipt.deliveryState, 'prepared_awaiting_transmission', 'preparation is not transmission');
assert.equal(mountedReceipt.deliveryClaimed, false, 'delivery is never claimed by a preparation receipt');

// === source contracts ====================================================
const evidence = read('../src/components/admin/v2/evidenceAdapterDomain.mjs');
const analytics = read('../src/components/admin/v2/analyticsPreparationDomain.mjs');
assert.doesNotMatch(codeOnly(evidence + analytics), /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|fetch\s*\(|XMLHttpRequest|sendBeacon|sendEmail|smtp|mailto:/i);
assert.doesNotMatch(codeOnly(evidence + analytics), /createInvoice|issueInvoice|commissionAmount|amountDue|payout\s*\(/i);
// The non-inference rule is stated where a future contributor cannot miss it.
assert.match(evidence, /never evidence of play|may not be inferred/i);
assert.match(analytics, /complementary|subtract/i);

console.log('Evidence and analytics preparation verification PASS: played evidence fails closed with zero rounds and no course claim even when the authority is asserted, play is never inferred from any of eight interest signals, each line states what it is evidence of, unknown stays unknown, cohort floor cannot be lowered, golfer identity absent, two-stage suppression with complementary withholding and a subtraction-safe total, withheld buckets kept distinct and never merged, JHCC aggregate deterministic and free of names/identifiers/contacts/narrative, and preparation never claims delivery.');
