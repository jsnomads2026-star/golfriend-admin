'use strict';

const UNKNOWN = 'UNKNOWN';

function normalizedCountry(value) {
  if (typeof value !== 'string') return UNKNOWN;
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return normalized ? normalized.toLocaleUpperCase('en-US') : UNKNOWN;
}

function timestampMs(value) {
  if (value && typeof value.toDate === 'function') value = value.toDate();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCoordinates(course) {
  const latitude = Number(course.latitude ?? course.lat);
  const longitude = Number(course.longitude ?? course.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function isGolfApiImported(course) {
  const source = typeof course.provider === 'string' ? course.provider : course.provenance;
  return course.apiImported === true || (typeof source === 'string' && source.trim().toLocaleLowerCase() === 'golf-api');
}

function isDirectConfirmed(course) {
  const source = typeof course.provenance === 'string' ? course.provenance.trim().toLocaleLowerCase() : '';
  return course.directConfirmed === true || course.directConfirmation?.status === 'confirmed' || source === 'direct-confirmed';
}

function hasProviderEvidence(course) {
  return ['providerEvidenceId', 'providerReceiptId', 'providerEvidence', 'sourceDigest']
    .some((key) => typeof course[key] === 'string' && course[key].trim().length > 0);
}

function latestFetchMs(course) {
  for (const key of ['golfriendFetchedAt', 'providerFetchedAt', 'providerRetrievalAt']) {
    const value = timestampMs(course[key]);
    if (value !== null) return value;
  }
  return null;
}

function projectCoverageByCountry(courses) {
  const buckets = new Map();
  for (const course of courses || []) {
    const country = normalizedCountry(course?.country);
    const bucket = buckets.get(country) || {
      country, totalCourses: 0, coursesWithCoordinates: 0, coursesMissingCoordinates: 0,
      golfApiImportedCount: 0, directConfirmedCount: 0, providerEvidenceMissingCount: 0, latestGolfriendFetchTimeMs: null,
    };
    bucket.totalCourses += 1;
    if (hasCoordinates(course || {})) bucket.coursesWithCoordinates += 1;
    else bucket.coursesMissingCoordinates += 1;
    if (isGolfApiImported(course || {})) {
      bucket.golfApiImportedCount += 1;
      if (!hasProviderEvidence(course || {})) bucket.providerEvidenceMissingCount += 1;
    }
    if (isDirectConfirmed(course || {})) bucket.directConfirmedCount += 1;
    const fetched = latestFetchMs(course || {});
    if (fetched !== null && (bucket.latestGolfriendFetchTimeMs === null || fetched > bucket.latestGolfriendFetchTimeMs)) bucket.latestGolfriendFetchTimeMs = fetched;
    buckets.set(country, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => {
      const { latestGolfriendFetchTimeMs, ...coverage } = bucket;
      return Object.freeze({ ...coverage, latestGolfriendFetchTime: latestGolfriendFetchTimeMs === null ? null : new Date(latestGolfriendFetchTimeMs).toISOString() });
    })
    .sort((left, right) => right.totalCourses - left.totalCourses || left.country.localeCompare(right.country));
}

module.exports = Object.freeze({ UNKNOWN, normalizedCountry, projectCoverageByCountry });
