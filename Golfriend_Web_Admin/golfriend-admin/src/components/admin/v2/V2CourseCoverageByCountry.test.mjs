import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./V2CourseCoverageByCountry.tsx', import.meta.url), 'utf8');

test('country acquisition control matrix exposes only truthful states', () => {
  assert.match(source, /country\.country==='UNKNOWN'\?'Unavailable'/);
  assert.match(source, /canPause=job\?\.state==='queued'\|\|job\?\.state==='running'/);
  assert.match(source, /canResume=job\?\.state==='paused'/);
  assert.match(source, /Preview Plan/);
  assert.match(source, /Confirm Start/);
  assert.match(source, /job\.state==='completed'&&job\.nextDueAtMs/);
  assert.match(source, /job\.state==='paused'&&job\.retryAtMs/);
  assert.match(source, /countries\.every\(\(country\) => country\.totalCourses === 0\)/);
  assert.doesNotMatch(source, /Preview consumes provider quota/);
});

test('country plan copy guarantees zero provider calls and zero course writes', () => {
  assert.match(source, /Plans make zero provider calls and zero course writes/);
  assert.match(source, /only the scheduled worker contacts the provider/);
});

test('global preview reports loading, returned server summary, and actionable error state', () => {
  assert.match(source, /globalPreviewState==='loading'/);
  assert.match(source, /Preparing the read-only global preview/);
  assert.match(source, /Global Preview summary/);
  assert.match(source, /Receipt: \{String\(globalPreview\.receiptId/);
  assert.match(source, /No provider calls or course writes were requested/);
  assert.match(source, /disabled=\{globalPreviewState==='loading'\}/);
  assert.match(source, /service\.previewGlobalRefresh\(\)/);
});
