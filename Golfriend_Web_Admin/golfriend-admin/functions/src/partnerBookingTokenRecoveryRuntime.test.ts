import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const source = readFileSync(
  join(__dirname, "..", "src", "partnerBookingTokenRecoveryRuntime.ts"),
  "utf8",
);
let count = 0;
const check = (name: string, assertion: () => void) => {
  assertion();
  console.log(`ok ${++count} - ${name}`);
};

check("Auth App Check secret", () => {
  assert.match(source, /enforceAppCheck:true,secrets:\[TOKEN\]/);
  assert.match(source, /if\(!request\.auth\)/);
  assert.match(source, /if\(!secret\)/);
});
check("V2 collections only", () => {
  assert.match(source, /enterprise_booking_operation_authorizations_v2/);
  assert.match(source, /enterprise_booking_confirmation_tokens_v2/);
  assert.match(source, /enterprise_booking_token_rotation_receipts_v2/);
  assert.doesNotMatch(source, /play_booking_confirmation_tokens|play_booking_audits/);
});
check("current authority version and ambiguity", () => {
  assert.match(source, /transactionBookingAuthority/);
  assert.match(source, /authority\.sourceVersion!==intent\.authoritySourceVersion/);
  assert.match(source, /b\.version!==intent\.expectedVersion/);
  assert.match(source, /ambiguous_locked/);
});
check("atomic revoke create receipt", () => {
  assert.match(source, /tx\.update\(oldTokenRef,\{state:"revoked"/);
  assert.match(source, /tx\.create\(newTokenRef/);
  assert.match(source, /tx\.create\(receiptRef/);
});
check("raw token response only", () => {
  assert.doesNotMatch(source, /tx\.(create|update)\([^\n]*confirmationToken/);
  assert.match(source, /confirmationToken:candidate\.token/);
});
console.log(`partner booking token recovery runtime: ${count} checks passed.`);
