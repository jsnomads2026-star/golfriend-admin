export type CourseRecord = { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown; manualLock?: boolean; trusted?: boolean; gpsSource?: string; requiresManualGPS?: boolean };
export type ProviderCourse = { courseID?: unknown; latitude?: unknown; longitude?: unknown };
export type SyncResult = 'updated' | 'nochange' | 'conflict' | 'missing' | 'skipped_manual';
export type SyncDecision = { result: SyncResult; before: { latitude: number | null; longitude: number | null }; after?: { latitude: number; longitude: number } };
const number = (value: unknown) => typeof value === 'string' && !value.trim() ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export const isValidProviderId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{3,}$/.test(value) && !value.toLowerCase().includes('unknown');
export const isValidCoordinate = (lat: unknown, lng: unknown) => { const a = number(lat), b = number(lng); return a !== null && b !== null && a >= -90 && a <= 90 && b >= -180 && b <= 180 && (a !== 0 || b !== 0); };
const manualLocked = (course: CourseRecord) => course.manualLock === true || course.trusted === true || course.gpsSource === 'manual' || course.requiresManualGPS === true;
export function classifyCourseSync(providerId: string, course: CourseRecord, provider: ProviderCourse | null): SyncDecision {
  const before = { latitude: number(course.latitude) ?? number(course.lat), longitude: number(course.longitude) ?? number(course.lng) };
  if (!provider) return { result: 'missing', before };
  if (!isValidProviderId(providerId) || provider.courseID !== providerId || !isValidCoordinate(provider.latitude, provider.longitude)) return { result: 'conflict', before };
  const after = { latitude: Number(provider.latitude), longitude: Number(provider.longitude) };
  if (manualLocked(course)) return { result: before.latitude === after.latitude && before.longitude === after.longitude ? 'nochange' : 'skipped_manual', before };
  if (before.latitude === after.latitude && before.longitude === after.longitude) return { result: 'nochange', before };
  return { result: 'updated', before, after };
}
