'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { UNKNOWN, normalizedCountry, projectCoverageByCountry } = require('./coverage');

test('normalizes explicit country text only and keeps missing country UNKNOWN', () => {
  assert.equal(normalizedCountry('  Việt   Nam  '), 'VIỆT NAM');
  assert.equal(normalizedCountry(null), UNKNOWN);
  assert.equal(normalizedCountry(''), UNKNOWN);
});

test('projects deterministic country coverage from fixtures without coordinate country inference', () => {
  const rows = projectCoverageByCountry([
    { country: ' Thailand ', provider: 'golf-api', latitude: 13.7, longitude: 100.5, sourceDigest: 'a', providerFetchedAt: '2026-08-27T09:00:00Z' },
    { country: 'thailand', provider: 'golf-api', latitude: null, longitude: null },
    { country: 'Vietnam', provenance: 'direct-confirmed', latitude: 10, longitude: 106, golfriendFetchedAt: '2026-08-26T09:00:00Z' },
    { latitude: 51.5, longitude: -0.1, directConfirmed: true },
  ]);
  assert.deepEqual(rows, [
    { country: 'THAILAND', totalCourses: 2, coursesWithCoordinates: 1, coursesMissingCoordinates: 1, golfApiImportedCount: 2, directConfirmedCount: 0, providerEvidenceMissingCount: 1, latestGolfriendFetchTime: '2026-08-27T09:00:00.000Z' },
    { country: 'UNKNOWN', totalCourses: 1, coursesWithCoordinates: 1, coursesMissingCoordinates: 0, golfApiImportedCount: 0, directConfirmedCount: 1, providerEvidenceMissingCount: 0, latestGolfriendFetchTime: null },
    { country: 'VIETNAM', totalCourses: 1, coursesWithCoordinates: 1, coursesMissingCoordinates: 0, golfApiImportedCount: 0, directConfirmedCount: 1, providerEvidenceMissingCount: 0, latestGolfriendFetchTime: '2026-08-26T09:00:00.000Z' },
  ]);
});

test('keeps an explicit UNKNOWN row visible even when every course has a known country', () => {
  const rows = projectCoverageByCountry([{ country: 'TH', latitude: 1, longitude: 1 }]);
  assert.deepEqual(rows.find((row) => row.country === UNKNOWN), {
    country: UNKNOWN, totalCourses: 0, coursesWithCoordinates: 0, coursesMissingCoordinates: 0,
    golfApiImportedCount: 0, directConfirmedCount: 0, providerEvidenceMissingCount: 0, latestGolfriendFetchTime: null,
  });
});
