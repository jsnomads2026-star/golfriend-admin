// Read-only Director projection of the canonical V2 economy collections.
// This module deliberately accepts already-read documents so it is testable
// without a Firebase emulator and never becomes a write path.

export type EconomyDocument = { id: string; data: Record<string, unknown> };

const number = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;

export function buildV2EconomyMasterSnapshot(input: {
  policies: EconomyDocument[];
  lots: EconomyDocument[];
  journals: EconomyDocument[];
  reconciliationCases: EconomyDocument[];
  policyAudit: EconomyDocument[];
}) {
  const activePolicies = input.policies.filter(({ data }) => data.schema === 'golfriend.economy-policy-version.v1' && data.state === 'active').map(({ id, data }) => ({ id, policyVersion: text(data.policyVersion) ?? 'unrecorded', purpose: text(data.purpose) ?? 'unrecorded', amountTee: Number.isInteger(data.amountTee) ? Number(data.amountTee) : null, greenFeeIncluded: typeof data.greenFeeIncluded === 'boolean' ? data.greenFeeIncluded : null, effectiveAt: text(data.effectiveAt) })).sort((left, right) => String(right.effectiveAt ?? '').localeCompare(String(left.effectiveAt ?? '')));
  const inventory = new Map<string, { purpose: string; policyVersion: string; amountTee: number | null; reserved: number; settled: number; released: number; total: number }>();
  for (const policy of activePolicies) inventory.set(`${policy.purpose}|${policy.policyVersion}|${policy.amountTee ?? 'unrecorded'}`, { purpose: policy.purpose, policyVersion: policy.policyVersion, amountTee: policy.amountTee, reserved: 0, settled: 0, released: 0, total: 0 });
  for (const { data } of input.journals) {
    const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {};
    const purpose = text(metadata.purpose) ?? 'unrecorded';
    const debit = Array.isArray(data.postings) ? data.postings.find((posting) => posting && typeof posting === 'object' && (posting as Record<string, unknown>).direction === 'debit') as Record<string, unknown> | undefined : undefined;
    const amountTee = number(debit?.amountTee);
    const matchingPolicy = activePolicies.find((policy) => policy.purpose === purpose && (policy.amountTee === null || policy.amountTee === amountTee));
    const policyVersion = text(data.policyVersion) ?? matchingPolicy?.policyVersion ?? 'unrecorded';
    const key = `${purpose}|${policyVersion}|${amountTee || 'unrecorded'}`;
    const row = inventory.get(key) ?? { purpose, policyVersion, amountTee: amountTee || null, reserved: 0, settled: 0, released: 0, total: 0 };
    const command = text(data.commandType) ?? 'unrecorded';
    if (command === 'ReserveValue') row.reserved += amountTee;
    if (command === 'SettleReservation') row.settled += amountTee;
    if (command === 'ReleaseReservation') row.released += amountTee;
    row.total += amountTee;
    inventory.set(key, row);
  }
  const lots = input.lots.filter(({ data }) => data.schema === 'golfriend.tee-lot.v1').reduce((total, { data }) => ({ issued: total.issued + number(data.issuedQuantity), remaining: total.remaining + number(data.remainingQuantity), reserved: total.reserved + number(data.reservedQuantity) }), { issued: 0, remaining: 0, reserved: 0 });
  const recentLedger = input.journals.filter(({ data }) => data.entryType === 'journal_entry_v1').map(({ id, data }) => ({ entryId: text(data.entryId) ?? id, commandType: text(data.commandType) ?? 'unrecorded', createdAt: text(data.createdAt), policyVersion: text(data.policyVersion) ?? 'not recorded by canonical journal', debitTee: number((data.balance as Record<string, unknown> | undefined)?.debitTotalTee), creditTee: number((data.balance as Record<string, unknown> | undefined)?.creditTotalTee), balanced: (data.balance as Record<string, unknown> | undefined)?.isBalanced === true })).sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))).slice(0, 25);
  const countryRows = new Map<string, { countryCode: string; journalCount: number; teeVolume: number }>();
  for (const { data } of input.journals) { const countryCode = text(data.countryCode); if (!countryCode) continue; const row = countryRows.get(countryCode) ?? { countryCode, journalCount: 0, teeVolume: 0 }; row.journalCount += 1; row.teeVolume += number((data.balance as Record<string, unknown> | undefined)?.debitTotalTee); countryRows.set(countryCode, row); }
  return { schema: 'golfriend.admin.v2-economy-master.v1', readOnly: true, policies: activePolicies, teeInventory: { ...lots, available: lots.remaining - lots.reserved, byAction: [...inventory.values()] }, ledger: { entriesReviewed: recentLedger.length, balancedEntries: recentLedger.filter((entry) => entry.balanced).length, unbalancedEntries: recentLedger.filter((entry) => !entry.balanced).length, pendingReconciliationCases: input.reconciliationCases.filter(({ data }) => data.state === 'pending').length, recentEntries: recentLedger }, countryUsage: countryRows.size > 0 ? { status: 'available', rows: [...countryRows.values()].sort((left, right) => right.teeVolume - left.teeVolume) } : { status: 'unavailable', rows: [], reason: 'Canonical V2 journals do not currently record a countryCode.' }, policyAudit: input.policyAudit.length > 0 ? { status: 'available', entries: input.policyAudit.map(({ id, data }) => ({ id, policyVersion: text(data.policyVersion) ?? 'unrecorded', actionType: text(data.actionType) ?? 'unrecorded', reason: text(data.reason), createdAt: text(data.createdAt) })).slice(0, 50) } : { status: 'unavailable', entries: [], reason: 'No canonical V2 policy-change audit records are available.' } } as const;
}
