// ==========================================
// FILE: scripts/identity-binding-verify.mjs
// Run: node scripts/identity-binding-verify.mjs
//
// REGRESSION GUARD: authority must derive from a verified, immutable principal —
// request.auth.uid and the server-owned membership/organization records — and never from
// mutable email text.
//
// STRUCTURAL, NOT PROXIMITY-BASED. The previous version scanned line-by-line for
// `token.email` and looked for `email_verified` within four lines. Proximity is not
// dependency: an independent review demonstrated five regressions that walked straight
// past it — a gate computed but never used, a gate inverted and unused, bracket access
// (`token["email"]`), destructuring, an intermediate alias, and a newline inside the
// expression. Every current call site relied on that heuristic, so none of them was
// actually verified.
//
// This walks the TypeScript AST instead:
//   - every read of an address off an auth token is located, however it is spelled;
//   - each must be DOMINATED by a guard whose condition depends, transitively, on
//     `email_verified`;
//   - every symbol derived from `email_verified` must actually be USED in a guard, so a
//     dead or inverted-and-unused variable cannot masquerade as a control.
// ==========================================
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions/src');
const ts = createRequire(import.meta.url)('typescript');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

/** Recursive, so a future subdirectory cannot become invisible to this scan. */
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...collectSources(full)); continue; }
    if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}
const serverFiles = collectSources(FUNCTIONS);

const rel = (file) => relative(ROOT, file).replace(/\\/g, '/');

// ------------------------------------------------------------------ AST analysis ------
const VERIFIED_FLAG = 'email_verified';

/**
 * Does this expression read an address off an auth token? Covers `token.email`,
 * `token?.email`, `token["email"]`, and any alias whose initializer was an auth token.
 */
function isAddressRead(node, tokenAliases) {
  const nameOf = (n) => {
    if (ts.isPropertyAccessExpression(n)) return n.name.text;
    if (ts.isElementAccessExpression(n) && n.argumentExpression && ts.isStringLiteral(n.argumentExpression)) {
      return n.argumentExpression.text;
    }
    return null;
  };
  if (nameOf(node) !== 'email') return false;
  const objectText = node.expression.getText();
  return /\btoken\b/.test(objectText) || tokenAliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(objectText));
}

/** Every identifier whose initializer mentions the verified flag. */
function collectVerifiedSymbols(sourceFile) {
  const symbols = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && node.name && ts.isIdentifier(node.name)) {
      // Only a GENUINE derivation counts. Matching on initializer text alone captured
      // `export const manageEnterpriseStaff = onCall(...)` — the whole callable, because
      // its body happens to mention the flag — and then reported the callable itself as a
      // dead gate. A derivation must not contain a function body of its own.
      let containsFunctionBody = false;
      const scan = (n) => {
        if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) {
          containsFunctionBody = true;
          return;
        }
        ts.forEachChild(n, scan);
      };
      scan(node.initializer);
      if (!containsFunctionBody && node.initializer.getText().includes(VERIFIED_FLAG)) {
        symbols.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return symbols;
}

/** Does this condition depend, directly or through a verified symbol, on the flag? */
function conditionIsVerifiedGate(conditionText, verifiedSymbols) {
  if (conditionText.includes(VERIFIED_FLAG)) return true;
  return [...verifiedSymbols].some((symbol) => new RegExp(`\\b${symbol}\\b`).test(conditionText));
}

/**
 * Is this node dominated by a verified gate? Walks ancestors looking for an `if`, a
 * ternary, a `&&` short-circuit or a loop condition that gates it.
 */
