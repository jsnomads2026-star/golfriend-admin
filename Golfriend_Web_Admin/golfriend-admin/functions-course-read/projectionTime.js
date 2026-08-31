'use strict';

const timestampMillis = value => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value) < 100000000000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() !== '' && Number.isFinite(numeric)) return timestampMillis(numeric);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') return timestampMillis(value.toMillis());
    const seconds = value.seconds ?? value._seconds;
    const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (Number.isFinite(Number(seconds)) && Number.isFinite(Number(nanos))) return Number(seconds) * 1000 + Math.floor(Number(nanos) / 1000000);
  }
  return null;
};

const displayTime = value => {
  const milliseconds = timestampMillis(value);
  return milliseconds === null || !Number.isFinite(milliseconds) ? null : new Date(milliseconds).toISOString();
};

const isTimeKey = key => /(?:At|AtMs|Timestamp|Time)$/i.test(key);
const displaySafe = value => {
  if (Array.isArray(value)) return value.map(displaySafe);
  if (!value || typeof value !== 'object' || value instanceof Date || typeof value.toMillis === 'function') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, isTimeKey(key) ? displayTime(child) : displaySafe(child)]));
};

module.exports = Object.freeze({ timestampMillis, displayTime, displaySafe });
