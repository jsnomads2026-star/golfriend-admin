import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const contract=resolve(ROOT,'scripts/enterprise-staff-contract-verify.mjs');
assert.equal(existsSync(contract),true);
const source=readFileSync(contract,'utf8');
for(const target of [
  'enterpriseAuthorityRuntime','EnterpriseAuthorityPortal','organizationAuthorityModel','organizationAuthorityService','ENTERPRISE_STAFF_ROLE_MAPPING',
]) assert.match(source,new RegExp(target));
assert.doesNotMatch(source,/manageEnterpriseStaff is exported|hostile assertions/);
const output=execFileSync(process.execPath,[contract],{cwd:ROOT,encoding:'utf8'});
assert.match(output,/Enterprise staff contract PASS/);
console.log('Coverage honesty PASS: canonical staff authority contract resolves to real runtime, model, service, portal, and role-mapping targets.');
