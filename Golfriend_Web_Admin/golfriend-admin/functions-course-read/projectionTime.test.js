'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {displayTime, timestampMillis} = require('./projectionTime');

const ISO = '2026-08-31T01:23:12.000Z';
const MILLIS = Date.parse(ISO);

test('normalizes Firestore Timestamp, ISO text, epoch milliseconds, and epoch seconds', () => {
  assert.equal(displayTime({toMillis: () => MILLIS}), ISO);
  assert.equal(displayTime(ISO), ISO);
  assert.equal(displayTime(MILLIS), ISO);
  assert.equal(displayTime(MILLIS / 1000), ISO);
  assert.equal(timestampMillis({_seconds: MILLIS / 1000, _nanoseconds: 0}), MILLIS);
});

test('normalizes null, missing, and malformed timestamps to null rather than Invalid Date', () => {
  assert.equal(displayTime(null), null);
  assert.equal(displayTime(undefined), null);
  assert.equal(displayTime('not-a-date'), null);
});
