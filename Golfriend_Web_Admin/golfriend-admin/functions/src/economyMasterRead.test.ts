import assert from 'node:assert';
import { buildV2EconomyMasterSnapshot } from './economyMasterRead.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

const policy = { id: 'policy-a', data: { schema: 'golfriend.economy-policy-version.v1', state: 'active', policyVersion: 'booking-concierge-five-tee-v1', purpose: 'BOOKING_CONCIERGE_V1', amountTee: 5, greenFeeIncluded: false, effectiveAt: '2026-08-01T00:00:00.000Z' } };
const journal = { id: 'journal-a', data: { entryType: 'journal_entry_v1', entryId: 'entry-a', commandType: 'ReserveValue', createdAt: '2026-08-10T00:00:00.000Z', metadata: { purpose: 'BOOKING_CONCIERGE_V1' }, balance: { debitTotalTee: 5, creditTotalTee: 5, isBalanced: true }, postings: [{ direction: 'debit', amountTee: 5 }, { direction: 'credit', amountTee: 5 }] } };

check('projects active policy, lot inventory, balanced journal and pending reconciliation', () => {
  const result = buildV2EconomyMasterSnapshot({ policies: [policy], lots: [{ id: 'lot-a', data: { schema: 'golfriend.tee-lot.v1', issuedQuantity: 12, remainingQuantity: 9, reservedQuantity: 5 } }], journals: [journal], reconciliationCases: [{ id: 'case-a', data: { state: 'pending' } }], policyAudit: [] });
  assert.equal(result.policies[0].amountTee, 5);
  assert.deepEqual(result.teeInventory, { issued: 12, remaining: 9, reserved: 5, available: 4, byAction: [{ purpose: 'BOOKING_CONCIERGE_V1', policyVersion: 'booking-concierge-five-tee-v1', amountTee: 5, reserved: 5, settled: 0, released: 0, total: 5 }] });
  assert.equal(result.ledger.balancedEntries, 1);
  assert.equal(result.ledger.pendingReconciliationCases, 1);
});

check('does not invent country or policy audit data', () => {
  const result = buildV2EconomyMasterSnapshot({ policies: [], lots: [], journals: [journal], reconciliationCases: [], policyAudit: [] });
  assert.equal(result.countryUsage.status, 'unavailable');
  assert.equal(result.policyAudit.status, 'unavailable');
});

console.log(`\neconomyMasterRead: ${passed} checks passed.`);
