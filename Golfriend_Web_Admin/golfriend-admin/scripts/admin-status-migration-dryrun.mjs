// ==========================================
// FILE: scripts/admin-status-migration-dryrun.mjs
// Run: node scripts/admin-status-migration-dryrun.mjs [--input <path-to-export.json>]
//
// READ-ONLY migration readiness check for legacy admin_users records.
//
// The allowlist change denies any record whose status is not canonically 'Active' — which
// includes records with NO status field, the shape the previous denylist explicitly
// admitted. Both in-product recovery paths (hireStaff, setEmployeeStatus) require an ACTIVE
// Director, so if every Director record is non-conforming there is no way back in from the
// product. That is the risk this verifier exists to measure BEFORE activation.
//
// IT PERFORMS NO REPAIR AND TOUCHES NO DATABASE. It does not connect to Firestore, does
// not authenticate, and cannot change a record. It DOES write one file: the repair
// manifest, to a path the operator chooses with --manifest. Saying "writes nothing" would
// have been untrue, and an inaccurate safety claim is worse than an accurate limitation.
//
// IDENTITIES ARE NOT REPORTED. Only counts, a non-reversible short reference for
// correlation, and the status classification. No uid, no name, no role-holder identity, no
// private field ever appears in the output.
// ==========================================
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const inputFlag = args.indexOf('--input');
const inputPath = inputFlag >= 0 ? args[inputFlag + 1] : null;
const outputFlag = args.indexOf('--manifest');
const manifestPath = outputFlag >= 0 ? args[outputFlag + 1] : resolve(ROOT, 'docs/ADMIN_STATUS_REPAIR_MANIFEST.json');

/** The contract is the single source of what counts as active. */
const contract = JSON.parse(readFileSync(resolve(ROOT, 'docs/SHARED_AUTHORITY_CONTRACT.json'), 'utf8'));
const ACCEPTED = contract.acceptedStatuses.values;
const KNOWN_INACTIVE = ['suspended', 'inactive', 'deactivated', 'revoked', 'expired', 'disabled', 'deleted', 'removed', 'terminated', 'pending', 'unknown'];

const normalize = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toLowerCase();
  return normalized === '' ? null : normalized;
};

/**
 * A short, non-reversible reference so an operator can correlate a manifest row with their
 * own export without this file ever carrying an identity. It is a correlation aid, not an
 * identifier and certainly not a credential.
 */
// A per-run RANDOM salt. A truncated SHA-256 of a uid is NOT one-way when the uid space is
// guessable — and this codebase keys role documents by email address in places, so an
// unsalted digest of an address is a dictionary lookup, not a reference. The salt is
// generated per run and never written out, so the reference correlates rows WITHIN one
// manifest and cannot be reversed or joined across runs.
const CORRELATION_SALT = randomBytes(32);
const shortRef = (uid) => `rec-${createHash('sha256').update(CORRELATION_SALT).update(String(uid)).digest('hex').slice(0, 12)}`;

export function classify(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'malformed_record';
  const hasStatusField = Object.prototype.hasOwnProperty.call(record, 'status');
  const rawStatus = record.status;
  if (!hasStatusField || rawStatus === null || rawStatus === undefined) return 'missing_status';
  if (typeof rawStatus !== 'string') return 'malformed_status';
  const status = normalize(rawStatus);
  if (status === null) return 'blank_status';
  if (ACCEPTED.includes(status)) return 'active';
  if (KNOWN_INACTIVE.includes(status)) return `inactive_${status}`;
  return 'unknown_status';
}

export function hasAssignedRole(record) {
  return !!record && typeof record.role === 'string' && record.role.trim() !== '';
}

/** Would the shared predicate authorize this record after the change? */
export function wouldAuthorize(record) {
  return classify(record) === 'active' && hasAssignedRole(record);
}

