export interface ManualCourseCorrection {
  courseId: string;
  latitude: number;
  longitude: number;
}

function validCourseId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(value);
}

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function normalizeManualCourseCorrection(input: unknown): ManualCourseCorrection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('correction must be an object');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['courseId', 'latitude', 'longitude'].includes(key))) {
    throw new TypeError('correction contains an unsupported field');
  }
  if (!validCourseId(value.courseId)) throw new TypeError('courseId is invalid');
  const latitude = finiteCoordinate(value.latitude, -90, 90);
  const longitude = finiteCoordinate(value.longitude, -180, 180);
  if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) {
    throw new TypeError('coordinates are invalid');
  }
  return Object.freeze({ courseId: value.courseId, latitude, longitude });
}
