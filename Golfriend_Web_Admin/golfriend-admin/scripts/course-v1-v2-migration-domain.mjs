import {createHash} from 'node:crypto';

export const COURSE_SCHEMA = 'golfriend.v2.course.v2';
export const MIGRATION_VERSION = 'golfriend.course-migration.v1';
export const SOURCE_PROJECT = 'golfriend-v1';
export const TARGET_PROJECT = 'golfriend-v2';

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value) => typeof value === 'string' && value.trim() ? value.normalize('NFKC').trim() : null;
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const COUNTRY_ALIASES = new Map([
  ['hong kong', 'Hong Kong'], ['uk', 'United Kingdom'], ['usa', 'United States'],
  ["cote d'ivoire", "Côte d’Ivoire"], ['south korea', 'South Korea'],
]);

export function normalizeCountry(value) {
  const original = clean(value);
  if (!original) return {country: null, originalCountryLabel: null};
  return {country: COUNTRY_ALIASES.get(original.toLocaleLowerCase('en')) || original, originalCountryLabel: original};
}

export function validCoordinates(source) {
  const latitude = number(source.latitude) ?? number(source.lat);
  const longitude = number(source.longitude) ?? number(source.lng);
  const valid = latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0);
  return {latitude, longitude, coordinateValidity: valid ? 'valid' : latitude === null && longitude === null ? 'missing' : 'invalid'};
}

export function migrateLegacyCourse({legacyDocumentId, source, migratedAt}) {
  const providerCourseId = clean(source.courseID);
  const sourceDigest = digest(source);
  if (!providerCourseId) {
    return {kind: 'quarantine', id: `missing_${digest([legacyDocumentId, sourceDigest]).slice(0, 32)}`, value: {
      schema: 'golfriend.course-migration-quarantine.v1', migrationVersion: MIGRATION_VERSION,
      reason: 'missing_provider_course_id', legacyDocumentId, sourceProject: SOURCE_PROJECT,
      sourceCollection: 'courses', preservedSourceDigest: sourceDigest,
      rawSourceReference: `course_migration_sources/${digest([legacyDocumentId]).slice(0, 40)}`,
      migratedAt, freshnessState: 'quarantined', resolutionState: 'unresolved',
    }, rawId: digest([legacyDocumentId]).slice(0, 40), raw: source};
  }
  const identity = clean(source.clubName) ?? clean(source.name) ?? providerCourseId;
  const country = normalizeCountry(source.country);
  const coordinates = validCoordinates(source);
  const incompleteReasons = [];
  if (coordinates.coordinateValidity !== 'valid') incompleteReasons.push(`${coordinates.coordinateValidity}_coordinates`);
  if (!country.country) incompleteReasons.push('missing_country');
  const value = {
    schema: COURSE_SCHEMA, schemaVersion: 2, ingestionVersion: MIGRATION_VERSION,
    courseID: providerCourseId, providerCourseId, provider: 'golf-api',
    normalizedIdentity: identity.toLocaleLowerCase('en'), displayName: identity,
    clubName: clean(source.clubName) ?? identity, name: clean(source.name) ?? identity,
    country: country.country, originalCountryLabel: country.originalCountryLabel,
    region: clean(source.state), state: clean(source.state), city: clean(source.city), address: clean(source.address),
    latitude: coordinates.latitude, longitude: coordinates.longitude,
    lat: coordinates.latitude, lng: coordinates.longitude, coordinatesStatus: coordinates.coordinateValidity,
    coordinateValidity: coordinates.coordinateValidity,
    holes: source.holes ?? null,
    licensedCourseData: {holes: source.holes ?? null, greenCoordinates: source.greenCoordinates ?? null, bunkerCoordinates: source.bunkerCoordinates ?? null, waterCoordinates: source.waterCoordinates ?? null},
    facilities: null, contact: null, profile: null,
    originalLegacyDocumentId: legacyDocumentId,
    source: {provider: 'golf-api', sourceCourseId: providerCourseId, sourceProject: SOURCE_PROJECT, sourceCollection: 'courses', originalLegacyDocumentId: legacyDocumentId},
    sourceProject: SOURCE_PROJECT, sourceCollection: 'courses',
    providerRetrievalAt: null, legacyCachedAt: source.cachedAt ?? null,
    migratedAt, freshnessState: 'unknown', verified: false,
    needsReview: incompleteReasons.length > 0, migrationState: incompleteReasons.length ? 'incomplete' : 'migrated', incompleteReasons,
    provenance: 'golf-api', rawSourceReference: `course_migration_sources/${providerCourseId}`,
    preservedSourceDigest: sourceDigest,
    migrationEvidence: {schema: 'golfriend.course-migration-evidence.v1', sourceDigest, transformationVersion: MIGRATION_VERSION, providerRequestCount: 0},
    publicationVersion: 1,
  };
  return {kind: 'canonical', id: providerCourseId, value, rawId: providerCourseId, raw: source};
}

export function planMigration(rows, migratedAt) {
  const seen = new Set(), canonical = [], quarantine = [], duplicates = [];
  for (const row of rows) {
    const result = migrateLegacyCourse({legacyDocumentId: row.id, source: row.data, migratedAt});
    if (result.kind === 'canonical') {
      if (seen.has(result.id)) duplicates.push(result.id); else { seen.add(result.id); canonical.push(result); }
    } else quarantine.push(result);
  }
  return {input: rows.length, canonical, quarantine, duplicates, digest: digest(rows)};
}
