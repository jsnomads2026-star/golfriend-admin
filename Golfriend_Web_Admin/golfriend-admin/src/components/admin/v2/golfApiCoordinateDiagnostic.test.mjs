import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateEvidenceFromRaw, quotaEvidenceFromRaw } from './golfApiCoordinateDiagnostic.ts';

test('extracts only coordinate leaves and preserves exact field paths and types', () => {
  const evidence = coordinateEvidenceFromRaw({ latitude: 12.1, location: { lng: '100.2', label: 'Pattaya' }, courses: [{ coordinates: { latitude: null, longitude: 100.3 } }] });
  assert.deepEqual(evidence, [
    { path: '$.latitude', type: 'number', value: 12.1 },
    { path: '$.location.lng', type: 'string', value: '100.2' },
    { path: '$.courses[0].coordinates.latitude', type: 'null', value: null },
    { path: '$.courses[0].coordinates.longitude', type: 'number', value: 100.3 },
  ]);
});

test('extracts provider remaining quota without returning unrelated fields', () => {
  assert.deepEqual(quotaEvidenceFromRaw({ apiRequestsLeft: 3886.1, club: { apiRequestsLeft: '3885.1' }, secret: 'never expose' }), [
    { path: '$.apiRequestsLeft', type: 'number', value: 3886.1 },
    { path: '$.club.apiRequestsLeft', type: 'string', value: '3885.1' },
  ]);
});
