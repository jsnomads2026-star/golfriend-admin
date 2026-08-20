// Dry-run-only evidence gate for a future, separately authorized economy import.
// It deliberately contains no Firebase imports and cannot write any data.

export const V2_ECONOMY_BOOTSTRAP_MAP = Object.freeze({
  policy: { source: 'v2_economy_policy_versions/policy_<sha256(golfriend:v2-economy:policy:booking-concierge-five-tee-v1)>', target: 'v2_economy_policy_versions/<same deterministic id>', schema: 'golfriend.economy-policy-version.v1' },
  lots: { source: 'v2_tee_lots/lot_<sha256(...)>', target: 'v2_tee_lots/<same deterministic id>', schema: 'golfriend.tee-lot.v1' },
  journal: { source: 'v2_economy_journal_entries/journal_<sha256(...)>', target: 'v2_economy_journal_entries/<same deterministic id>', schema: 'journal_entry_v1' },
  reconciliation: { source: 'v2_economy_reconciliation_cases/reconciliation_<sha256(...)>', target: 'v2_economy_reconciliation_cases/<same deterministic id>', schema: 'golfriend.economy-reconciliation-case.v1' },
  policyAudit: { source: 'not implemented by the canonical V2 service', target: 'v2_economy_policy_change_audit/<audit id>', schema: 'unproven' },
} as const);

type CollectionEvidence = { count: number | null; freshestAt: string | null; schemaValid: boolean };
type SourceEvidence = {
  canonicalService: 'teeReservationFirestoreService.js';
  policyVersion: 'booking-concierge-five-tee-v1';
  observedAt: string | null;
  collections: Record<keyof typeof V2_ECONOMY_BOOTSTRAP_MAP, CollectionEvidence>;
  countryCodes: string[];
  allJournalEntriesBalanced: boolean;
  lotQuantitiesReconcile: boolean;
};
type TargetEvidence = {
  projectId: string;
  observedAt: string | null;
  confirmation: 'unconfirmed' | 'confirmed-empty' | 'confirmed-compatible';
  collections: Record<keyof typeof V2_ECONOMY_BOOTSTRAP_MAP, CollectionEvidence>;
};

export type EconomyBootstrapEvidence = { mode: 'dry-run'; source: SourceEvidence; target: TargetEvidence };
export type EconomyBootstrapPlan = { status: 'refused' | 'ready-for-separately-authorized-migration'; blockers: string[]; schemaMap: typeof V2_ECONOMY_BOOTSTRAP_MAP };

const isTimestamp = (value: string | null) => value !== null && !Number.isNaN(Date.parse(value));

/** Evaluates evidence only. It never returns write operations or Firebase references. */
export function planV2EconomyBootstrap(evidence: EconomyBootstrapEvidence): EconomyBootstrapPlan {
  if (evidence.mode !== 'dry-run') throw new Error('Economy bootstrap validator only accepts dry-run evidence.');
  const blockers: string[] = [];
  const { source, target } = evidence;
  if (source.canonicalService !== 'teeReservationFirestoreService.js' || source.policyVersion !== 'booking-concierge-five-tee-v1') blockers.push('Canonical V2 service and active policy version are not proven.');
  if (!isTimestamp(source.observedAt)) blockers.push('Canonical source observation timestamp is missing or invalid.');
  if (target.projectId !== 'golfriend-v2-production-2ee34') blockers.push('Target is not the confirmed V2 Production project.');
  if (!isTimestamp(target.observedAt) || target.confirmation === 'unconfirmed') blockers.push('V2 target state has not been explicitly confirmed by a current read-only observation.');
  for (const [name, map] of Object.entries(V2_ECONOMY_BOOTSTRAP_MAP) as Array<[keyof typeof V2_ECONOMY_BOOTSTRAP_MAP, typeof V2_ECONOMY_BOOTSTRAP_MAP[keyof typeof V2_ECONOMY_BOOTSTRAP_MAP]]>) {
    const observed = source.collections[name];
    if (map.schema === 'unproven') { blockers.push('Canonical policy-change audit records are not implemented or proven.'); continue; }
    if (observed.count === null || !observed.schemaValid || (observed.count > 0 && !isTimestamp(observed.freshestAt))) blockers.push(`Canonical ${name} collection is not proven with count, schema, and freshness evidence.`);
  }
  if (!source.allJournalEntriesBalanced) blockers.push('Journal double-entry balance evidence is incomplete.');
  if (!source.lotQuantitiesReconcile) blockers.push('Tee-lot issued, remaining, and reserved quantities do not reconcile.');
  if (!source.countryCodes.length || source.countryCodes.some((code) => !/^[A-Z]{2}$/.test(code))) blockers.push('ISO country-code coverage is absent or invalid; country-level reporting cannot be migrated truthfully.');
  if (target.confirmation === 'confirmed-compatible' && Object.values(target.collections).some((item) => item.count === null || !item.schemaValid)) blockers.push('Existing V2 target records are not proven schema-compatible.');
  return { status: blockers.length ? 'refused' : 'ready-for-separately-authorized-migration', blockers, schemaMap: V2_ECONOMY_BOOTSTRAP_MAP };
}
