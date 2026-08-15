// ==========================================
// FILE: scripts/rules-artifact-safety-verify.mjs
// Run: node scripts/rules-artifact-safety-verify.mjs
//
// Fail-closed safety for the Firestore rules HANDOFF. It does not author or deploy the
// production ruleset — that belongs to the rules owner — it refuses candidates that
// would be unsafe to deploy, and proves that nothing in this repository can reach the
// server-owned collections from a client.
//
// The specific hazard: Firestore replaces a ruleset WHOLESALE. A partial ruleset bound
// as the project ruleset therefore deletes the rules for every collection it omits,
// and unmatched paths then deny — so a partial deploy is simultaneously a security
// regression and an outage.
// ==========================================
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

/**
 * Every collection the integrated ruleset must cover. Admin authority, plus the
 * server-owned collections this lane created: the membership IS the role grant, the
 * audits are the evidence a grant or revocation happened, and the counter is what
 * stops a re-grant from overwriting earlier evidence.
 */
export const PROTECTED_COLLECTIONS = Object.freeze([
  'admin_users', 'b2b_partners', 'users', 'courses', 'bookings',
  'enterprise_outreach_drafts', 'enterprise_outreach_receipts', 'enterprise_outreach_commands',
  'enterprise_legal_holds', 'enterprise_jurisdiction_approvals',
  'enterprise_staff', 'enterprise_staff_memberships',
  'enterprise_staff_grant_audits', 'enterprise_staff_removal_audits',
  'enterprise_staff_grant_counters',
]);

/** Collections whose CONTENTS are the authority: a client write is a self-issued grant. */
const CLIENT_WRITE_FORBIDDEN = Object.freeze([
  'admin_users', 'b2b_partners',
  'enterprise_staff', 'enterprise_staff_memberships',
  'enterprise_staff_grant_audits', 'enterprise_staff_removal_audits',
  'enterprise_staff_grant_counters',
]);

/** Reachable ONLY through the Admin SDK; no client file may name them at all. */
const ADMIN_SDK_ONLY = Object.freeze([
  'enterprise_staff_memberships', 'enterprise_staff_grant_audits',
  'enterprise_staff_removal_audits', 'enterprise_staff_grant_counters',
]);

/**
 * Evaluate a candidate ruleset. Returns refusal reasons; an empty array means it is
 * safe to hand to the rules owner as the integrated candidate.
 */
