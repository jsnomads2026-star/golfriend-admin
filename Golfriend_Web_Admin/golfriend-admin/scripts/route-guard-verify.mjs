// ==========================================
// FILE: scripts/route-guard-verify.mjs
// Fail-closed ROUTE-GUARD verifier (run: `npm run verify:guards`).
//
// Proves — by static analysis of src/App.tsx — that every reachable PRIVILEGED
// route/surface is behind SERVER-OWNED authorization: no local/God-Mode/fallback
// identity and no client role assignment can reach a privileged portal.
//
// It performs a comment-stripped, string/regex scan (NOT execution) and checks:
//   1. Route inventory: every <Route path=..> is classified PUBLIC vs PRIVILEGED.
//   2. Every PRIVILEGED route (/partner, /admin) renders <Dashboard  (the
//      resolver-gated component) — never a portal/admin component directly.
//   3. The privileged portal renders (EnterpriseDashboard, SmallBusinessDashboard,
//      the admin sidebar block, TournamentTV) each sit inside an
//      `access.state === 'authorized'` branch — never unconditional / pre-resolver.
//   4. Access derivation is server-owned: resolvePortalAccess( + getDoc(doc(db,
//      'admin_users' present; God-Mode literal admin@golfriend.co ABSENT; and no
//      client role assignment (setUser({...role...}) / hardcoded role default).
//   5. Non-authorized states (unauthorized/suspended/error/signed_out) return a
//      state screen BEFORE the authorized portal render — i.e. fail-closed order.
//
// Exit 0 only if ALL checks pass; exit 1 (fail-closed) on ANY violation.
//
// HOW TO PROVE FAIL-CLOSED (do NOT commit these — local experiments only):
//   * Point a privileged route straight at a portal, e.g.
//       <Route path="/admin" element={<EnterpriseDashboard />} />   -> check 2 ✗
//   * Render a portal before the resolver / unconditionally, e.g. move
//       `return <TournamentTV />;` above the resolvePortalAccess(...) call -> check 3/5 ✗
//   * Reintroduce a God-Mode bypass:  if (user.email === 'admin@golfriend.co')  -> check 4 ✗
//   * Client role assignment:  setUser({ ...currentUser, role: 'admin' })       -> check 4 ✗
//   Any single edit above flips the exit code to 1.
// ==========================================
import { readFileSync } from 'node:fs';

const APP = new URL('../src/App.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let raw;
try {
  raw = readFileSync(APP, 'utf8');
} catch (e) {
  console.error(`❌ ROUTE-GUARD VERIFY FAILED — cannot read src/App.tsx: ${e.message}`);
  process.exit(1);
}

// ---- Comment-strip (block + line comments), preserving line count for context. ----
function stripComments(src) {
  // Remove /* ... */ (multiline) then // ... to end of line.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/([^:])\/\/[^\n]*/g, '$1'); // keep http:// etc. (needs a non-colon before //)
}
const code = stripComments(raw);
const lines = code.split(/\r?\n/);

// ---- Route classification sets ----
const PUBLIC_PATHS = ['/', '/storefront', '/discover', '/legal', '/support'];
const PRIVILEGED_PATHS = ['/partner', '/admin'];

const results = []; // { ok: boolean, label: string }
const pass = (label) => results.push({ ok: true, label });
const fail = (label) => results.push({ ok: false, label });

// ================= CHECK 1: enumerate + classify every <Route path="X"> =================
const routeRe = /<Route\s+path=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})\s+element=\{([\s\S]*?)\}\s*\/>/g;
const routes = [];
let m;
while ((m = routeRe.exec(code)) !== null) {
  const path = m[1] ?? m[2] ?? (m[3] || '').trim();
  const element = m[4].trim();
  routes.push({ path, element });
}

const publicRoutes = [];
const privilegedRoutes = [];
const unclassified = [];
for (const r of routes) {
  if (r.path === '*' || PUBLIC_PATHS.includes(r.path)) publicRoutes.push(r);
  else if (PRIVILEGED_PATHS.includes(r.path)) privilegedRoutes.push(r);
  else unclassified.push(r);
}

