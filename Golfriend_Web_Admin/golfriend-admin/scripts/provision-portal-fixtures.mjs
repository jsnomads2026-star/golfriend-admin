#!/usr/bin/env node
// ============================================================================
// FILE: scripts/provision-portal-fixtures.mjs
// Deterministic staff-controlled provisioning tool for Portal verification:
//   - ONE test partner  → b2b_partners/{uid} status "active_partner"
//   - ONE staff user     → admin_users/{uid} role + status "Active"
//
// Guarantees:
//   • DRY-RUN by default — prints the exact plan and creates NOTHING.
//   • Never touches golfriend-v1 (refuses it as a target) and refuses a real
//     project unless BOTH --apply and --i-understand-real are given AND a
//     non-v1 project id is provided (V2 project is issue-#21-gated → stays a
//     genuine blocker; the tool cannot invent it).
//   • --emulator applies against the local emulator only (offline; not "real").
//   • --rollback removes exactly the fixtures this tool creates (deterministic
//     uids), with the same dry-run/apply safety.
//   • Validates every value against the server authority contracts
//     (isActiveStaff: role non-empty + status != 'Suspended'; partner:
//     status === 'active_partner').
//
// NO self-registration and NO partner-status self-assignment: this is an
// out-of-band staff/admin action, exactly the provisioning handoff the intake
// approval flow hands to staff.
// ============================================================================

const args = new Set(process.argv.slice(2));
const getOpt = (name) => { const p = `--${name}=`; const a = process.argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : undefined; };

const APPLY = args.has('--apply');
const EMULATOR = args.has('--emulator');
const ROLLBACK = args.has('--rollback');
const UNDERSTAND_REAL = args.has('--i-understand-real');
const PROJECT = getOpt('project');
const HELP = args.has('--help') || args.has('-h');

// Deterministic, clearly-synthetic fixtures (fixed uids → idempotent + rollbackable).
const FIXTURES = {
  staff: {
    uid: 'fixture-staff-portal-verify',
    email: 'staff.fixture@golfriend.test',
    password: 'FixtureStaff!2026',
    collection: 'admin_users',
    doc: { role: 'Director', status: 'Active', name: 'Portal Verification Staff', provisionedBy: 'provision-portal-fixtures' },
  },
  partner: {
    uid: 'fixture-partner-portal-verify',
    email: 'partner.fixture@golfriend.test',
    password: 'FixturePartner!2026',
    collection: 'b2b_partners',
    doc: { status: 'active_partner', organization: 'Fixture Golf Course', tier: 'small_business', provisionedBy: 'provision-portal-fixtures' },
  },
};

const FORBIDDEN_PROJECTS = ['golfriend-v1'];

function help() {
  console.log(`
provision-portal-fixtures — deterministic staff-controlled Portal fixtures

USAGE
  node scripts/provision-portal-fixtures.mjs [--apply] [--emulator|--project=<id>] [--rollback] [--i-understand-real]

DEFAULT (no flags)      Dry-run plan only. Creates nothing.
--emulator              Target the local Firebase emulator suite (offline; not real).
--apply                 Execute the plan (otherwise dry-run).
--project=<id>          Real project target (requires --apply AND --i-understand-real;
                        refuses golfriend-v1; the V2 project is issue-#21-gated).
--rollback              Remove the fixtures this tool creates (respects dry-run/apply).

EXAMPLES
  node scripts/provision-portal-fixtures.mjs                       # dry-run plan
  node scripts/provision-portal-fixtures.mjs --emulator --apply    # seed emulator
  node scripts/provision-portal-fixtures.mjs --emulator --apply --rollback
`);
}

