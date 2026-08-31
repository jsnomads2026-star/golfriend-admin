'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {attachCountryCoverage, projectReceiptBoundQueue} = require('./countryIngestionProjection');

const job = (country, ordinal, state = 'queued') => ({jobId: country.toLowerCase(), country, ordinal, batch: 1, state, requiresReceiptId: ordinal ? `${['korea', 'japan', 'australia'][ordinal - 1]}-batch-1` : 'cutover'});
const receipt = (jobId, state, overrides = {}) => ({receiptId: `${jobId}-batch-1`, state, recordedAt: '2026-08-29T08:00:00.000Z', providerCalls: 1, counts: {added: 0, updated: 0, quarantined: 0}, ...overrides});

test('projects completed receipt counts and the next receipt-eligible country', () => {
  const result = projectReceiptBoundQueue([job('KOREA', 0, 'completed'), job('JAPAN', 1)], [receipt('korea', 'completed', {counts: {added: 922, updated: 156, quarantined: 0}})]);
  assert.deepEqual(result.pipeline.korea.counts, {added: 922, updated: 156, quarantined: 0});
  assert.equal(result.pipeline.nextEligible.country, 'JAPAN');
});

test('marks a queue row unavailable when its immutable receipt is absent', () => {
  const result = projectReceiptBoundQueue([job('KOREA', 0, 'completed')], []);
  assert.equal(result.jobs[0].state, 'unavailable');
});

test('retains the immutable provider failure without inventing a retry', () => {
  const result = projectReceiptBoundQueue([job('AUSTRALIA', 2, 'failed')], [receipt('australia', 'failed', {providerCalls: 1, requestEvidence: {errorClassification: 'fetch failed'}})]);
  assert.equal(result.jobs[0].state, 'failed');
  assert.equal(result.jobs[0].error, 'fetch failed');
  assert.equal(result.pipeline.nextEligible, null);
});

test('uses the immutable receipt completion time and supports all stored timestamp forms', () => {
  const rows = [
    projectReceiptBoundQueue([job('KOREA', 0, 'completed')], [receipt('korea', 'completed', {recordedAt: {_seconds: 1788138000, _nanoseconds: 0}})]),
    projectReceiptBoundQueue([job('KOREA', 0, 'completed')], [receipt('korea', 'completed', {recordedAt: '2026-08-30T23:00:00.000Z'})]),
    projectReceiptBoundQueue([job('KOREA', 0, 'completed')], [receipt('korea', 'completed', {recordedAt: 1788130800000})]),
    projectReceiptBoundQueue([job('KOREA', 0, 'completed')], [receipt('korea', 'completed', {recordedAt: 1788130800})]),
  ];
  for (const row of rows) assert.match(row.pipeline.lastCompleted.completedAt, /^2026-/);
  const absent = projectReceiptBoundQueue([job('KOREA', 0, 'completed')], [receipt('korea', 'completed', {recordedAt: null})]);
  assert.equal(absent.pipeline.lastCompleted.completedAt, null);
});

test('reports the earliest next eligible run when every scheduled country is within its refresh window', () => {
  const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const result = projectReceiptBoundQueue([
    {...job('KOREA', 0, 'completed'), nextDueAtMs: future + 1000},
    {...job('JAPAN', 1, 'completed'), nextDueAtMs: future},
  ], [receipt('korea', 'completed'), receipt('japan', 'completed')]);
  assert.equal(result.pipeline.nextEligible, null);
  assert.equal(result.pipeline.allScheduledCountriesUpToDate, true);
  assert.equal(result.pipeline.nextScheduledCountry, 'JAPAN');
  assert.match(result.pipeline.nextScheduledRunAt, /^20\d\d-/);
});

test('distinguishes booking venues from playable course layouts and flags a missing club ID', () => {
  const base = projectReceiptBoundQueue([job('THAILAND', 0)], []);
  const result = attachCountryCoverage(base, [{country: 'Thailand', providerCourseId: 'layout-a', providerClubId: 'club-a'}, {country: 'Thailand', providerCourseId: 'layout-b', providerClubId: 'club-a'}, {country: 'Thailand', providerCourseId: 'layout-c'}], [{country: 'Thailand', providerClubId: 'club-a'}]);
  assert.deepEqual(result.jobs[0].clubhouseCount, 1);
  assert.deepEqual(result.jobs[0].courseLayoutCount, 3);
  assert.deepEqual(result.jobs[0].needsClubhouseIdentityReviewCount, 1);
});
