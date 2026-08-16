// B5-R15 — central versioned economy configuration and the commission ceiling it enforces.
// No invoice, statement, payment or commission is issued anywhere in this path.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BASIS_POINT_SCALE,
  ECONOMY_CONFIG_SCHEMA,
  ECONOMY_POLICY_VERSIONS,
  economyPolicyByVersion,
  economyPolicyFor,
  maxCommissionBps,
  policyAppliesToReceipt,
  validateCommissionBps,
} from '../src/economy/economyConfig.mjs';
import { commissionState, invoiceEligibility } from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const at = '2026-08-15';

// --- the config is versioned, immutable and effective-dated ---------------
assert.equal(ECONOMY_CONFIG_SCHEMA, 'golfriend.economy.configuration.v1');
assert.equal(BASIS_POINT_SCALE, 10000);
assert.ok(Object.isFrozen(ECONOMY_POLICY_VERSIONS));
assert.ok(ECONOMY_POLICY_VERSIONS.every((policy) => Object.isFrozen(policy)));
assert.throws(() => { 'use strict'; ECONOMY_POLICY_VERSIONS[0].maxCommissionBps = 9999; });

// --- Founder pricing authority: 3% = 300 bps ------------------------------
const policy = economyPolicyFor(at);
assert.equal(policy.version, '2026-08-15.v1');
assert.equal(policy.bookingCommissionBps, 300, 'the initial booking commission is 3%');
assert.equal(policy.maxCommissionBps, 300, 'the authorized ceiling equals the authorized rate');
assert.equal(policy.approvedBy, 'Founder');
assert.equal(maxCommissionBps(at), 300);
// A day before the effective date has NO policy — fail closed, never a default.
assert.equal(economyPolicyFor('2026-08-14'), null);
assert.equal(maxCommissionBps('2026-08-14'), null);
assert.equal(economyPolicyFor('not-a-date'), null);
assert.equal(economyPolicyFor('2026-02-30'), null);

// --- the ceiling is enforced, not merely published ------------------------
assert.equal(validateCommissionBps(300, at).valid, true);
assert.equal(validateCommissionBps(301, at).reason, 'rate_exceeds_authorized_ceiling');
assert.equal(validateCommissionBps(1000, at).reason, 'rate_exceeds_authorized_ceiling');
// The generic 100% allowance is gone: 10000 bps is no longer acceptable anywhere.
assert.equal(validateCommissionBps(BASIS_POINT_SCALE, at).reason, 'rate_exceeds_authorized_ceiling');
assert.equal(validateCommissionBps(0, at).reason, 'rate_not_positive');
assert.equal(validateCommissionBps(-300, at).reason, 'rate_not_positive');
assert.equal(validateCommissionBps(300.5, at).reason, 'rate_must_be_integer_basis_points');
assert.equal(validateCommissionBps('300', at).reason, 'rate_must_be_integer_basis_points');
assert.equal(validateCommissionBps(300, '2026-08-14').reason, 'no_effective_economy_policy');

// --- the acquisition model reads the central bound, never a literal -------
const effectiveContract = { state: 'effective', signed: true, effectiveFrom: '2026-07-01', activatedAt: '2026-07-05', commissionBps: 300 };
const granted = commissionState(effectiveContract, at);
assert.equal(granted.effective, true);
assert.equal(granted.commissionBps, 300);
assert.equal(granted.policyVersion, '2026-08-15.v1', 'an effective commission records the policy version it was granted under');
// A rate above the central ceiling is refused even with a perfect contract.
for (const bps of [301, 1000, 5000, 10000, 99999]) {
  const over = commissionState({ ...effectiveContract, commissionBps: bps }, at);
  assert.equal(over.effective, false, `${bps} bps must be refused`);
  assert.equal(over.reason, 'rate_exceeds_authorized_ceiling');
  assert.equal(invoiceEligibility({ contract: { ...effectiveContract, commissionBps: bps } }, at).invoiceAllowed, false);
}
assert.equal(commissionState({ ...effectiveContract, commissionBps: 0 }, at).reason, 'no_agreed_rate');
// No policy in force means no commission, whatever the contract says.
assert.equal(commissionState({ ...effectiveContract, effectiveFrom: '2026-01-01', activatedAt: '2026-01-01' }, '2026-08-14').reason, 'no_effective_economy_policy');

// --- versions cannot be backdated ----------------------------------------
assert.equal(policyAppliesToReceipt('2026-08-15.v1', at).applies, true);
assert.equal(policyAppliesToReceipt('2026-08-15.v1', '2026-08-14').reason, 'policy_cannot_be_backdated');
assert.equal(policyAppliesToReceipt('no-such-version', at).reason, 'unknown_policy_version');
assert.equal(economyPolicyByVersion('no-such-version'), null);
assert.equal(economyPolicyByVersion('2026-08-15.v1').bookingCommissionBps, 300);

// --- source contracts -----------------------------------------------------
const config = read('../src/economy/economyConfig.mjs');
const model = read('../src/components/admin/v2/courseAcquisitionModel.mjs');
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
// The rate lives in ONE place. No other module may hard-code it.
assert.doesNotMatch(codeOnly(model), /\b300\b/, 'the acquisition model must not duplicate the commission figure');
assert.doesNotMatch(codeOnly(model), /MAX_COMMISSION_BPS\s*=/, 'the ceiling must come from the central config');
assert.match(model, /from'\.\.\/\.\.\/\.\.\/economy\/economyConfig\.mjs'/);
// This surface issues no money movement of any kind.
// No money movement: the config declares bounds, it never issues or transfers anything.
// (Prose may name invoices and charges in order to PROHIBIT them; executable calls may not.)
assert.doesNotMatch(codeOnly(config), /stripe|createInvoice|issueInvoice|capturePayment|payout\s*\(|transferFunds|chargeCard/i);
assert.doesNotMatch(codeOnly(config), /amountDue|totalDue|currency\s*:/i);
assert.doesNotMatch(codeOnly(config), /firebase|firestore|fetch\s*\(|httpsCallable|XMLHttpRequest/i);
assert.ok(ECONOMY_POLICY_VERSIONS[0].prohibited.some((rule) => /unsigned course/i.test(rule)));
assert.ok(ECONOMY_POLICY_VERSIONS[0].prohibited.some((rule) => /backdated/i.test(rule)));

console.log('Economy configuration verification PASS: versioned immutable policy, Founder 300 bps authority with a 300 bps ceiling, fail-closed before the effective date, generic 100% allowance removed, acquisition model bound to the central bound with the policy version recorded, and no backdating.');
