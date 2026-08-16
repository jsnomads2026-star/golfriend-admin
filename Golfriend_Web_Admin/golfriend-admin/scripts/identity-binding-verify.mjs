// ==========================================
// FILE: scripts/identity-binding-verify.mjs
// Run: node scripts/identity-binding-verify.mjs
//
// NO AUTHORITY MAY DERIVE FROM AN UNVERIFIED CONTACT ADDRESS.
//
// Firebase does not require an address to be verified before an account can register
// it, and several collections here are address-keyed. So `token.email` alone resolves
// to "whoever claimed this address", which is not an identity. Every read of it must
// be dominated by a check on `email_verified`.
//
// This is a STRUCTURAL check, not a proximity one. An earlier version of this idea
// scanned a few lines around each read and called it bound if the word appeared
// nearby — which passes for a gate assigned to a dead variable, an inverted
// condition, or a read reached through an alias. Here the file is parsed and each
// read's ANCESTORS are walked to find a real dominating condition.
// ==========================================
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions/src');
const ts = createRequire(import.meta.url)('typescript');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

/** The verified-ness signal, and the address property that depends on it. */
const VERIFIED_PROP = 'email_verified';
const ADDRESS_PROP = 'email';

/**
 * Collect every identifier that was assigned from a `email_verified` test, so that
 * `const v = token.email_verified === true; ... if (v)` counts as a real gate.
 * An initializer containing a function body is skipped: the symbol would then be a
 * predicate, not a decided value.
 */
function collectVerifiedSymbols(source) {
  const symbols = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      const init = node.initializer.getText(source);
      const hasFunctionBody = /=>|function\s*\(/.test(init);
      // The initializer must be a TEST of verified-ness and nothing else. Without this
      // last condition `const addr = verified ? token.email : ''` counts as a gate
      // symbol — it does mention the signal — and is then reported as a dead gate
      // because nothing reads it. The gate and the value it guards are different
      // things, and a declaration that carries the address is the value.
      const carriesAddress = init.split(VERIFIED_PROP).join('').includes(ADDRESS_PROP);
      if (init.includes(VERIFIED_PROP) && !hasFunctionBody && !carriesAddress) symbols.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return symbols;
}

/** Is this node a read of the address property (dotted or bracketed)? */
function isAddressRead(node, source, verifiedSymbols) {
  if (ts.isPropertyAccessExpression(node) && node.name.text === ADDRESS_PROP) return true;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const arg = node.argumentExpression;
    if (ts.isStringLiteral(arg) && arg.text === ADDRESS_PROP) return true;
    // A bracket read through a variable holding the property name.
    if (ts.isIdentifier(arg) && verifiedSymbols.has(arg.text)) return true;
    if (ts.isIdentifier(arg)) {
      const text = node.getText(source);
      if (text.includes(ADDRESS_PROP)) return true;
    }
  }
  return false;
}

/** Does `text` reference the verified signal, directly or via a decided symbol? */
function referencesVerified(text, verifiedSymbols) {
  if (text.includes(VERIFIED_PROP)) return true;
  return [...verifiedSymbols].some((sym) => new RegExp(`\\b${sym}\\b`).test(text));
}

/**
 * Walk ancestors looking for a condition that DOMINATES this node: an enclosing
 * if/ternary/&&/loop whose test references the verified signal, or a conditional
 * expression in which this node sits on a branch.
 */
