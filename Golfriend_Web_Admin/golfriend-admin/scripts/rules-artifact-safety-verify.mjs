// ==========================================
// FILE: scripts/rules-artifact-safety-verify.mjs
// Run: node scripts/rules-artifact-safety-verify.mjs
//
// Fail-closed safety for the Firestore rules HANDOFF. It does not author or deploy the
// production ruleset — that belongs to the rules owner — it produces the exact owner
// inputs and refuses anything that would be unsafe to deploy.
//
// The specific hazard: Firestore replaces a ruleset WHOLESALE. A partial ruleset bound as
// the project ruleset therefore deletes the rules for every collection it omits, and
// unmatched paths then deny — so a partial deploy is simultaneously a security regression
// and an outage. The 21-line enterprise ruleset in this repository is exactly that shape,
// and this verifier rejects it as a candidate.
// ==========================================
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const requirement = JSON.parse(readFileSync(resolve(ROOT, 'docs/ENTERPRISE_OUTREACH_FIRESTORE_RULES_REQUIREMENT.json'), 'utf8'));

/**
 * Every collection that must be covered by the integrated ruleset. Admin and Portal both,
 * because the integrated artifact replaces the whole project ruleset.
 */
export const PROTECTED_COLLECTIONS = Object.freeze([
  // Admin authority
  'admin_users', 'b2b_partners', 'users', 'courses', 'bookings',
  // Portal authority
  'partner_organizations', 'partner_memberships', 'partner_identity_bindings',
  'partner_course_claims', 'partner_staff_invitations', 'partner_authority_audits',
  'course_operators', 'tee_time_slots', 'availability_audits',
  // Server-owned outreach
  'enterprise_outreach_drafts', 'enterprise_outreach_receipts', 'enterprise_outreach_commands',
  'enterprise_legal_holds', 'enterprise_jurisdiction_approvals',
]);

/** Collections reachable ONLY through the Admin SDK; a client must never touch them. */
const ADMIN_SDK_ONLY = requirement.collections.map((c) => c.path.split('/')[0]);

/**
 * Evaluate a candidate ruleset. Returns the refusal reasons; an empty array means the
 * artifact is safe to hand to the rules owner as the integrated candidate.
 */