export function evaluateRuleset(source, { name = 'candidate' } = {}) {
  const reasons = [];
  void name;
  // BOTH comment forms are stripped: a block comment could otherwise supply coverage
  // for every protected collection while the only operative rule was wide open.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  // Coverage is matched on the PATH SEGMENT, not by substring — `includes('users')`
  // is satisfied by `admin_users`, so a ruleset could drop /users entirely and pass.
  const declaredPaths = new Set([...stripped.matchAll(/match\s*\/([A-Za-z0-9_]+)\s*\//g)].map((m) => m[1]));
  const missing = PROTECTED_COLLECTIONS.filter((c) => !declaredPaths.has(c));
  if (missing.length) reasons.push(`omits ${missing.length} protected collection(s): ${missing.join(', ')}`);

  if (/@golfriend\.co|isGodMode|god_mode/i.test(stripped)) reasons.push('contains an identity backdoor');

  // ANY recursive wildcard segment, whatever the variable is called.
  if (/match\s*\/\{[A-Za-z0-9_]+\s*=\s*\*\*\}/.test(stripped)) {
    const block = stripped.slice(stripped.search(/match\s*\/\{[A-Za-z0-9_]+\s*=\s*\*\*\}/));
    if (/allow[^;]*if\s+(?!false\s*;)/.test(block)) {
      reasons.push('contains a recursive wildcard grant that would shadow specific denials');
    }
  }
  if (/match\s*\/\{[A-Za-z0-9_]+\}\s*\/\s*\{[A-Za-z0-9_]+\}/.test(stripped)) {
    reasons.push('contains a variable collection segment, which matches every collection');
  }

  // UNCONDITIONAL ALLOWS IN ANY FORM. Anchoring on the literal `if true;` catches only
  // one spelling: `if (true)`, `x || true`, and a bare `exists(...)` all grant
  // unconditionally too.
  for (const statement of stripped.match(/allow[^;]*;/g) || []) {
    const condition = (statement.split(/:\s*if\s/)[1] || '').trim().replace(/;$/, '');
    if (!condition) continue;
    let bare = condition;
    while (/^\((.*)\)$/.test(bare.trim())) bare = bare.trim().replace(/^\((.*)\)$/, '$1');
    bare = bare.trim();

    if (/^true$/.test(bare)) {
      reasons.push(`contains an unconditional allow: ${statement.trim().slice(0, 60)}`);
      continue;
    }
    if (/(^|\|\|)\s*\(?\s*true\s*\)?\s*(\|\||$)/.test(bare)) {
      reasons.push(`contains a tautological allow (a || true arm makes the rest irrelevant): ${statement.trim().slice(0, 60)}`);
      continue;
    }
    // exists()/get() prove a DOCUMENT is there, not that this caller may act.
    if (/^(exists|get)\s*\(/.test(bare)) {
      reasons.push(`uses ${bare.slice(0, 6)}() as the entire authorization condition; document existence is not authority`);
      continue;
    }
    if (!/request\.auth|request\.resource|resource\.data|false/.test(bare)) {
      reasons.push(`allow condition never references the caller: ${statement.trim().slice(0, 60)}`);
    }
  }

  // A condition delegating to a helper cannot be read as a denial by a text evaluator;
  // refusing is more honest than pretending to interpret Firestore rules.
  const indirect = (stripped.match(/allow[^;]*if\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/g) || [])
    .filter((s) => !/if\s+(request|resource|get|exists|debug)\s*\(/.test(s));
  if (indirect.length) {
    reasons.push(`delegates a condition to a helper function (${indirect.length} occurrence(s)); this evaluator refuses rather than guessing`);
  }

  // Authority-critical collections must be DENIED for client writes, and an additive
  // grant beside a denial re-opens what the denial closed.
  for (const collection of CLIENT_WRITE_FORBIDDEN) {
    // The path wildcard is skipped explicitly. Matching `[^{]*\{` stopped at the `{id}`
    // segment and captured "id" as the rule body, so every collection looked like it
    // denied nothing. The trailing `/` before `{` also keeps `enterprise_staff` from
    // prefix-matching `enterprise_staff_memberships`.
    const block = stripped.match(new RegExp(`match\\s*/${collection}/\\{[^}]*\\}\\s*\\{([\\s\\S]*?)\\}`));
    if (!block) continue;
    const body = block[1];
    if (!/allow\s+[^;]*write[^;]*:\s*if\s+false\s*;/.test(body)) {
      reasons.push(`${collection} does not deny client writes`);
      continue;
    }
    // A DENIAL PLUS A GRANT IS A GRANT. Firestore allows if ANY rule allows, so an
    // additive `allow write: if <anything>` beside the denial re-opens exactly what
    // the denial closed — and reading only the first matching rule hides that.
    const permissive = (body.match(/allow[^;]*;/g) || [])
      .filter((s) => /write/.test(s) && !/:\s*if\s+false\s*;/.test(s));
    if (permissive.length) {
      reasons.push(`${collection} denies writes but also grants them: ${permissive[0].trim().slice(0, 60)}`);
    }
  }
  return reasons;
}

// ---- 1. A PARTIAL RULESET IS REJECTED ------------------------------------------------
const PARTIAL = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /enterprise_outreach_drafts/{id} { allow read, write: if false; }
  }
}`;
const partialReasons = evaluateRuleset(PARTIAL, { name: 'partial' });
assert.ok(partialReasons.length > 0, 'a partial ruleset was accepted as a project ruleset');
assert.ok(partialReasons[0].includes('omits'), partialReasons.join('; '));
ok(`a partial ruleset is REJECTED (${partialReasons[0].slice(0, 88)}…)`);

// ---- 2. A COMPLETE DENY-CORRECT RULESET IS ACCEPTED; HOSTILE ONES ARE NOT ------------
const COMPLETE = [
  "rules_version = '2';",
  'service cloud.firestore {',
  '  match /databases/{database}/documents {',
  ...PROTECTED_COLLECTIONS.map((c) => `    match /${c}/{id} { allow read, write: if false; }`),
  '  }',
  '}',
].join('\n');
assert.deepEqual(evaluateRuleset(COMPLETE), [], 'a complete deny-correct ruleset was refused');

const HOSTILE = [
  ['unconditional allow', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if true; }')],
  ['parenthesised true', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if ((true)); }')],
  ['tautological or', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if request.auth != null || true; }')],
  ['exists() as authority', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if exists(/databases/$(database)/documents/admin_users/$(id)); }')],
  ['helper indirection', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if isStaff(); }')],
  ['identity backdoor', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', "match /admin_users/{id} { allow read, write: if request.auth.token.email == 'admin@golfriend.co'; }")],
  ['recursive wildcard grant', COMPLETE.replace('  }\n}', '    match /{doc=**} { allow read: if request.auth != null; }\n  }\n}')],
  ['variable collection segment', COMPLETE.replace('  }\n}', '    match /{col}/{id} { allow read: if request.auth != null; }\n  }\n}')],
  ['block-comment coverage only', `rules_version = '2';\n/* ${PROTECTED_COLLECTIONS.map((c) => `match /${c}/{id}`).join(' ')} */\nservice cloud.firestore { match /databases/{db}/documents { match /x/{id} { allow read, write: if true; } } }`],
  ['condition ignores the caller', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if 1 == 1; }')],
  ['grant beside a denial', COMPLETE.replace('match /admin_users/{id} { allow read, write: if false; }', 'match /admin_users/{id} { allow read, write: if false; allow write: if request.auth != null; }')],
];
const accepted = HOSTILE.filter(([, src]) => evaluateRuleset(src).length === 0).map(([label]) => label);
assert.deepEqual(accepted, [], `hostile ruleset(s) accepted: ${accepted.join(', ')}`);
ok(`a complete deny-correct ruleset is accepted; all ${HOSTILE.length} hostile candidates are rejected`);

// ---- 3. NO CLIENT FILE NAMES AN ADMIN-SDK-ONLY COLLECTION ---------------------------
const clientFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
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
    if (text.includes(collection)) offenders.push(`${relative(ROOT, file).replace(/\\/g, '/')} names ${collection}`);
  }
}
assert.deepEqual(offenders, [], `client code reaches a server-owned collection:\n  ${offenders.join('\n  ')}`);
ok(`${clientFiles.length} client files scanned; none names any of the ${ADMIN_SDK_ONLY.length} Admin-SDK-only collections`);

// ---- 4. NO RULESET IS BOUND FOR DEPLOY FROM THIS REPOSITORY -------------------------
// Until the rules owner delivers the integrated artifact, the only thing protecting
// these collections is that no client can name them (check 3) and that nothing here
// can push a partial ruleset over the project's.
const firebaseConfig = JSON.parse(readFileSync(resolve(ROOT, 'firebase.json'), 'utf8'));
assert.equal(firebaseConfig.firestore === undefined, true,
  'firebase.json binds a Firestore ruleset; a deploy from here would replace the project ruleset wholesale');
assert.equal(existsSync(resolve(ROOT, 'docs/INTEGRATED_RULES_ARTIFACT.json')), false,
  'an integrated rules artifact appeared; it must be evaluated by this gate before it can be bound');
ok('firebase.json binds no ruleset, so no deploy from here can replace the project ruleset');

console.log(`\nRules artifact safety PASS: ${checks} checks (${PROTECTED_COLLECTIONS.length} protected collections, partial ruleset rejected, ${HOSTILE.length} hostile candidates rejected, no deployable ruleset bound).`);
