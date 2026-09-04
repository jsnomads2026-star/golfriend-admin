export type CoordinateEvidence = { path: string; type: string; value: string | number | boolean | null };

const coordinateKeys = new Set(['latitude', 'longitude', 'lat', 'lng']);

const scalar = (value: unknown): value is string | number | boolean | null => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const valueType = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

export function coordinateEvidenceFromRaw(value: unknown, path = '$', result: CoordinateEvidence[] = []): CoordinateEvidence[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => coordinateEvidenceFromRaw(item, `${path}[${index}]`, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemPath = `${path}.${key}`;
    const normalizedKey = key.toLocaleLowerCase();
    const relevant = coordinateKeys.has(normalizedKey);
    if (relevant && scalar(item)) result.push({ path: itemPath, type: valueType(item), value: item });
    if (item && typeof item === 'object') coordinateEvidenceFromRaw(item, itemPath, result);
  }
  return result;
}

export function quotaEvidenceFromRaw(value: unknown, path = '$', result: CoordinateEvidence[] = []): CoordinateEvidence[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => quotaEvidenceFromRaw(item, `${path}[${index}]`, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemPath = `${path}.${key}`;
    if (key === 'apiRequestsLeft' && scalar(item)) result.push({ path: itemPath, type: valueType(item), value: item });
    if (item && typeof item === 'object') quotaEvidenceFromRaw(item, itemPath, result);
  }
  return result;
}