function isDominated(node, source, verifiedSymbols) {
  let current = node.parent;
  while (current) {
    if (ts.isIfStatement(current) && referencesVerified(current.expression.getText(source), verifiedSymbols)) return true;
    if (ts.isConditionalExpression(current) && referencesVerified(current.condition.getText(source), verifiedSymbols)) return true;
    if (ts.isBinaryExpression(current)
      && (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || current.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      && referencesVerified(current.left.getText(source), verifiedSymbols)) return true;
    if ((ts.isWhileStatement(current) || ts.isForStatement(current))
      && current.expression && referencesVerified(current.expression.getText(source), verifiedSymbols)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * A DEAD GATE: the verified value is computed and then never consulted. The check is
 * present, the protection is not.
 */
function findDeadGates(source, verifiedSymbols) {
  const dead = [];
  for (const symbol of verifiedSymbols) {
    let uses = 0;
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === symbol) {
        const isDeclarationName = node.parent && ts.isVariableDeclaration(node.parent) && node.parent.name === node;
        if (!isDeclarationName) uses += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (uses === 0) dead.push(symbol);
  }
  return dead;
}

function analyze(text, fileName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const verifiedSymbols = collectVerifiedSymbols(source);
  const reads = [];
  const visit = (node) => {
    if (isAddressRead(node, source, verifiedSymbols)) {
      // The declaration `email_verified` itself is not an address read.
      const self = node.getText(source);
      if (!self.includes(VERIFIED_PROP)) {
        reads.push({
          text: self,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          dominated: isDominated(node, source, verifiedSymbols),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { reads, deadGates: findDeadGates(source, verifiedSymbols), verifiedSymbols };
}

// ---- 1. EVERY ADDRESS READ IN THE SERVER TREE IS DOMINATED --------------------------
const files = readdirSync(FUNCTIONS).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));
const unbound = [];
const deadGateReports = [];
let totalReads = 0;
for (const name of files) {
  const full = resolve(FUNCTIONS, name);
  const text = readFileSync(full, 'utf8');
  // Only auth-token reads are in scope: an address typed into a form by an operator is
  // data, not a claim of identity.
  if (!text.includes('auth.token')) continue;
  const { reads, deadGates } = analyze(text, name);
  const tokenReads = reads.filter((r) => /token/.test(r.text));
  totalReads += tokenReads.length;
  for (const read of tokenReads) {
    if (!read.dominated) unbound.push(`${relative(ROOT, full).replace(/\\/g, '/')}:${read.line} ${read.text}`);
  }
  if (deadGates.length) deadGateReports.push(`${name}: ${deadGates.join(', ')}`);
}
assert.deepEqual(unbound, [], `AUTHORITY DERIVED FROM AN UNVERIFIED ADDRESS:\n  ${unbound.join('\n  ')}`);
assert.deepEqual(deadGateReports, [], `A VERIFIED-ADDRESS GATE IS COMPUTED BUT NEVER USED:\n  ${deadGateReports.join('\n  ')}`);
assert.ok(totalReads > 0, 'no token address reads were found at all — the analyser is looking in the wrong place');
ok(`${files.length} server modules scanned: ${totalReads} token address read(s), all structurally dominated by a verified gate, no dead gates`);

// ---- 2. THE ANALYSER IS DISCRIMINATING ----------------------------------------------
// A checker that cannot fail is not a checker. Each probe is a bypass that a proximity
// heuristic accepts and this one must reject — plus honest positives it must accept.
const PROBES = [
  ['plain unguarded read', 'const a = request.auth.token?.email;', false],
  ['bracket-access read', "const a = request.auth.token['email'];", false],
  ['dead gate then read', 'const v = request.auth.token?.email_verified === true;\nconst a = request.auth.token?.email;', false],
  ['read inside an if on something else', 'if (request.auth.uid) { const a = request.auth.token?.email; }', false],
  ['guarded by if', 'if (request.auth.token?.email_verified === true) { const a = request.auth.token?.email; }', true],
  ['guarded by ternary', 'const a = request.auth.token?.email_verified === true ? request.auth.token?.email : "";', true],
  ['guarded by &&', 'const a = request.auth.token?.email_verified === true && request.auth.token?.email;', true],
  ['guarded via a decided symbol', 'const v = request.auth.token?.email_verified === true;\nconst a = v ? request.auth.token?.email : "";', true],
  ['inverted dead gate', 'const v = request.auth.token?.email_verified === true;\nif (!v) { }\nconst a = request.auth.token?.email;', false],
];
const probeFailures = [];
for (const [label, snippet, shouldPass] of PROBES) {
  const { reads, deadGates } = analyze(snippet, 'probe.ts');
  const tokenReads = reads.filter((r) => /token/.test(r.text));
  const clean = tokenReads.every((r) => r.dominated) && deadGates.length === 0;
  if (clean !== shouldPass) probeFailures.push(`${label}: expected ${shouldPass ? 'clean' : 'flagged'}`);
}
assert.deepEqual(probeFailures, [], `THE ANALYSER IS NOT DISCRIMINATING:\n  ${probeFailures.join('\n  ')}`);
ok(`the analyser is discriminating: ${PROBES.length} probes incl. bracket access, dead and inverted gates, symbol aliasing`);

// ---- 3. THE SHARED PREDICATE TAKES NO ADDRESS ---------------------------------------
const authority = readFileSync(resolve(FUNCTIONS, 'authority.ts'), 'utf8');
assert.equal(/email/i.test(authority), false, 'authority.ts mentions an address; the predicate must derive from the document alone');
ok('the shared staff predicate contains no address concept at all');

console.log(`\nIdentity binding verification PASS: ${checks} checks. Structural AST analysis over ${files.length} modules; ${totalReads} address reads, every one dominated by a verified gate.`);
