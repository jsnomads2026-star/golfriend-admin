// ==========================================
// FILE: functions/src/courseSync.ts
// Pure, side-effect-free core for the server-side Golf-API course sync.
// Kept separate from index.ts so the matching/validation/diff logic is unit
// testable without Firebase, network, or secrets.
// ==========================================

export interface CourseRecord {
  courseID?: string;
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
  manualLock?: boolean;
  gpsSource?: string;
  requiresManualGPS?: boolean;
  [k: string]: unknown;
}

export interface ProviderCourse {
  courseID?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

export type SyncResult =
  | 'updated'
  | 'nochange'
  | 'conflict'
  | 'missing'
  | 'error'
  | 'skipped_manual';

export interface ClassifyOutput {
  result: SyncResult;
  message: string;
  before: { latitude: number | null; longitude: number | null };
  after?: { latitude: number; longitude: number };
}

const COORD_EPSILON = 1e-6;

/** Provider IDs must be non-trivial alphanumerics — never blank/"unknown". */
export function isValidProviderId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[A-Za-z0-9_-]{3,}$/.test(id) &&
    !id.toLowerCase().includes('unknown')
  );
}

/** Strict WGS84 range check that also rejects the (0,0) "null island" sentinel. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  if (Math.abs(la) < COORD_EPSILON && Math.abs(ln) < COORD_EPSILON) return false;
  return true;
}

/** A course whose GPS was hand-corrected must not be silently overwritten. */
export function isManualLocked(rec: CourseRecord): boolean {
  return rec.manualLock === true || rec.gpsSource === 'manual';
}

/** Deterministic match: the provider record's id must equal the requested id. */
export function providerIdMatches(requestedId: string, provider: ProviderCourse): boolean {
  return isValidProviderId(provider.courseID) && String(provider.courseID) === String(requestedId);
}

export function coordsEqual(aLat: number, aLng: number, bLat: number, bLng: number): boolean {
  return Math.abs(aLat - bLat) < COORD_EPSILON && Math.abs(aLng - bLng) < COORD_EPSILON;
}

function readNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && !(typeof v === 'string' && v.trim() === '')) return n;
  }
  return null;
}

/**
 * Decide what a single course sync should do, given the stored record and the
 * fetched provider result (null = the provider had no course for this id).
 * Pure: no writes, no I/O. `after` is present only when result === 'updated'.
 */
export function classifyCourseSync(
  requestedId: string,
  existing: CourseRecord,
  provider: ProviderCourse | null
): ClassifyOutput {
  const beforeLat = readNum(existing.latitude, existing.lat);
  const beforeLng = readNum(existing.longitude, existing.lng);
  const before = { latitude: beforeLat, longitude: beforeLng };

  if (!isValidProviderId(requestedId)) {
    return { result: 'error', message: 'Stored course has an invalid provider id.', before };
  }
  if (!provider) {
    return { result: 'missing', message: 'Provider returned no course for this id.', before };
  }
  if (!providerIdMatches(requestedId, provider)) {
    return { result: 'conflict', message: `Provider id mismatch (got "${String(provider.courseID)}").`, before };
  }
  if (!isValidCoordinate(provider.latitude, provider.longitude)) {
    return { result: 'conflict', message: 'Provider coordinates failed validation.', before };
  }

  const pLat = Number(provider.latitude);
  const pLng = Number(provider.longitude);

  if (isManualLocked(existing)) {
    if (beforeLat !== null && beforeLng !== null && coordsEqual(beforeLat, beforeLng, pLat, pLng)) {
      return { result: 'nochange', message: 'Manual-locked and already matches provider.', before };
    }
    return { result: 'skipped_manual', message: 'Manual correction preserved; provider change not applied.', before };
  }

  if (beforeLat !== null && beforeLng !== null && coordsEqual(beforeLat, beforeLng, pLat, pLng)) {
    return { result: 'nochange', message: 'Already up to date.', before };
  }

  return { result: 'updated', message: 'Coordinates updated from provider.', before, after: { latitude: pLat, longitude: pLng } };
}