export function analyze(records) {
  const counts = {
    total: records.length,
    active: 0, missing_status: 0, blank_status: 0, malformed_status: 0,
    malformed_record: 0, unknown_status: 0, inactive_total: 0,
    role_less: 0, would_authorize: 0, would_lose_access: 0,
  };
  const byInactiveValue = {};
  const repairs = [];
  let directorsRetainingAccess = 0;
  let privilegedNonConforming = 0;

  for (const entry of records) {
    const record = entry && entry.data ? entry.data : entry;
    const uid = (entry && (entry.uid || entry.id)) ?? 'unknown';
    const verdict = classify(record);
    const roled = hasAssignedRole(record);
    const authorized = wouldAuthorize(record);

    if (verdict === 'active') counts.active += 1;
    else if (verdict.startsWith('inactive_')) {
      counts.inactive_total += 1;
      byInactiveValue[verdict.slice(9)] = (byInactiveValue[verdict.slice(9)] || 0) + 1;
    } else counts[verdict] = (counts[verdict] || 0) + 1;

    if (!roled) counts.role_less += 1;
    if (authorized) counts.would_authorize += 1;

    // A record that is NOT known-inactive but also does not authorize is an access LOSS:
    // nobody suspended this person, yet the change will lock them out.
    const deliberatelyInactive = verdict.startsWith('inactive_');
    if (!authorized && !deliberatelyInactive) {
      counts.would_lose_access += 1;
      const isPrivileged = record && typeof record.role === 'string' && record.role.trim() !== '';
      if (isPrivileged) privilegedNonConforming += 1;
      repairs.push({
        ref: shortRef(uid),
        classification: verdict,
        hasAssignedRole: roled,
        // The ROLE TIER is reported because recovery capability depends on it. The role
        // string itself is a job title, not personal data; no name, uid or contact appears.
        roleTier: record && record.role === 'Director' ? 'Director' : (roled ? 'non-director' : 'none'),
        requiredOperatorAction: verdict === 'missing_status' || verdict === 'blank_status'
          ? "Set status to the canonical 'Active' if this person is genuinely still staff; otherwise set 'Suspended'."
          : verdict === 'unknown_status'
            ? "Replace the unrecognized status with the canonical 'Active' or 'Suspended'."
            : verdict === 'malformed_status' || verdict === 'malformed_record'
              ? 'Repair the record shape; status must be a string.'
              : 'Assign a role, or remove the record if this person is no longer staff.',
      });
    }
    if (record && record.role === 'Director' && authorized) directorsRetainingAccess += 1;
  }

  return { counts, byInactiveValue, repairs, directorsRetainingAccess, privilegedNonConforming };
}

/**
 * Activation is REFUSED unless every privileged record carries an authoritative status and
 * at least one Director retains access. A migration that locks out every Director is not a
 * migration, it is an outage with no in-product remedy.
 */
export function activationDecision(analysis) {
  const blockers = [];
  if (analysis.privilegedNonConforming > 0) {
    blockers.push(`${analysis.privilegedNonConforming} privileged record(s) lack an authoritative valid status`);
  }
  if (analysis.directorsRetainingAccess === 0) {
    blockers.push('no Director record would retain access — there would be no in-product recovery path');
  }
  return { activate: blockers.length === 0, blockers };
}

// ------------------------------------------------------------------- self-check ----
// Hostile fixtures, always executed. They prove the classifier fails closed regardless of
// whether an operator export is present, so this file is meaningful on every gate run.
const HOSTILE = [
  { uid: 'a', data: { role: 'Director', status: 'Active' }, expect: 'active', authorize: true },
  { uid: 'b', data: { role: 'Director' }, expect: 'missing_status', authorize: false },
  { uid: 'c', data: { role: 'Director', status: '' }, expect: 'blank_status', authorize: false },
  { uid: 'd', data: { role: 'Director', status: '   ' }, expect: 'blank_status', authorize: false },
  { uid: 'e', data: { role: 'Director', status: null }, expect: 'missing_status', authorize: false },
  { uid: 'f', data: { role: 'Director', status: 42 }, expect: 'malformed_status', authorize: false },
  { uid: 'g', data: { role: 'Director', status: true }, expect: 'malformed_status', authorize: false },
  { uid: 'h', data: { role: 'Director', status: {} }, expect: 'malformed_status', authorize: false },
  { uid: 'i', data: { role: 'Director', status: ['Active'] }, expect: 'malformed_status', authorize: false },
  { uid: 'j', data: { role: 'Director', status: 'Suspended' }, expect: 'inactive_suspended', authorize: false },
  { uid: 'k', data: { role: 'Director', status: 'Archived' }, expect: 'unknown_status', authorize: false },
  { uid: 'l', data: { role: 'Director', status: 'Аctive' }, expect: 'unknown_status', authorize: false },
  { uid: 'm', data: { status: 'Active' }, expect: 'active', authorize: false },
  { uid: 'n', data: null, expect: 'malformed_record', authorize: false },
  { uid: 'o', data: [], expect: 'malformed_record', authorize: false },
  { uid: 'p', data: { role: 'Manager', status: ' active ' }, expect: 'active', authorize: true },
];
for (const fixture of HOSTILE) {
  assert.equal(classify(fixture.data), fixture.expect, `classify ${fixture.uid}`);
  assert.equal(wouldAuthorize(fixture.data), fixture.authorize, `wouldAuthorize ${fixture.uid}`);
}
// Every non-active shape fails closed — no fixture authorizes unless it is canonically active.
for (const fixture of HOSTILE) {
  if (fixture.authorize) assert.equal(classify(fixture.data), 'active', fixture.uid);
}
console.log(`  ok classifier self-check: ${HOSTILE.length} hostile record shapes, every non-active one fails closed`);

