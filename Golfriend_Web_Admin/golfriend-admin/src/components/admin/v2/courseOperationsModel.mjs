export const STALE_AFTER_DAYS = 90;

const value = (record, keys) => keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && item !== '');
const number = (record, keys) => { const found = value(record, keys); const parsed = Number(found); return Number.isFinite(parsed) ? parsed : null; };
const text = (record, keys, fallback = '') => String(value(record, keys) ?? fallback).trim();
const validCoordinates = (lat, lng) => lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);

export function normalizeCourse(id, record, now = new Date()) {
  const latitude = number(record, ['latitude', 'lat']);
  const longitude = number(record, ['longitude', 'lng']);
  const updatedRaw = value(record, ['providerFetchedAt', 'cachedAt', 'updatedAt', 'lastUpdated']);
  const providerSyncRaw = value(record, ['providerFetchedAt']);
  const updatedMs = updatedRaw && typeof updatedRaw?.toDate === 'function' ? updatedRaw.toDate().getTime() : Date.parse(String(updatedRaw || ''));
  const hasCoordinates = validCoordinates(latitude, longitude);
  const canonicalId = text(record, ['courseID', 'courseId', 'providerId'], id);
  const name = text(record, ['clubName', 'name', 'courseName'], 'Unnamed course');
  const country = text(record, ['country', 'countryName'], 'Unknown');
  const region = text(record, ['region', 'state', 'province', 'city'], 'Unknown');
  const source = text(record, ['gpsSource', 'source'], record.apiImported ? 'golfapi' : 'unknown');
  const incomplete = name === 'Unnamed course' || country === 'Unknown' || !canonicalId;
  const stale = !Number.isFinite(updatedMs) || now.getTime() - updatedMs > STALE_AFTER_DAYS * 86400000;
  const duplicateKey = `${name.toLocaleLowerCase()}|${country.toLocaleLowerCase()}|${region.toLocaleLowerCase()}`;
  const providerSyncMs = Date.parse(String(providerSyncRaw || ''));
  return { id, canonicalId, name, country, region, latitude, longitude, hasCoordinates, source, incomplete, stale, duplicateKey,
    updatedAt: Number.isFinite(updatedMs) ? new Date(updatedMs).toISOString() : null,
    lastSyncAt: Number.isFinite(providerSyncMs) ? new Date(providerSyncMs).toISOString() : null,
    contact: text(record, ['phone', 'telephone', 'contactPhone']) || null,
    booking: text(record, ['bookingUrl', 'website', 'bookingEmail', 'email']) || null,
    manualLocked: record.manualLock === true || record.trusted === true || record.gpsSource === 'manual',
    requiresManualGPS: record.requiresManualGPS === true };
}

export function markDuplicates(courses) {
  const counts = new Map();
  courses.forEach((course) => counts.set(course.duplicateKey, (counts.get(course.duplicateKey) || 0) + 1));
  return courses.map((course) => ({ ...course, duplicate: (counts.get(course.duplicateKey) || 0) > 1 }));
}

export function healthOf(course) {
  if (course.duplicate) return 'duplicate';
  if (!course.hasCoordinates) return 'missing_coordinates';
  if (course.incomplete) return 'incomplete';
  if (course.stale) return 'stale';
  return 'healthy';
}

export function summarizeCourses(courses) {
  const regions = new Set(courses.filter((c) => c.country !== 'Unknown').map((c) => `${c.country}|${c.region}`));
  const latest = courses.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1) || null;
  return { total: courses.length, regions: regions.size, withCoordinates: courses.filter((c) => c.hasCoordinates).length,
    missingCoordinates: courses.filter((c) => !c.hasCoordinates).length, incomplete: courses.filter((c) => c.incomplete).length, quality: courses.filter((c) => c.incomplete || c.stale).length,
    stale: courses.filter((c) => c.stale).length, duplicates: courses.filter((c) => c.duplicate).length, lastSuccessfulSync: latest };
}

export function filterCourses(courses, query, filter) {
  const needle = query.trim().toLocaleLowerCase();
  return courses.filter((course) => {
    const searchMatch = !needle || [course.name, course.country, course.region, course.canonicalId].some((item) => item.toLocaleLowerCase().includes(needle));
    const filterMatch = filter === 'all' || (filter === 'missing_coordinates' && !course.hasCoordinates) || (filter === 'incomplete' && course.incomplete) || (filter === 'stale' && course.stale) || (filter === 'duplicate' && course.duplicate) || (filter === 'healthy' && healthOf(course) === 'healthy');
    return searchMatch && filterMatch;
  });
}

export function normalizeSyncResult(data) {
  if (!data || data.success !== true || data.mode !== 'preview') throw new Error('Preview response failed validation.');
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
  return { mode: 'preview', processed: Number(data.processed) || 0, productionWrites: 0, summary, results: Array.isArray(data.results) ? data.results : [], quota: data.quota ?? null };
}
