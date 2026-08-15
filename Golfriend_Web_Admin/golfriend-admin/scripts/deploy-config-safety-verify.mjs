// ==========================================
// FILE: scripts/deploy-config-safety-verify.mjs
// Run: node scripts/deploy-config-safety-verify.mjs
//
// Guards the DEPLOY CONFIGURATION, which no other gate reads.
//
// The hazard this exists for: firebase.json gained a `firestore.rules` binding pointing at
// a PARTIAL ruleset that covers only a handful of enterprise_* collections. Firestore rules
// are replaced wholesale on deploy, so deploying from this directory would discard every
// rule protecting admin_users, b2b_partners, users, courses, bookings and the rest — and
// unmatched paths deny, so the Admin portal's own client read of admin_users would fail and
// every session would land in an error state.
//
// This verifier does not deploy, does not authenticate and does not contact Firebase. It
// reads configuration files and refuses when the configuration would be destructive.
// ==========================================
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const firebaseJsonPath = resolve(ROOT, 'firebase.json');
assert.ok(existsSync(firebaseJsonPath), 'firebase.json is missing');
const config = JSON.parse(readFileSync(firebaseJsonPath, 'utf8'));

/**
 * Collections this project is known to rely on. A ruleset bound for deploy must either
 * cover all of them or not be bound at all — a partial ruleset is worse than none, because
 * deploying it silently removes the rules for everything it omits.
 */
const CRITICAL_COLLECTIONS = [
  'admin_users', 'b2b_partners', 'users', 'courses', 'bookings',
  'tee_time_slots', 'course_operators', 'partner_memberships',
  'partner_identity_bindings', 'partner_organizations',
  'enterprise_outreach_drafts', 'enterprise_outreach_receipts',
  'enterprise_outreach_commands', 'enterprise_legal_holds',
  'enterprise_jurisdiction_approvals',
];

// ---- 1. A BOUND RULESET MUST BE COMPLETE -------------------------------------------
const boundRules = config.firestore && config.firestore.rules;
if (boundRules) {
  const rulesPath = resolve(ROOT, boundRules);
  assert.ok(existsSync(rulesPath), `firebase.json binds ${boundRules} for deploy but it does not exist`);
  const rules = readFileSync(rulesPath, 'utf8');
  const missing = CRITICAL_COLLECTIONS.filter((collection) => !rules.includes(collection));
  assert.deepEqual(
    missing, [],
    `firebase.json binds ${boundRules} as THE Firestore ruleset for deploy, but it does not mention ` +
    `${missing.length} critical collection(s): ${missing.join(', ')}.\n` +
    'Firestore replaces the ruleset wholesale, so deploying this would DELETE the rules protecting ' +
    'those collections and every unmatched path would begin denying. Either bind a complete merged ' +
    'ruleset or remove the firestore block so deploys leave rules alone.',
  );
  ok(`firebase.json binds ${boundRules}, and it covers all ${CRITICAL_COLLECTIONS.length} critical collections`);
} else {
  ok('firebase.json binds no Firestore ruleset, so a deploy from here cannot replace the project ruleset');
}

// ---- 2. NO RULESET IN THIS REPOSITORY MAY CARRY AN IDENTITY BACKDOOR -----------------
// The untracked emulator scratch file is deliberately NOT read or modified — it is local
// scratch and is known to contain a God-Mode literal. Only files a deploy could pick up
// are inspected here.
const trackedRulesets = ['enterprise-authority.firestore.rules', 'partner-onboarding.firestore.rules',
  'marketing.firestore.rules', 'marketing.storage.rules', 'firestore.rules']
  .filter((name) => existsSync(resolve(ROOT, name)));
const backdoors = [];
for (const name of trackedRulesets) {
  const rules = readFileSync(resolve(ROOT, name), 'utf8');
  if (/@golfriend\.co|isGodMode|god_mode/i.test(rules)) backdoors.push(name);
}
assert.deepEqual(backdoors, [], `a deployable ruleset contains an identity backdoor: ${backdoors.join(', ')}`);
ok(`${trackedRulesets.length} tracked ruleset(s) inspected; none carries an identity backdoor`);

// ---- 3. THE SERVER-OWNED COLLECTIONS ARE DENIED WHEREVER RULES EXIST -----------------
const requirement = JSON.parse(readFileSync(resolve(ROOT, 'docs/ENTERPRISE_OUTREACH_FIRESTORE_RULES_REQUIREMENT.json'), 'utf8'));
const serverOwned = requirement.collections.map((c) => c.path.split('/')[0]);
if (boundRules) {
  const rules = readFileSync(resolve(ROOT, boundRules), 'utf8');
  const undenied = serverOwned.filter((collection) => {
    const index = rules.indexOf(collection);
    if (index === -1) return true;
    // The rule for this collection must deny; look at the match block that follows.
    return !/allow read, write: if false|allow read, write: if\s+false/.test(rules.slice(index, index + 400));
  });
  assert.deepEqual(undenied, [], `the bound ruleset does not deny client access to: ${undenied.join(', ')}`);
  ok(`the bound ruleset denies client access to all ${serverOwned.length} server-owned collections`);
} else {
  ok(`no ruleset is bound here, so the ${serverOwned.length} server-owned collections remain the rules owner's handoff (see the requirement document)`);
}

// ---- 4. THE DEPLOY TARGET IS RECORDED AND CONSISTENT ---------------------------------
const rcPath = resolve(ROOT, '.firebaserc');
if (existsSync(rcPath)) {
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  const defaultProject = rc.projects && rc.projects.default;
  assert.ok(defaultProject, '.firebaserc declares no default project');
  // Anything that names a project must name THIS one, or a deploy/verification will target
  // the wrong environment. The App Check port is the current example.
  const appCheckSource = readFileSync(resolve(ROOT, 'functions/src/appCheckCommissioning.ts'), 'utf8');
  const declared = (appCheckSource.match(/EXPECTED_PROJECT_ID = '([^']+)'/) || [])[1];
  assert.equal(declared, defaultProject,
    `EXPECTED_PROJECT_ID is '${declared}' but .firebaserc deploys to '${defaultProject}' — enforcing App Check would refuse every real token`);
  ok(`deploy target '${defaultProject}' is consistent with every project constant that names it`);
}

console.log(`\nDeploy configuration safety PASS: ${checks} checks (no partial ruleset bound for deploy, no identity backdoor in a deployable ruleset, server-owned collections denied or handed off, project constants consistent).`);