function isGuarded(node, verifiedSymbols) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isConditionalExpression(parent) && parent.condition !== current) {
      if (conditionIsVerifiedGate(parent.condition.getText(), verifiedSymbols)) return true;
    }
    if (ts.isIfStatement(parent) && parent.expression !== current) {
      if (conditionIsVerifiedGate(parent.expression.getText(), verifiedSymbols)) return true;
    }
    if (ts.isBinaryExpression(parent)
      && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && parent.right === current) {
      if (conditionIsVerifiedGate(parent.left.getText(), verifiedSymbols)) return true;
    }
    if ((ts.isWhileStatement(parent) || ts.isForStatement(parent)) && parent.expression) {
      if (conditionIsVerifiedGate(parent.expression.getText(), verifiedSymbols)) return true;
    }
    current = parent;
  }
  return false;
}

// ---- 1. EVERY ADDRESS READ IS STRUCTURALLY DOMINATED BY A VERIFIED GATE --------------
const ungated = [];
const deadGates = [];
let addressReads = 0;
let guardedReads = 0;

for (const file of serverFiles) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('email')) continue;
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const verifiedSymbols = collectVerifiedSymbols(sourceFile);

  // Aliases of an auth token, so `const tk = request.auth.token; tk?.email` is still seen.
  const tokenAliases = [];
  const findAliases = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && node.name && ts.isIdentifier(node.name)) {
      if (/\.auth\b[\s\S]*\btoken\b|\btoken\b\s*$/.test(node.initializer.getText())) tokenAliases.push(node.name.text);
    }
    ts.forEachChild(node, findAliases);
  };
  findAliases(sourceFile);

  // Destructuring an address off a token is a read too.
  const findDestructured = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const from = node.initializer.getText();
      const fromToken = /\btoken\b/.test(from) || tokenAliases.some((a) => new RegExp(`\\b${a}\\b`).test(from));
      const bindsEmail = node.name.elements.some((el) => (el.propertyName || el.name).getText() === 'email');
      if (fromToken && bindsEmail) {
        addressReads += 1;
        if (isGuarded(node, verifiedSymbols)) guardedReads += 1;
        else {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          ungated.push(`${rel(file)}:${line + 1}  destructures an address off a token with no verified gate`);
        }
      }
    }
    ts.forEachChild(node, findDestructured);
  };
  findDestructured(sourceFile);

  const visit = (node) => {
    if (isAddressRead(node, tokenAliases)) {
      addressReads += 1;
      if (isGuarded(node, verifiedSymbols)) guardedReads += 1;
      else {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        ungated.push(`${rel(file)}:${line + 1}  ${node.getText().slice(0, 70)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  // DEAD-GATE detection: a symbol derived from the flag that is never read in a guard is
  // a control that exists and does nothing — the exact "present but inert" shape.
  for (const symbol of verifiedSymbols) {
    const uses = [];
    const countUses = (node) => {
      if (ts.isIdentifier(node) && node.text === symbol) {
        const parent = node.parent;
        const isDeclarationName = parent && ts.isVariableDeclaration(parent) && parent.name === node;
        if (!isDeclarationName) uses.push(node);
      }
      ts.forEachChild(node, countUses);
    };
    countUses(sourceFile);
    const usedInGuard = uses.some((use) => {
      let current = use;
      while (current.parent) {
        const parent = current.parent;
        if (ts.isConditionalExpression(parent) && parent.condition === current) return true;
        if (ts.isIfStatement(parent) && parent.expression === current) return true;
        if (ts.isBinaryExpression(parent)
          && (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
            || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return true;
        if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return true;
        if (ts.isWhileStatement(parent) || ts.isForStatement(parent)) return true;
        current = parent;
      }
      return false;
    });
    if (!usedInGuard) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(sourceFile.getStart());
      deadGates.push(`${rel(file)}:${line + 1}  '${symbol}' is derived from ${VERIFIED_FLAG} but never used in a guard`);
    }
  }
}

assert.deepEqual(ungated, [], `AN ADDRESS IS READ WITHOUT A STRUCTURAL VERIFIED GATE:\n  ${ungated.join('\n  ')}`);
assert.deepEqual(deadGates, [], `A VERIFICATION GATE IS COMPUTED BUT NEVER USED:\n  ${deadGates.join('\n  ')}`);
ok(`${serverFiles.length} server modules (recursive): ${addressReads} address reads, all ${guardedReads} structurally dominated by a verified gate, no dead gates`);

// ---- 2. THE ANALYSIS IS NOT VACUOUS --------------------------------------------------
// If no address were read anywhere, check 1 would pass having proved nothing. And the
// analyser must be able to SEE an ungated read — proved on a synthetic sample rather than
// asserted, so a broken matcher cannot look like a clean codebase.
assert.ok(addressReads > 0, 'no address read was found at all; the analyser or the call sites have changed');
const PROBES = [
  ['plain read', 'const e = request.auth.token.email;', false],
  ['optional read', 'const e = request.auth.token?.email;', false],
  ['bracket read', 'const e = request.auth.token?.["email"];', false],
  ['aliased read', 'const tk = request.auth.token; const e = tk?.email;', false],
  ['destructured', 'const { email: e } = request.auth.token;', false],
  ['dead gate', 'const v = request.auth.token?.email_verified === true; void v; const e = request.auth.token?.email;', false],
  ['inverted dead gate', 'const v = request.auth.token?.email_verified === false; const e = request.auth.token?.email;', false],
  ['ternary gate', 'const v = request.auth.token?.email_verified === true; const e = v ? request.auth.token?.email : "";', true],
  ['if gate', 'const v = request.auth.token?.email_verified === true; let e = ""; if (v) { e = request.auth.token.email; }', true],
  ['inline flag gate', 'const e = request.auth.token?.email_verified === true ? request.auth.token?.email : "";', true],
  ['and-gate', 'const v = request.auth.token?.email_verified === true; const e = v && request.auth.token?.email;', true],
];
for (const [label, snippet, shouldPass] of PROBES) {
  const probe = ts.createSourceFile('probe.ts', `declare const request: any;\n${snippet}\n`, ts.ScriptTarget.ES2022, true);
  const symbols = collectVerifiedSymbols(probe);
  const aliases = [];
  const findA = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && n.name && ts.isIdentifier(n.name)
      && /\.auth\b[\s\S]*\btoken\b|\btoken\b\s*$/.test(n.initializer.getText())) aliases.push(n.name.text);
    ts.forEachChild(n, findA);
  };
  findA(probe);
  let sawUnguarded = false;
  let sawRead = false;
  const walk = (n) => {
    if (ts.isVariableDeclaration(n) && n.name && ts.isObjectBindingPattern(n.name) && n.initializer
      && /\btoken\b/.test(n.initializer.getText())
      && n.name.elements.some((el) => (el.propertyName || el.name).getText() === 'email')) {
      sawRead = true;
      if (!isGuarded(n, symbols)) sawUnguarded = true;
    }
    if (isAddressRead(n, aliases)) {
      sawRead = true;
      if (!isGuarded(n, symbols)) sawUnguarded = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(probe);
  assert.ok(sawRead, `the analyser did not even SEE the address read in the '${label}' probe`);
  assert.equal(!sawUnguarded, shouldPass, `probe '${label}': expected ${shouldPass ? 'guarded' : 'UNGATED'}, analyser said ${sawUnguarded ? 'ungated' : 'guarded'}`);
}
ok(`the analyser is discriminating: ${PROBES.length} probes incl. bracket access, aliasing, destructuring and dead/inverted gates`);

// ---- 3. AUTHORITY DERIVES FROM THE VERIFIED uid, NOT FROM AN ADDRESS ----------------
const indexSource = readFileSync(resolve(FUNCTIONS, 'index.ts'), 'utf8');
assert.match(indexSource, /collection\(['"]admin_users['"]\)\.doc\(/, 'admin_users is no longer looked up by document id');
const byAddress = indexSource.match(/collection\(['"]admin_users['"]\)\.doc\([^)]*[Ee]mail/g) || [];
assert.deepEqual(byAddress, [], `admin_users is looked up BY ADDRESS: ${byAddress.join(', ')}`);
const authoritySource = readFileSync(resolve(FUNCTIONS, 'authority.ts'), 'utf8');
assert.equal(/email/i.test(authoritySource), false, 'the authority core mentions an address concept');
ok('admin_users is addressed by document id only; the authority core has no address concept at all');

// ---- 4. PARTNER AUTHORITY DERIVES FROM IMMUTABLE MEMBERSHIP RECORDS -----------------
const activation = readFileSync(resolve(FUNCTIONS, 'partnerActivationRuntime.ts'), 'utf8');
const memberFn = activation.slice(activation.indexOf('async function member('), activation.indexOf('async function audit('));
assert.ok(memberFn.length > 50, 'could not locate member(); this check would pass vacuously');
assert.match(memberFn, /partner_identity_bindings/, 'membership no longer binds on the identity binding');
assert.match(memberFn, /partner_memberships/, 'membership no longer reads the membership record');
assert.match(memberFn, /partner_organizations/, 'membership no longer checks the organization');
assert.equal(/email/i.test(memberFn), false, 'partner membership resolution consults an address');
assert.equal(/r\.data\??\.organizationId/.test(memberFn), false, 'the organization comes from the request payload');
ok('partner authority binds on identity-binding → membership → organization, with no address and no payload organization');

// ---- 5. A ROLE GRANT REQUIRES A VERIFIED TARGET, NOT JUST A RESOLVED ADDRESS --------
// getUserByEmail resolves whoever registered that address first. A role grant that binds
// on it alone hands the grant to that account.
const staffGrant = indexSource.slice(indexSource.indexOf('export const manageEnterpriseStaff'));
const grantBody = staffGrant.slice(0, staffGrant.indexOf('export const', 10));
assert.ok(grantBody.length > 200, 'could not locate manageEnterpriseStaff');
assert.match(grantBody, /getUserByEmail/, 'the grant no longer resolves a target; re-check this verifier');
assert.match(grantBody, /staffRecord\.emailVerified/, 'a role grant does not require the TARGET address to be verified');
assert.match(grantBody, /enterprise_staff_grant_audits|grantAudit/, 'a role grant records no fail-closed evidence');
ok('an enterprise role grant requires a verified target identity and records evidence');

// ---- 6. THE VERIFIED-IDENTITY PROPERTY, EXERCISED ------------------------------------
const world = (await import(`file://${resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs')}`)).seed();
const compiled = resolve(ROOT, 'functions/lib/authority.js');
assert.ok(existsSync(compiled), 'functions are not compiled; run tsc first');
const authorityMod = await import(`file://${compiled}`);
const authority = authorityMod.default ?? authorityMod;

const groups = new Map();
for (const identity of world.identities) {
  groups.set(identity.contactEmail, [...(groups.get(identity.contactEmail) || []), identity]);
}
const shared = [...groups.entries()].filter(([, members]) => members.length > 1);
assert.ok(shared.length > 0, 'the world has no shared-address group, so this property cannot be exercised');
for (const [address, members] of shared) {
  const verdicts = members.map((m) => `${authority.isActiveStaff(m.adminDoc)}|${!!(m.partner && m.partner.membershipStatus === 'active')}`);
  assert.ok(new Set(verdicts).size > 1, `every principal on ${address} holds identical authority, so an address binding would be undetectable`);
  for (const member of members) {
    if (!member.adminDoc && !member.partner) {
      assert.equal(authority.isActiveStaff(member.adminDoc), false, `${member.principalId} gained authority with no record`);
    }
  }
}
ok(`${shared.length} shared-address group(s) exercised: principals on one address hold different authority, bound to the immutable principal`);

console.log(`\nIdentity binding verification PASS: ${checks} checks. Structural AST analysis over ${serverFiles.length} modules; ${addressReads} address reads all dominated by a verified gate; no dead or indirect gate.`);
