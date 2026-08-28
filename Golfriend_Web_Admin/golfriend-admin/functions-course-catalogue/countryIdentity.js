'use strict';

function countryPriorityKey(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
  return normalized === 'TH' || normalized === 'THAILAND' ? 'TH' : normalized || 'UNKNOWN';
}

module.exports = Object.freeze({ countryPriorityKey });
