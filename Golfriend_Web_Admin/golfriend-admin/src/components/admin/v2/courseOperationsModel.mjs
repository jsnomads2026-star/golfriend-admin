export const STALE_AFTER_DAYS = 90;

const value = (record, keys) => keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && item !== '');
const number = (record, keys) => { const found = value(record, keys); const parsed = Number(found); return Number.isFinite(parsed) ? parsed : null; };
const text = (record, keys, fallback = '') => String(value(record, keys) ?? fallback).trim();
const validCoordinates = (lat, lng) => lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);

export function normalizeCourse(id, record, now = new Date()) {
  const latitude = number(record, ['latitude', 'lat']);
  const longitude = number(record, ['longitude', 'lng']);
  // `cachedAt` is what the V1 schema called the last provider retrieval; the V2
  // migration carried the same value across under the name `legacyCachedAt`. Without
  // it every migrated record has no recognised timestamp, so it reports "not
  // available" in the Updated column and counts as stale — about data that is not.
  const updatedRaw = value(record, ['providerFetchedAt', 'cachedAt', 'legacyCachedAt', 'updatedAt', 'lastUpdated']);
  const providerSyncRaw = value(record, ['providerFetchedAt']);
  const updatedMs = updatedRaw && typeof updatedRaw?.toDate === 'function' ? updatedRaw.toDate().getTime() : Date.parse(String(updatedRaw || ''));
  const hasCoordinates = validCoordinates(latitude, longitude);
  const canonicalId = text(record, ['courseID', 'courseId', 'providerId'], id);
  const name = text(record, ['clubName', 'name', 'courseName'], 'Unnamed course');
  const country = text(record, ['country', 'countryName'], 'Unknown');
  const region = text(record, ['region', 'state', 'province', 'city'], 'Unknown');
  // `source` is a plain string in the V1 schema and a provenance MAP in the V2 one,
  // whose `provider` names the same thing. Stringifying the map printed
  // "[object Object]" in the Data source column of every migrated record.
  const provenance = record.source && typeof record.source === 'object' ? record.source : null;
  const source = text(record, ['gpsSource', 'provider'], '')
    || (provenance ? text(provenance, ['provider'], '') : text(record, ['source'], ''))
    || (record.apiImported ? 'golfapi' : 'unknown');
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
  const usable = courses.filter((c) => c.hasCoordinates && !c.requiresManualGPS).length;
  return { total: courses.length, usable, regions: regions.size, withCoordinates: courses.filter((c) => c.hasCoordinates).length,
    missingCoordinates: courses.filter((c) => !c.hasCoordinates).length, incomplete: courses.filter((c) => c.incomplete).length, quality: courses.filter((c) => c.incomplete || c.stale).length,
    stale: courses.filter((c) => c.stale).length, duplicates: courses.filter((c) => c.duplicate).length, lastSuccessfulSync: latest };
}

/**
 * `scope` is optional and defaults to no geographic narrowing, so the existing
 * three-argument calls (and the gate that asserts them) behave exactly as before.
 */
export function filterCourses(courses, query, filter, scope = {}) {
  const needle = query.trim().toLocaleLowerCase();
  const country = typeof scope.country === 'string' ? scope.country.trim() : '';
  const region = typeof scope.region === 'string' ? scope.region.trim() : '';
  return courses.filter((course) => {
    const searchMatch = !needle || [course.name, course.country, course.region, course.canonicalId].some((item) => item.toLocaleLowerCase().includes(needle));
    const filterMatch = filter === 'all' || (filter === 'missing_coordinates' && !course.hasCoordinates) || (filter === 'incomplete' && course.incomplete) || (filter === 'stale' && course.stale) || (filter === 'duplicate' && course.duplicate) || (filter === 'healthy' && healthOf(course) === 'healthy');
    // Exact match, not substring: the value comes from a picker whose options are the
    // countries actually present, so a partial string here would silently widen the
    // selection the operator made.
    const countryMatch = !country || course.country === country;
    // A region is only meaningful inside its country: the same region name can exist
    // in two countries, so it must never select across them. A region with no country
    // is not a narrowing anyone can see — the picker disables the area input until a
    // country is chosen — so it is ignored rather than silently emptying the table.
    const regionMatch = !region || !country || course.region === region;
    return searchMatch && filterMatch && countryMatch && regionMatch;
  });
}

// ---------------------------------------------------------------------------
// Geographic pickers
// ---------------------------------------------------------------------------

/**
 * Countries actually present in the loaded catalogue, with a count each, ordered by
 * name. Derived from the data rather than a static list so it can never offer a
 * country that would return nothing, and never omit one that exists.
 *
 * `Unknown` is the normalizer's placeholder for a record with no country. It is kept
 * as a selectable option, because "which records have no country?" is exactly the
 * question this table exists to answer — hiding it would hide the incomplete records.
 */
export function countryOptions(courses) {
  const counts = new Map();
  courses.forEach((course) => counts.set(course.country, (counts.get(course.country) || 0) + 1));
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((left, right) => left.country.localeCompare(right.country));
}

