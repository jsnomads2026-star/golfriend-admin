// ==========================================
// FILE: functions/src/janitorLogic.test.ts  (run: `npm run test:janitor`)
// Focused positive/negative tests for the hardened course-dedup janitor core.
// Covers: deterministic selection, manual-lock/trusted protection, ambiguous
// duplicates (fail closed), audit-failure (missing identifier), last-known-good
// preservation, and order-independence. Never executes the scheduled job.
// ==========================================
import assert from 'node:assert';
import { planDuplicatePurge, isLocked, identifierOf } from './janitorLogic.js';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

// ---- POSITIVE: clean duplicates → deterministic winner kept, rest planned ----
check('clean duplicates: most-complete winner kept, losers planned for deletion', () => {
  const plan = planDuplicatePurge([
    { docId: 'a', clubID: 'C1', clubName: 'Alpha', latitude: 1, longitude: 2, address: 'x' },
    { docId: 'b', clubID: 'C1' }, // sparse dup
    { docId: 'c', clubID: 'C1', clubName: 'Alpha' },
  ]);
  assert.equal(plan.keep['C1'], 'a');            // 'a' most complete
  assert.deepEqual(plan.toDelete, ['b', 'c']);
  assert.equal(plan.ambiguous.length, 0);
});

check('singletons are never deleted', () => {
  const plan = planDuplicatePurge([{ docId: 'solo', clubID: 'UNIQUE' }]);
  assert.deepEqual(plan.toDelete, []);
  assert.equal(plan.keep['UNIQUE'], 'solo');
});

// ---- NEGATIVE: manual lock / trusted must never be deleted ----
check('manual-locked record is kept even if less complete; unlocked dup deleted', () => {
  const plan = planDuplicatePurge([
    { docId: 'rich', clubID: 'C2', clubName: 'B', latitude: 1, longitude: 2, address: 'y', holes: 18 },
    { docId: 'locked', clubID: 'C2', manualLock: true }, // sparse but locked
  ]);
  assert.equal(plan.keep['C2'], 'locked');       // lock wins over completeness
  assert.deepEqual(plan.toDelete, ['rich']);
  assert.ok(!plan.toDelete.includes('locked'));
});
check('trusted flag is honoured like a manual lock', () => {
  const plan = planDuplicatePurge([
    { docId: 't', clubID: 'C3', trusted: true },
    { docId: 'u', clubID: 'C3', clubName: 'Full', latitude: 1, longitude: 1 },
  ]);
  assert.equal(plan.keep['C3'], 't');
  assert.deepEqual(plan.toDelete, ['u']);
});

// ---- FAIL CLOSED: ambiguous duplicate groups skipped, zero deletions ----
check('two manual locks in one group → fail closed (skipped, nothing deleted)', () => {
  const plan = planDuplicatePurge([
    { docId: 'l1', clubID: 'C4', manualLock: true, latitude: 1 },
    { docId: 'l2', clubID: 'C4', manualLock: true, latitude: 9 },
    { docId: 'x', clubID: 'C4' },
  ]);
  assert.deepEqual(plan.toDelete, []);
  assert.equal(plan.ambiguous[0].reason, 'multiple_manual_locks');
  assert.ok(plan.audit.some((a) => a.action === 'skipped_ambiguous'));
});

// ---- AUDIT FAILURE: records without a usable identifier are never deleted ----
check('missing identifier → skipped, never deleted', () => {
  const plan = planDuplicatePurge([
    { docId: 'noid1' },
    { docId: 'noid2', clubID: '   ' },
    { docId: 'keep', clubID: 'C5' },
  ]);
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.skippedNoIdentifier, ['noid1', 'noid2']);
});

// ---- LAST-KNOWN-GOOD + DETERMINISM ----
check('last-known-good preserved: fuller record kept over sparse', () => {
  const plan = planDuplicatePurge([
    { docId: 'sparse', clubID: 'C6', clubName: 'Delta' },
    { docId: 'good', clubID: 'C6', clubName: 'Delta', latitude: 5, longitude: 6, address: 'z', imageUrl: 'i', holes: 18, par: 72 },
  ]);
  assert.equal(plan.keep['C6'], 'good');
  assert.deepEqual(plan.toDelete, ['sparse']);
});
check('deterministic + order-independent: shuffled input yields identical plan', () => {
  const input = [
    { docId: 'a', clubID: 'C7', latitude: 1 },
    { docId: 'b', clubID: 'C7', latitude: 1 },
    { docId: 'c', clubID: 'C7', latitude: 1 },
  ];
  const p1 = planDuplicatePurge(input);
  const p2 = planDuplicatePurge([...input].reverse());
  assert.deepEqual(p1.toDelete, p2.toDelete);
  assert.deepEqual(p1.keep, p2.keep);
  assert.equal(p1.keep['C7'], 'a'); // tie-break by docId asc
});

// ---- helpers ----
check('isLocked / identifierOf behave', () => {
  assert.equal(isLocked({ docId: 'x', manualLock: true }), true);
  assert.equal(isLocked({ docId: 'x', trusted: true }), true);
  assert.equal(isLocked({ docId: 'x' }), false);
  assert.equal(isLocked(null), false);
  assert.equal(identifierOf({ docId: 'x', clubID: 'ID' }), 'ID');
  assert.equal(identifierOf({ docId: 'x', clubName: 'N' }), 'N');
  assert.equal(identifierOf({ docId: 'x' }), null);
});

console.log(`\njanitorLogic: ${passed} checks passed.`);
