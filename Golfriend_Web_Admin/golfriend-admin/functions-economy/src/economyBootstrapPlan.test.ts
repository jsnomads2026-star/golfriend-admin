import assert from 'node:assert';
import { planV2EconomyBootstrap } from './economyBootstrapPlan.js';

const collection = (count: number | null, schemaValid = true) => ({ count, schemaValid, freshestAt: count && count > 0 ? '2026-08-20T00:00:00.000Z' : null });
const all = { policy: collection(1), lots: collection(2), journal: collection(3), reconciliation: collection(0), policyAudit: collection(1) };
const valid = { mode: 'dry-run' as const, source: { canonicalService: 'teeReservationFirestoreService.js' as const, policyVersion: 'booking-concierge-five-tee-v1' as const, observedAt: '2026-08-20T00:00:00.000Z', collections: all, countryCodes: ['TH'], allJournalEntriesBalanced: true, lotQuantitiesReconcile: true }, target: { projectId: 'golfriend-v2-production-2ee34', observedAt: '2026-08-20T00:00:00.000Z', confirmation: 'confirmed-empty' as const, collections: all } };

const currentContract = planV2EconomyBootstrap(valid);
assert.equal(currentContract.status, 'refused');
assert(currentContract.blockers.some((blocker) => blocker.includes('policy-change audit')));
const blocked = planV2EconomyBootstrap({ ...valid, source: { ...valid.source, collections: { ...all, policyAudit: collection(null) }, countryCodes: [] }, target: { ...valid.target, confirmation: 'unconfirmed' } });
assert.equal(blocked.status, 'refused');
assert(blocked.blockers.some((blocker) => blocker.includes('policy-change audit')));
assert(blocked.blockers.some((blocker) => blocker.includes('country-code')));
assert(blocked.blockers.some((blocker) => blocker.includes('target state')));
assert.throws(() => planV2EconomyBootstrap({ ...valid, mode: 'write' } as never), /dry-run/);
console.log('economy bootstrap plan: evidence gate and dry-run-only boundary passed.');