/** Regions present within one country. Empty when no country is selected. */
export function regionOptions(courses, country) {
  const selected = typeof country === 'string' ? country.trim() : '';
  if (!selected) return [];
  const counts = new Map();
  courses.forEach((course) => {
    if (course.country !== selected) return;
    counts.set(course.region, (counts.get(course.region) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((left, right) => left.region.localeCompare(right.region));
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const SORT_COLUMNS = Object.freeze(['name', 'country', 'source', 'updated']);

/**
 * Click cycling: a new column starts ascending; the active column flips direction.
 * There is deliberately no third "unsorted" state — the table always has a defined
 * order, so rows never move for a reason the operator cannot see.
 */
export function nextSort(current, column) {
  if (!SORT_COLUMNS.includes(column)) return current;
  if (!current || current.column !== column) return { column, direction: 'asc' };
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

const compareText = (left, right) => String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' });

/**
 * Stable, pure sort. Returns a new array; the input order is preserved for equal keys
 * because every comparator falls through to the original index.
 *
 * Records with no `updatedAt` sort LAST in both directions. They are not "oldest" —
 * the date is unknown — so letting them lead a descending sort would assert something
 * the data does not say, and would bury the newest records the operator asked for.
 */
export function sortCourses(courses, sort) {
  if (!sort || !SORT_COLUMNS.includes(sort.column)) return courses;
  const factor = sort.direction === 'desc' ? -1 : 1;
  const decorated = courses.map((course, index) => ({ course, index }));
  decorated.sort((left, right) => {
    let result = 0;
    if (sort.column === 'name') result = compareText(left.course.name, right.course.name);
    else if (sort.column === 'country') {
      result = compareText(left.course.country, right.course.country) || compareText(left.course.region, right.course.region);
    } else if (sort.column === 'source') result = compareText(left.course.source, right.course.source);
    else {
      const a = Date.parse(left.course.updatedAt || ''), b = Date.parse(right.course.updatedAt || '');
      const aKnown = Number.isFinite(a), bKnown = Number.isFinite(b);
      if (!aKnown && !bKnown) result = 0;
      // Unknown dates are pinned last by returning the direction-cancelling sign, so
      // the factor below cannot lift them to the top of a descending sort.
      else if (!aKnown) return 1;
      else if (!bKnown) return -1;
      else result = a - b;
    }
    return result * factor || left.index - right.index;
  });
  return decorated.map((entry) => entry.course);
}

export function normalizeSyncResult(data) {
  if (!data || data.success !== true || data.mode !== 'preview') throw new Error('Preview response failed validation.');
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
  return { mode: 'preview', processed: Number(data.processed) || 0, productionWrites: 0, summary, results: Array.isArray(data.results) ? data.results : [], quota: data.quota ?? null };
}

export function normalizeIngestionStatus(raw) {
  const empty = { source: 'golfapi.io v2.3', lastCommitAt: null, estimatedCallsUsed: null, remaining: null, currentMonth: null, added: null, skippedExisting: null, reviewRequired: null, failed: null, errors: null, lastCommitJobId: null };
  if (!raw || typeof raw !== 'object') return empty;
  if (raw.schema === 'golfriend.golf-api-sync-status.v1') {
    const lastSuccess = raw.lastSuccess && typeof raw.lastSuccess === 'object' ? raw.lastSuccess : null;
    const outcome = lastSuccess?.outcome && typeof lastSuccess.outcome === 'object' ? lastSuccess.outcome : {};
    const safeErrors = raw.safeErrorSummary && typeof raw.safeErrorSummary === 'object' ? raw.safeErrorSummary : {};
    const at = lastSuccess?.at;
    return { ...empty, lastCommitAt: typeof at === 'string' && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null, estimatedCallsUsed: Number.isInteger(raw.requestsUsed) ? raw.requestsUsed : null, remaining: Number.isInteger(raw.requestsRemaining) ? raw.requestsRemaining : null, currentMonth: typeof raw.currentMonth === 'string' ? raw.currentMonth : null, added: Number(outcome.updated) || 0, failed: (Number(safeErrors.providerRequestFailures) || 0) + (Number(safeErrors.conflicts) || 0) };
  }
  const result = raw.lastCommitResult && typeof raw.lastCommitResult === 'object' ? raw.lastCommitResult : null;
  const tsRaw = raw.lastCommitAt;
  const tsMs = tsRaw && typeof tsRaw.toDate === 'function' ? tsRaw.toDate().getTime() : Date.parse(String(tsRaw || ''));
  return {
    source: 'golfapi.io v2.3',
    lastCommitAt: Number.isFinite(tsMs) ? new Date(tsMs).toISOString() : null,
    estimatedCallsUsed: typeof raw.estimatedCallsUsed === 'number' ? raw.estimatedCallsUsed : null,
    remaining: null,
    currentMonth: null,
    added: result ? (Number(result.added) || 0) : null,
    skippedExisting: result ? (Number(result.skippedExisting) || 0) : null,
    reviewRequired: result ? (Number(result.reviewRequired) || 0) : null,
    failed: result ? (Number(result.failed) || 0) : null,
    errors: result && Array.isArray(result.errors) ? result.errors.slice(0, 5) : null,
    lastCommitJobId: typeof raw.lastCommitJobId === 'string' ? raw.lastCommitJobId : null,
  };
}