// ---- validation (fail-closed) ----
function validate() {
  const errors = [];
  if (PROJECT && FORBIDDEN_PROJECTS.includes(PROJECT)) errors.push(`Refusing target "${PROJECT}": golfriend-v1 is never a provisioning target.`);
  if (APPLY && !EMULATOR && !PROJECT) errors.push('Real --apply requires --project=<id> (or use --emulator).');
  if (APPLY && PROJECT && !UNDERSTAND_REAL) errors.push('Real project --apply requires --i-understand-real (creates real accounts — currently gated by issue #21; do not run yet).');
  // Contract validation: the docs must satisfy server authority.
  if (!FIXTURES.staff.doc.role || FIXTURES.staff.doc.status === 'Suspended') errors.push('Staff fixture violates isActiveStaff (needs non-empty role + status != Suspended).');
  if (FIXTURES.partner.doc.status !== 'active_partner') errors.push('Partner fixture must have status "active_partner".');
  return errors;
}

function plan() {
  const verb = ROLLBACK ? 'DELETE' : 'CREATE/SET';
  const lines = [];
  for (const f of [FIXTURES.staff, FIXTURES.partner]) {
    lines.push(`  ${verb} auth user   uid=${f.uid}  email=${f.email}`);
    lines.push(`  ${verb} firestore   ${f.collection}/${f.uid}  ${ROLLBACK ? '(remove)' : JSON.stringify(f.doc)}`);
  }
  return lines;
}

async function loadAdmin() {
  // Lazy — only needed for --apply. Resolve firebase-admin from functions/.
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const req = createRequire(path.join(here, '..', 'functions', 'package.json'));
  return req('firebase-admin');
}

async function apply() {
  if (EMULATOR) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:19711';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:19701';
  }
  const admin = await loadAdmin();
  const projectId = EMULATOR ? 'demo-golfriend-v2-canonical' : PROJECT;
  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = admin.firestore();
  const auth = admin.auth();
  const results = [];
  for (const f of [FIXTURES.staff, FIXTURES.partner]) {
    if (ROLLBACK) {
      await auth.deleteUser(f.uid).catch(() => {});
      await db.collection(f.collection).doc(f.uid).delete().catch(() => {});
      results.push(`  removed ${f.collection}/${f.uid} + auth ${f.uid}`);
    } else {
      await auth.createUser({ uid: f.uid, email: f.email, password: f.password, emailVerified: true }).catch(async (e) => {
        if (String(e.code || e).includes('already-exists') || String(e).includes('already in use')) return; throw e;
      });
      await db.collection(f.collection).doc(f.uid).set({ ...f.doc, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      results.push(`  set ${f.collection}/${f.uid} + auth ${f.uid}`);
    }
  }
  return results;
}

(async () => {
  if (HELP) { help(); process.exit(0); }
  const target = EMULATOR ? 'LOCAL EMULATOR (demo-golfriend-v2-canonical, offline)' : (PROJECT ? `PROJECT ${PROJECT}` : '(no target — dry-run only)');
  console.log(`\nprovision-portal-fixtures — ${ROLLBACK ? 'ROLLBACK' : 'PROVISION'} — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Target: ${target}\n`);

  const errors = validate();
  if (errors.length) { console.error('VALIDATION FAILED:'); errors.forEach((e) => console.error('  ✗ ' + e)); process.exit(1); }
  console.log('Validation: ✓ passed (fixtures satisfy isActiveStaff + active_partner; target allowed)\n');

  console.log(`Planned operations (${ROLLBACK ? 'rollback' : 'provision'}):`);
  plan().forEach((l) => console.log(l));

  if (!APPLY) {
    console.log('\nDRY-RUN — nothing was created or deleted. Re-run with --apply (and --emulator or --project) to execute.');
    process.exit(0);
  }
  console.log('\nApplying…');
  try {
    const results = await apply();
    results.forEach((r) => console.log(r));
    console.log(`\n✅ ${ROLLBACK ? 'Rollback' : 'Provisioning'} complete on ${target}.`);
  } catch (e) {
    console.error('\n✗ Apply failed:', e?.message || e);
    console.error('(No partial real-account creation intended; re-run --rollback to clean up if needed.)');
    process.exit(2);
  }
})();