// Activation refusal is proved on a fixture where a privileged record is non-conforming.
const lockoutFixture = analyze([{ uid: 'x', data: { role: 'Director' } }]);
const lockoutDecision = activationDecision(lockoutFixture);
assert.equal(lockoutDecision.activate, false, 'activation was permitted with a non-conforming privileged record');
assert.ok(lockoutDecision.blockers.length >= 1);
const healthyFixture = analyze([{ uid: 'y', data: { role: 'Director', status: 'Active' } }]);
assert.equal(activationDecision(healthyFixture).activate, true, 'activation was refused for a wholly conforming set');
console.log('  ok activation is refused when a privileged record lacks an authoritative status, and permitted when none does');

// No identity may reach the output.
const leaky = analyze([{ uid: 'director@golfriend.co', data: { role: 'Director', name: 'A Person', email: 'a@b.c' } }]);
const serialized = JSON.stringify(leaky);
for (const secret of ['director@golfriend.co', 'A Person', 'a@b.c']) {
  assert.equal(serialized.includes(secret), false, `the analysis leaked ${secret}`);
}
assert.match(leaky.repairs[0].ref, /^rec-[0-9a-f]{12}$/);
// The reference must NOT be a plain digest of the uid — that is reversible for an address.
const unsalted = createHash('sha256').update('director@golfriend.co').digest('hex').slice(0, 12);
assert.notEqual(leaky.repairs[0].ref, `rec-${unsalted}`, 'the correlation reference is an unsalted digest and is therefore reversible');
console.log('  ok identities and private fields are absent from the analysis output');

// ------------------------------------------------------------------- operator run ----
if (!inputPath) {
  console.log('\nNo --input export supplied, so no live record set was analysed.');
  console.log('This is READ-ONLY by construction: it never connects to Firestore and never writes a repair.');
  console.log('To assess a real environment, an operator exports admin_users and runs:');
  console.log('  node scripts/admin-status-migration-dryrun.mjs --input ./admin_users_export.json');
  console.log('\nAdmin status migration dry-run PASS (self-check only; no operator export present).');
  process.exit(0);
}

assert.ok(existsSync(inputPath), `input export not found: ${inputPath}`);
const parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
const records = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([uid, data]) => ({ uid, data }));
const analysis = analyze(records);
const decision = activationDecision(analysis);

console.log('\n--- COUNTS ONLY (no identities) ---');
console.log(JSON.stringify({ counts: analysis.counts, byInactiveValue: analysis.byInactiveValue, directorsRetainingAccess: analysis.directorsRetainingAccess }, null, 2));

const manifest = {
  manifestId: 'GF-ADMIN-STATUS-REPAIR-001',
  generatedFrom: 'operator-supplied export (path not recorded)',
  contract: contract.contractId,
  acceptedStatuses: ACCEPTED,
  counts: analysis.counts,
  byInactiveValue: analysis.byInactiveValue,
  activation: decision,
  repairs: analysis.repairs,
  operatorNotes: [
    'This manifest is a PLAN. Nothing here has been applied and this tool cannot apply it.',
    'Each row identifies a record only by a non-reversible short reference; correlate against your own export.',
    'Set the canonical string Active (exact spelling) for staff who are genuinely still active.',
    'Set Suspended for anyone who is not. Do not invent a third value: exactly one status authorizes.',
    'Re-run this dry-run after repair; activation stays refused until it reports zero blockers.',
  ],
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\nRepair manifest written (plan only, nothing applied): ${manifestPath}`);
console.log(decision.activate
  ? '\nActivation readiness: NO BLOCKERS.'
  : `\nACTIVATION REFUSED:\n  - ${decision.blockers.join('\n  - ')}`);
process.exit(decision.activate ? 0 : 1);
