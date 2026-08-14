import assert from "node:assert/strict";
import {assertLeaseOwner, deterministicRecoveryReceiptId, MAX_LEASE_MS, recoveryReconciliation, requireRecoveryConfiguration, shouldRecoverLease} from "./courseIngestionRecovery.js";

let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log(`  ✓ ${name}`); }

check("configuration is required", () => assert.throws(() => requireRecoveryConfiguration(undefined), /RECOVERY_UNCONFIGURED/));
check("lease duration is bounded", () => assert.throws(() => requireRecoveryConfiguration({leaseDurationMs: MAX_LEASE_MS + 1, maxJobs: 1}), /RECOVERY_UNCONFIGURED/));
check("batch size is bounded", () => assert.throws(() => requireRecoveryConfiguration({leaseDurationMs: 60_000, maxJobs: 51}), /RECOVERY_UNCONFIGURED/));
check("valid configuration is normalized", () => assert.deepEqual(requireRecoveryConfiguration({leaseDurationMs: 120_000, maxJobs: 10}), {leaseDurationMs: 120_000, maxJobs: 10}));
check("owner and token must match", () => assert.throws(() => assertLeaseOwner({status: "running", lease: {ownerUid: "a", token: "t", expiresAtMs: 200}}, "b", "t", 100), /LEASE_OWNERSHIP_LOST/));
check("expired lease is rejected", () => assert.throws(() => assertLeaseOwner({status: "running", lease: {ownerUid: "a", token: "t", expiresAtMs: 100}}, "a", "t", 100), /LEASE_EXPIRED/));
check("active matching lease passes", () => assert.doesNotThrow(() => assertLeaseOwner({status: "running", lease: {ownerUid: "a", token: "t", expiresAtMs: 101}}, "a", "t", 100)));
check("recovery releases only unused reservation", () => assert.deepEqual(recoveryReconciliation({quotaReservation: {reservedCalls: 20, attemptedCalls: 7}}), {reservedCalls: 20, attemptedCalls: 7, releaseCalls: 13}));
check("attempt count cannot exceed reservation", () => assert.equal(recoveryReconciliation({quotaReservation: {reservedCalls: 5, attemptedCalls: 99}}).releaseCalls, 0));
check("recovery receipt is deterministic per lease", () => { const a = deterministicRecoveryReceiptId("j", "t"); assert.equal(a, deterministicRecoveryReceiptId("j", "t")); assert.notEqual(a, deterministicRecoveryReceiptId("j", "u")); });
check("expired matching lease is recoverable", () => assert.equal(shouldRecoverLease({status: "running", lease: {token: "t", expiresAtMs: 100}}, "t", 100), true));
check("active lease is not recoverable", () => assert.equal(shouldRecoverLease({status: "running", lease: {token: "t", expiresAtMs: 101}}, "t", 100), false));
check("token change prevents stale recovery", () => assert.equal(shouldRecoverLease({status: "running", lease: {token: "new", expiresAtMs: 1}}, "old", 100), false));
check("recovered retry is idempotently ignored", () => assert.equal(shouldRecoverLease({status: "recovered", lease: {token: "t", expiresAtMs: 1}}, "t", 100), false));

console.log(`course ingestion recovery: ${passed} checks passed.`);
