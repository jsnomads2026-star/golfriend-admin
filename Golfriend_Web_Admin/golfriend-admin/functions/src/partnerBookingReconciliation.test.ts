import assert from "node:assert/strict";
import { bookingReconciliationDigest, buildBookingReconciliationReceipt, replayBookingReconciliation, validateBookingReconciliationRequest } from "./partnerBookingReconciliation.js";

let n = 0;
const test = (name: string, fn: () => void) => { fn(); console.log(`ok ${++n} - ${name}`); };
const raw = { actorUid:"actor_1", role:"organization_admin", organizationId:"org_1", bookingId:"booking_1", operationId:"operation_1", commandId:"command_1", reason:"Provider evidence reviewed", reconciliationToken:`pbrt_${"a".repeat(43)}`, outcome:"external_review", evidence:{ externalReviewId:"review_1", evidenceDigest:"a".repeat(64) } };

test("authoritative organization roles may only escalate for external review", () => {
  for (const role of ["organization_admin", "organization_owner"])
    assert.equal(validateBookingReconciliationRequest({ ...raw, role }).outcome, "external_review");
  for (const [outcome, evidence] of [
    ["completed_verified_receipt", { receiptId:"r_1", evidenceDigest:"a".repeat(64) }],
    ["failed_no_effect", { noEffect:true, evidenceDigest:"b".repeat(64) }],
    ["released_without_execution", { releaseReceiptId:"r_2", noExecution:true }],
  ] as const) assert.throws(() => validateBookingReconciliationRequest({ ...raw, outcome, evidence }), /RECONCILIATION/);
});
test("legacy roles arbitrary facts missing reason or forged token are denied", () => {
  for (const value of [{...raw,role:"manager"},{...raw,status:"confirmed"},{...raw,reason:"short"},{...raw,reconciliationToken:"forged"},{...raw,evidence:{...raw.evidence,payment:"paid"}}])
    assert.throws(() => validateBookingReconciliationRequest(value), /RECONCILIATION/);
});
test("stable exact command replay returns immutable audit receipt", () => {
  const input=validateBookingReconciliationRequest(raw), receipt=buildBookingReconciliationReceipt(input);
  assert.equal(replayBookingReconciliation(receipt,input),receipt); assert.equal(receipt.immutable,true);
});
test("changed command reason or evidence conflicts", () => {
  const input=validateBookingReconciliationRequest(raw), receipt=buildBookingReconciliationReceipt(input);
  for (const changed of [validateBookingReconciliationRequest({...raw,evidence:{externalReviewId:"review_2",evidenceDigest:"a".repeat(64)}}),validateBookingReconciliationRequest({...raw,reason:"Different reviewed evidence"})]) {
    assert.notEqual(bookingReconciliationDigest(input),bookingReconciliationDigest(changed));
    assert.throws(()=>replayBookingReconciliation(receipt,changed),/RECONCILIATION_CONFLICT/);
  }
});
console.log(`partner booking reconciliation: ${n} checks passed.`);
