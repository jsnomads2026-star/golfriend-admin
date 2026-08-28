import assert from 'node:assert/strict';
import test from 'node:test';
import authority from '../functions-course-catalogue/v2DirectorAuthority.js';
import { isActiveAdminDoc, isActiveDirectorDoc } from '../src/auth/roleJourney.js';
import { readFileSync } from 'node:fs';

test('Admin shell and catalogue status share one active Director predicate', () => {
  const director = { role: 'Director', status: ' Active ' };
  assert.equal(isActiveAdminDoc(director), true);
  assert.equal(isActiveDirectorDoc(director), true);
  assert.equal(authority.isActiveV2Director(director), true);
  for (const rejected of [
    null, {}, { role: 'Director', status: 'Suspended' }, { role: 'director', status: 'Active' }, { role: 'Manager', status: 'Active' },
  ]) assert.equal(authority.isActiveV2Director(rejected), false);
});

test('catalogue status reads its V2 Director authority from the shared contract', () => {
  const source = readFileSync(new URL('../functions-course-catalogue/index.js', import.meta.url), 'utf8');
  assert.match(source, /require\('\.\/v2DirectorAuthority'\)/);
  assert.match(source, /db\.collection\('admin_users'\)\.doc\(request\.auth\.uid\)\.get\(\)/);
  assert.match(source, /isActiveV2Director\(record\.data\(\)\)/);
  assert.match(source, /getGolfApiCatalogueStatus=onCall\(\{region:REGION,enforceAppCheck:true\}/);
});
