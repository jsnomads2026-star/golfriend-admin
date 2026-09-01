import assert from "node:assert";
import {requireAuthenticatedUid} from "./partnerAuthority.js";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

check("missing callable auth fails closed", () => {
  assert.throws(() => requireAuthenticatedUid(undefined), (error: any) => error?.code === "unauthenticated");
});

check("authenticated callable actor is preserved", () => {
  assert.equal(requireAuthenticatedUid("synthetic-applicant"), "synthetic-applicant");
});

console.log(`\npartnerAuthority core: ${passed} checks passed.`);
