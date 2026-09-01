// Documentation-source guard for the V2 Partner Authority contract.
// It intentionally performs no Firebase operation and imports no runtime code.
import { readFileSync } from 'node:fs';
import {
  CANONICAL_V2_PROJECT_ID,
  V1_FORBIDDEN,
  resolveFirebaseTarget,
} from '../src/firebaseTarget.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fail = (message) => {
  console.error(`❌ Partner Authority source-selection gate failed: ${message}`);
  process.exit(1);
};

const firebaseRc = JSON.parse(readFileSync(`${ROOT}.firebaserc`, 'utf8'));
const firebaseJson = JSON.parse(readFileSync(`${ROOT}firebase.json`, 'utf8'));
const adr = readFileSync(`${ROOT}docs/PARTNER_AUTHORITY_V2_HOME.md`, 'utf8');

if (firebaseRc?.projects?.default !== CANONICAL_V2_PROJECT_ID) {
  fail(`.firebaserc default must be ${CANONICAL_V2_PROJECT_ID}; V1 is not an allowed Partner Authority target.`);
}

const defaultFunctions = (firebaseJson.functions || []).find((entry) => entry.codebase === 'default');
if (!defaultFunctions || defaultFunctions.source !== 'functions') {
  fail('firebase.json must retain the default Functions codebase at functions/.');
}

if (!adr.includes('`partner_applications`') || !adr.includes('`partner_authority_audit`')) {
  fail('the accepted Partner Authority V2 contract is missing its canonical collection IDs.');
}

for (const forbidden of V1_FORBIDDEN) {
  if (JSON.stringify(firebaseRc).includes(forbidden)) {
    fail(`.firebaserc contains forbidden V1 identifier ${JSON.stringify(forbidden)}.`);
  }
}

let rejectedV1 = false;
try {
  resolveFirebaseTarget('golfriend-v1', {});
} catch {
  rejectedV1 = true;
}
if (!rejectedV1) fail('the Firebase target resolver accepted golfriend-v1.');

console.log(`✅ Partner Authority source-selection gate passed: ${CANONICAL_V2_PROJECT_ID} + functions/src/index.ts only; V1 is rejected.`);