if (routes.length === 0) {
  fail('CHECK 1: no <Route> elements found — App.tsx shape unexpected (fail-closed)');
} else {
  pass(`CHECK 1: enumerated ${routes.length} route(s) — ${publicRoutes.length} public, ${privilegedRoutes.length} privileged`);
}
if (unclassified.length) {
  for (const r of unclassified) {
    fail(`CHECK 1: UNCLASSIFIED route path="${r.path}" — not in known PUBLIC/PRIVILEGED sets. Classify it before shipping (fail-closed).`);
  }
}
// Ensure both privileged routes are actually present (regression guard).
for (const p of PRIVILEGED_PATHS) {
  if (!privilegedRoutes.some((r) => r.path === p)) {
    fail(`CHECK 1: expected privileged route "${p}" not found in App.tsx`);
  }
}

// ================= CHECK 2: every PRIVILEGED route renders <Dashboard =================
// The Dashboard component is the resolver-gated entry point; a privileged route must
// NOT render a portal/admin component directly.
const PORTAL_COMPONENTS = ['EnterpriseDashboard', 'SmallBusinessDashboard', 'TournamentTV'];
for (const r of privilegedRoutes) {
  const rendersDashboard = /<Dashboard[\s/>]/.test(r.element) || /<Dashboard$/.test(r.element);
  const rendersPortalDirect = PORTAL_COMPONENTS.some((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  if (rendersDashboard && !rendersPortalDirect) {
    pass(`CHECK 2: privileged route "${r.path}" renders <Dashboard ...> (resolver-gated)`);
  } else if (rendersPortalDirect) {
    fail(`CHECK 2: privileged route "${r.path}" renders a portal component DIRECTLY (element=${r.element}) — must route through <Dashboard>`);
  } else {
    fail(`CHECK 2: privileged route "${r.path}" does NOT render <Dashboard> (element=${r.element}) — server-owned gate bypassed`);
  }
}

// ================= CHECK 4: server-owned derivation + no client identity =================
// (Run before 3/5 because those depend on the resolver call being present.)
const hasResolver = /resolvePortalAccess\s*\(/.test(code);
const resolverIdx = hasResolver ? code.indexOf('resolvePortalAccess(') : -1;
hasResolver
  ? pass('CHECK 4a: resolvePortalAccess( present — access derived via server-owned resolver')
  : fail('CHECK 4a: resolvePortalAccess( ABSENT — no resolver-owned access derivation');

/getDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]admin_users['"]/.test(code)
  ? pass("CHECK 4b: getDoc(doc(db, 'admin_users', ...)) present — admin authz reads server role doc")
  : fail("CHECK 4b: server read getDoc(doc(db,'admin_users',...)) ABSENT — admin access not server-owned");

// God-Mode literal must be absent (raw source, so a commented-out one still trips).
/admin@golfriend\.co/.test(raw)
  ? fail("CHECK 4c: God-Mode literal 'admin@golfriend.co' PRESENT in App.tsx — remove client identity bypass")
  : pass("CHECK 4c: God-Mode literal 'admin@golfriend.co' absent");

// No client role assignment that could grant access. Two shapes:
//  (a) setUser({ ... role ... })  — stamping a role onto the client user object.
//  (b) a hardcoded role default    — e.g. role = 'admin' / role: 'admin' assignment.
const clientRoleAssign = /setUser\s*\(\s*\{[^}]*\brole\b[^}]*\}/.test(code);
const hardcodedRoleDefault = /\brole\s*[:=]\s*['"](admin|enterprise|small_business|owner|superadmin)['"]/.test(code);
clientRoleAssign
  ? fail('CHECK 4d: client role assignment setUser({...role...}) found — access must come from server role doc only')
  : pass('CHECK 4d: no setUser({...role...}) client role assignment');
hardcodedRoleDefault
  ? fail('CHECK 4e: hardcoded role default granting access found (role = "admin"/"enterprise"/…) — remove client-side role grant')
  : pass('CHECK 4e: no hardcoded access-granting role default');

// ================= CHECK 3: privileged renders sit inside an authorized branch =========
// For each privileged render, require an `access.state === 'authorized'` check within a
// small window of preceding lines (same guard block).
const AUTHORIZED_CHECK = /access\.state\s*===\s*['"]authorized['"]/;
const WINDOW = 8; // lines to look back for the guard

// Locate line numbers of each privileged render we must protect.
const guardedRenders = [
  { name: 'TournamentTV', re: /return\s*<TournamentTV\s*\/>/ },
  { name: 'EnterpriseDashboard', re: /<EnterpriseDashboard[\s/>]/ },
  { name: 'SmallBusinessDashboard', re: /<SmallBusinessDashboard[\s/>]/ },
  // The admin sidebar block is the big authorized `return (` after the non-authorized guard.
  { name: 'AdminSidebar', re: /GOLFRIEND ADMIN<\/h1>/ },
];

function lineIndexOf(re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

for (const g of guardedRenders) {
  const idx = lineIndexOf(g.re);
  if (idx === -1) {
    fail(`CHECK 3: expected privileged render "${g.name}" not found — App.tsx shape changed (fail-closed)`);
    continue;
  }
  // Must appear AFTER the resolver call (line offset).
  const renderCharIdx = code.indexOf(lines[idx]);
  const afterResolver = resolverIdx !== -1 && renderCharIdx > resolverIdx;

  // Look back for an authorized-state guard within WINDOW lines.
  let guarded = false;
  for (let j = Math.max(0, idx - WINDOW); j <= idx; j++) {
    if (AUTHORIZED_CHECK.test(lines[j])) { guarded = true; break; }
  }
  // The admin sidebar is guarded by the *preceding* non-authorized early-return
  // (`if (access.state !== 'authorized') { return ... }`) rather than an inline
  // === 'authorized'. Accept that negative guard for the sidebar block.
  if (!guarded && g.name === 'AdminSidebar') {
    const negGuardIdx = lineIndexOf(/if\s*\(\s*access\.state\s*!==\s*['"]authorized['"]\s*\)/);
    if (negGuardIdx !== -1 && negGuardIdx < idx) guarded = true;
  }

  if (guarded && afterResolver) {
    pass(`CHECK 3: "${g.name}" render is inside an access.state==='authorized' guard, after the resolver`);
  } else if (!afterResolver) {
    fail(`CHECK 3: "${g.name}" render appears BEFORE resolvePortalAccess(...) — pre-resolver bypass`);
  } else {
    fail(`CHECK 3: "${g.name}" render is NOT within an access.state==='authorized' guard (within ${WINDOW} lines) — unconditional privileged render`);
  }
}

// ================= CHECK 5: non-authorized states return a screen BEFORE portal ========
// Fail-closed ordering: the `if (access.state !== 'authorized')` state-screen return must
// precede the authorized admin-sidebar portal render. Likewise signed_out is handled
// before the sidebar. This proves unauthorized/suspended/error/signed_out cannot fall
// through to a privileged surface.
const negGuardIdx = code.indexOf("access.state !== 'authorized'") >= 0
  ? code.indexOf("access.state !== 'authorized'")
  : code.indexOf('access.state !== "authorized"');
const signedOutIdx = code.indexOf("access.state === 'signed_out'") >= 0
  ? code.indexOf("access.state === 'signed_out'")
  : code.indexOf('access.state === "signed_out"');
const sidebarIdx = code.indexOf('GOLFRIEND ADMIN</h1>');

if (negGuardIdx === -1) {
  fail("CHECK 5: no `access.state !== 'authorized'` state-screen guard found — non-authorized states may fall through");
} else if (sidebarIdx !== -1 && negGuardIdx < sidebarIdx) {
  pass("CHECK 5: non-authorized guard (access.state !== 'authorized') returns a state screen BEFORE the admin portal render");
} else {
  fail("CHECK 5: non-authorized guard does NOT precede the admin portal render — unauthorized/suspended/error could reach a privileged surface");
}
if (signedOutIdx !== -1 && (sidebarIdx === -1 || signedOutIdx < sidebarIdx)) {
  pass("CHECK 5: signed_out is handled (login form / storefront redirect) before the admin portal render");
} else {
  fail("CHECK 5: signed_out state not handled before the admin portal render");
}

// ============================== REPORT ==============================
console.log('\nROUTE-GUARD VERIFY — src/App.tsx\n' + '='.repeat(52));
console.log('\nROUTE INVENTORY:');
for (const r of publicRoutes) console.log(`  PUBLIC      path="${r.path}"  → ${r.element}`);
for (const r of privilegedRoutes) console.log(`  PRIVILEGED  path="${r.path}"  → ${r.element}`);
for (const r of unclassified) console.log(`  ??UNKNOWN   path="${r.path}"  → ${r.element}`);

console.log('\nGUARD CHECKS:');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}`);
  if (!r.ok) failed++;
}

console.log('\n' + '='.repeat(52));
if (failed) {
  console.error(`❌ ROUTE-GUARD VERIFY FAILED — ${failed} violation(s). Privileged surface(s) not provably server-gated.`);
  process.exit(1);
}
console.log(`✅ ROUTE-GUARD VERIFY PASSED — all ${results.length} checks green. Every privileged route/surface is behind the server-owned resolver.`);
process.exit(0);