export function evaluateRuleset(source, { name = 'candidate' } = {}) {
  const reasons = [];
  // BOTH comment forms are stripped. Only `//` was, so a `/* … */` block could supply the
  // coverage for every protected collection while the only operative rule was wide open.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Coverage is matched on the PATH SEGMENT, not by substring. `stripped.includes('users')`
  // was satisfied by `admin_users`, so a ruleset could drop /users entirely and pass.
  const declaredPaths = new Set(
    [...stripped.matchAll(/match\s*\/([A-Za-z0-9_]+)\s*\//g)].map((m) => m[1]),
  );
  const missing = PROTECTED_COLLECTIONS.filter((collection) => !declaredPaths.has(collection));
  if (missing.length) {
    reasons.push(`omits ${missing.length} protected collection(s): ${missing.join(', ')}`);
  }
  // An identity backdoor is disqualifying regardless of coverage.
  if (/@golfriend\.co|isGodMode|god_mode/i.test(stripped)) {
    reasons.push('contains an identity backdoor');
  }
  // ANY recursive wildcard segment, whatever the variable is called. The literal
  // `{document=**}` was hard-coded, so `{doc=**}` and `{col}/{id}` walked straight past.
  if (/match\s*\/\{[A-Za-z0-9_]+\s*=\s*\*\*\}/.test(stripped)) {
    const wildcardBlock = stripped.slice(stripped.search(/match\s*\/\{[A-Za-z0-9_]+\s*=\s*\*\*\}/));
    if (/allow[^;]*if\s+(?!false\s*;)/.test(wildcardBlock)) {
      reasons.push('contains a recursive wildcard grant that would shadow specific denials');
    }
  }
  if (/match\s*\/\{[A-Za-z0-9_]+\}\s*\/\s*\{[A-Za-z0-9_]+\}/.test(stripped)) {
    reasons.push('contains a variable collection segment, which matches every collection');
  }
  // An unconditional allow in ANY form: combined or separate statements, any spacing.
  for (const statement of stripped.match(/allow[^;]*;/g) || []) {
    if (/if\s+true\s*;?\s*$/.test(statement)) {
      reasons.push(`contains an unconditional allow: ${statement.trim().slice(0, 60)}`);
      break;
    }
  }
  // A condition that delegates to a helper cannot be read as a denial. Any `if <fn>()` is
  // refused rather than analysed — this evaluator does not interpret Firestore rules, and
  // pretending it can would be worse than refusing.
  const indirect = (stripped.match(/allow[^;]*if\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/g) || [])
    .filter((s) => !/if\s+(request|resource|get|exists|debug)\s*\(/.test(s));
  if (indirect.length) {
    reasons.push(`delegates a condition to a helper function (${indirect.length} occurrence(s)); this evaluator cannot judge it and refuses rather than guessing`);
  }
  // Every Admin-SDK-only collection must be denied outright.
  for (const collection of ADMIN_SDK_ONLY) {
    // Scoped to THIS collection's OWN match block, by splitting rather than by a regex
    // window. A fixed-size window bled into the NEXT collection's deny rule, so a
    // collection opened to clients read as denied because its neighbour was not.
    const marker = `/${collection}/`;
    const at = stripped.indexOf(marker);
    if (at === -1) {
      reasons.push(`does not declare a rule for Admin-SDK-only collection ${collection}`);
      continue;
    }
    // The block runs from this marker to the start of the next `match ` declaration.
    const rest = stripped.slice(at);
    const nextMatch = rest.indexOf('match ', 1);
    const block = nextMatch === -1 ? rest : rest.slice(0, nextMatch);
    // BOTH spellings of a total denial are accepted. Demanding the combined form would
    // reject a correct ruleset, and a check that forces one spelling gets relaxed rather
    // than satisfied.
    const combinedDeny = /allow\s+read\s*,\s*write\s*:\s*if\s+false/.test(block);
    const separateDeny = /allow\s+read\s*:\s*if\s+false/.test(block)
      && /allow\s+write\s*:\s*if\s+false/.test(block);
    if (!combinedDeny && !separateDeny) {
      reasons.push(`does not deny direct client access to ${collection}`);
    }
  }
  void name;
  return reasons;
}

// ---- 1. THE KNOWN 21-LINE PARTIAL RULESET IS REJECTED --------------------------------
const partialPath = resolve(ROOT, 'enterprise-authority.firestore.rules');
assert.ok(existsSync(partialPath), 'the enterprise ruleset fixture is missing');
const partialSource = readFileSync(partialPath, 'utf8');
const partialLines = partialSource.split(/\r?\n/).filter((l) => l.trim()).length;
const partialReasons = evaluateRuleset(partialSource, { name: 'enterprise-authority.firestore.rules' });
assert.ok(partialReasons.length > 0, 'the known partial ruleset was ACCEPTED — the evaluator is not fail-closed');
assert.ok(
  partialReasons.some((r) => /omits \d+ protected collection/.test(r)),
  `the partial ruleset was rejected, but not for omitting collections: ${partialReasons.join('; ')}`,
);
ok(`the ${partialLines}-line enterprise ruleset is REJECTED as a project ruleset (${partialReasons[0].slice(0, 80)}…)`);

// ---- 2. HOSTILE CANDIDATES ARE REJECTED ----------------------------------------------
const complete = [
  "rules_version = '2';",
  'service cloud.firestore {',
  '  match /databases/{database}/documents {',
  ...PROTECTED_COLLECTIONS.map((c) => (ADMIN_SDK_ONLY.includes(c)
    ? `    match /${c}/{id} { allow read, write: if false; }`
    : `    match /${c}/{id} { allow read: if request.auth != null; allow write: if false; }`)),
  '  }',
  '}',
].join('\n');
assert.deepEqual(evaluateRuleset(complete), [], 'a complete, deny-correct ruleset was rejected — the evaluator refuses everything');

let HOSTILE = [
  ['a broad recursive grant', complete.replace('  }\n}', '    match /{document=**} { allow read: if request.auth != null; }\n  }\n}')],
  ['an identity backdoor', complete.replace('service cloud.firestore {', "service cloud.firestore {\n  function isGodMode() { return request.auth.token.email == 'admin@golfriend.co'; }")],
  ['an unconditional allow', complete.replace('    match /users/{id} { allow read: if request.auth != null; allow write: if false; }', '    match /users/{id} { allow read, write: if true; }')],
  ['an Admin-SDK-only collection opened to clients', complete.replace('match /enterprise_outreach_drafts/{id} { allow read, write: if false; }', 'match /enterprise_outreach_drafts/{id} { allow read: if request.auth != null; allow write: if false; }')],
  ['a dropped protected collection', complete.replace(/^.*match \/admin_users\/.*$/m, '')],
];
// EVASIONS THAT THE PREVIOUS EVALUATOR ACCEPTED. Each was demonstrated by an independent
// review against the real exported evaluateRuleset. They are required cases now, because
// the original hostile set only made minimal edits to this file's own canonical template
// and so tested the regexes' happy path rather than the control.
const dropUsers = complete.split('\n').filter((line) => !/match \/users\//.test(line)).join('\n');
HOSTILE.push(
  // 'users' is a SUBSTRING of 'admin_users', so a substring coverage check was satisfied
  // even with /users deleted outright.
  ['a dropped collection whose name is a substring of another', dropUsers],
  // Only the combined `read, write: if true` form was detected.
  ['separate unconditional allows', complete.replace(
    '    match /courses/{id} { allow read: if request.auth != null; allow write: if false; }',
    '    match /courses/{id} { allow read: if true; allow write: if true; }')],
  ['an unconditional allow with unusual spacing', complete.replace(
    '    match /courses/{id} { allow read: if request.auth != null; allow write: if false; }',
    '    match /courses/{id} { allow read , write: if true; }')],
  // A helper hides the condition from any evaluator that does not interpret rules.
  ['a condition delegated to a helper function', complete.replace(
    'service cloud.firestore {',
    'service cloud.firestore {\n  function wideOpen() { return true; }').replace(
    '    match /courses/{id} { allow read: if request.auth != null; allow write: if false; }',
    '    match /courses/{id} { allow read, write: if wideOpen(); }')],
  // Block comments were never stripped, so a comment could supply the coverage while the
  // only operative rule was wide open.
  ['coverage supplied entirely by a block comment', [
    "rules_version = '2';",
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    '    /*' + PROTECTED_COLLECTIONS.map((c) => ` match /${c}/{id} { allow read, write: if false; }`).join('') + '*/',
    '    match /{doc=**} { allow read, write: if request.auth != null; }',
    '  }',
    '}',
  ].join('\n')],
  // The recursive wildcard variable was matched by its literal name.
  ['a recursive wildcard under a different variable name', complete.replace(
    '  }\n}', '    match /{anything=**} { allow read: if request.auth != null; }\n  }\n}')],
  // A variable collection segment matches every collection without using **.
  ['a variable collection segment', complete.replace(
    '  }\n}', '    match /{col}/{id} { allow read: if request.auth != null; }\n  }\n}')],
);

// A legitimate two-statement denial must still be ACCEPTED, or the evaluator would force
// rules authors into one specific spelling.
const twoStatementDeny = complete.replace(
  '    match /enterprise_outreach_drafts/{id} { allow read, write: if false; }',
  '    match /enterprise_outreach_drafts/{id} { allow read: if false; allow write: if false; }');
assert.deepEqual(evaluateRuleset(twoStatementDeny), [], 'a two-statement denial was rejected; the evaluator demands one spelling');

for (const [label, candidate] of HOSTILE) {
  const reasons = evaluateRuleset(candidate);
  assert.ok(reasons.length > 0, `a ruleset with ${label} was ACCEPTED`);
}
ok(`a complete deny-correct ruleset is accepted; all ${HOSTILE.length} hostile candidates are rejected`);

// ---- 3. NO CLIENT MAY REACH AN ADMIN-SDK-ONLY COLLECTION ----------------------------
const clientFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) clientFiles.push(full);
  }
};
walk(resolve(ROOT, 'src'));
const offenders = [];
for (const file of clientFiles) {
  const text = readFileSync(file, 'utf8');
  for (const collection of ADMIN_SDK_ONLY) {
    if (text.includes(collection)) offenders.push(`${relative(ROOT, file).replace(/\\/g, '/')} → ${collection}`);
  }
}
assert.deepEqual(offenders, [], `client code names an Admin-SDK-only collection:\n  ${offenders.join('\n  ')}`);
ok(`${clientFiles.length} client files scanned; none names any of the ${ADMIN_SDK_ONLY.length} Admin-SDK-only collections`);

// ---- 4. PROJECTIONS EXPOSE ONLY ALLOWLISTED FIELDS -----------------------------------
const store = readFileSync(resolve(ROOT, 'functions/src/outreachStore.ts'), 'utf8');
const draftContract = requirement.collections.find((c) => c.path.startsWith('enterprise_outreach_drafts'));
const projectionStart = store.indexOf('rows.push({');
assert.ok(projectionStart > 0, 'could not locate the projection — this check would pass vacuously');
const projectionBody = store.slice(projectionStart, store.indexOf('});', projectionStart));
const projectedFields = [...projectionBody.matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
assert.ok(projectedFields.length >= 10, `parsed only ${projectedFields.length} projected fields`);
const notAllowlisted = projectedFields.filter((field) => !draftContract.permittedServerProjection.includes(field));
assert.deepEqual(notAllowlisted, [], `the projection exposes fields the contract does not permit: ${notAllowlisted.join(', ')}`);
for (const forbidden of draftContract.neverProjected) {
  assert.equal(projectedFields.includes(forbidden), false, `the projection exposes ${forbidden}`);
}
ok(`the correction/request projection exposes ${projectedFields.length} fields, all allowlisted, none from the never-projected set`);

// ---- 5. firebase.json MUST NAME A HASHED, COMPLETE ARTIFACT --------------------------
const firebaseConfig = JSON.parse(readFileSync(resolve(ROOT, 'firebase.json'), 'utf8'));
const boundRules = firebaseConfig.firestore && firebaseConfig.firestore.rules;
if (boundRules) {
  const boundPath = resolve(ROOT, boundRules);
  assert.ok(existsSync(boundPath), `firebase.json binds ${boundRules}, which does not exist`);
  const boundSource = readFileSync(boundPath, 'utf8');
  const reasons = evaluateRuleset(boundSource, { name: boundRules });
  assert.deepEqual(reasons, [], `firebase.json binds an UNSAFE ruleset:\n  ${reasons.join('\n  ')}`);
  // And the artifact must be pinned by hash, so the file cannot be swapped after review.
  const manifestPath = resolve(ROOT, 'docs/INTEGRATED_RULES_ARTIFACT.json');
  assert.ok(existsSync(manifestPath), `firebase.json binds a ruleset but ${relative(ROOT, manifestPath)} does not pin its hash`);
  const artifact = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actual = `sha256:${createHash('sha256').update(boundSource, 'utf8').digest('hex')}`;
  assert.equal(artifact.sha256, actual, 'the bound ruleset does not match the hash recorded in the artifact manifest');
  ok(`firebase.json binds ${boundRules}, which is complete, safe and hash-pinned`);
} else {
  ok('firebase.json binds no ruleset, so no deploy from here can replace the project ruleset (the integrated artifact is still owed by the rules owner)');
}

// ---- 6. NO DEPLOY COMMAND MAY RENDER WHILE A COLLECTION IS OMITTED -------------------
// The command is produced by this verifier and by nothing else, so it cannot be printed
// unless the artifact passed every check above.
export function renderDeployCommand() {
  const config = JSON.parse(readFileSync(resolve(ROOT, 'firebase.json'), 'utf8'));
  const bound = config.firestore && config.firestore.rules;
  if (!bound) {
    return { renderable: false, reason: 'no integrated ruleset is bound; the rules owner has not delivered one' };
  }
  const reasons = evaluateRuleset(readFileSync(resolve(ROOT, bound), 'utf8'));
  if (reasons.length) return { renderable: false, reason: reasons.join('; ') };
  return { renderable: true, command: 'firebase deploy --only firestore:rules' };
}
const rendered = renderDeployCommand();
// The property is CONDITIONAL, not "always refuses". Asserting an unconditional refusal
// made this an inverted gate: the day the rules owner delivered a complete, safe,
// hash-pinned artifact, check 5 would report success and this line would fail the build
// for finishing the work.
if (rendered.renderable) {
  // A command may only render when the artifact passed every check above.
  assert.deepEqual(evaluateRuleset(readFileSync(resolve(ROOT, JSON.parse(readFileSync(resolve(ROOT, 'firebase.json'), 'utf8')).firestore.rules), 'utf8')), [],
    'a deploy command rendered for a ruleset that does not pass evaluation');
  assert.ok(rendered.command, 'a renderable result carries no command');
  ok(`the integrated ruleset passes every check; the deploy command is releasable: ${rendered.command}`);
} else {
  assert.ok(rendered.reason, 'the refusal carries no reason');
  assert.equal(Object.prototype.hasOwnProperty.call(rendered, 'command'), false, 'a refusal still carried a runnable command');
  ok(`no deploy command renders: ${rendered.reason}`);
}

console.log(`\nRules artifact safety PASS: ${checks} checks (${PROTECTED_COLLECTIONS.length} protected collections, the known partial ruleset rejected, ${HOSTILE.length} hostile candidates rejected, projections allowlisted, no deploy command renderable).`);
