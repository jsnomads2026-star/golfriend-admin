// ==========================================
// FILE: scripts/route-guard-verify.mjs
// Fail-closed ROUTE-GUARD verifier (run: `npm run verify:guards`).
//
// Proves — by static analysis of src/App.tsx — that every reachable route belongs to exactly
// one of THREE authority classes, and that no class can render another authority surface:
//
//   PUBLIC      — renders no authority-bearing component at all (today: the `*` redirect).
//   APPLICANT   — /apply/* and /invitation/accept. May render an application; may NEVER
//                 render a Portal or Admin surface. Its authority is the applicant own
//                 application, which is not Portal authority.
//   PRIVILEGED  — / , /admin, /admin/*, /portal, /portal/*, /portal/:organizationId/* .
//                 Server-owned role documents only, through the resolver-gated <Dashboard>.
//
// It performs a string/regex scan (NOT execution) and checks:
//   1. Route inventory: every <Route path=..> is classified PUBLIC / APPLICANT / PRIVILEGED.
//   2. Every PRIVILEGED route renders <Dashboard> / <ScopedPartnerPortal> — never a portal
//      component directly.
//   3. The privileged portal renders (EnterpriseDashboard, SmallBusinessDashboard, the admin
//      sidebar block, TournamentTV) each sit inside an `access.state === 'authorized'` branch.
//   4. Access derivation is server-owned: resolvePortalAccess( + getDoc(doc(db,'admin_users'))
//      present; God-Mode literal ABSENT; no client role assignment.
//   5. Non-authorized states return a state screen BEFORE the authorized portal render.
//   6. Every APPLICANT route renders an applicant entrypoint (<ApplicantZone> /
//      <InvitationAcceptanceRoute>) and NO privileged component.
//   7. Applicant components (PartnerApplicationJourney, PartnerInvitationAcceptance) are
//      mounted ONLY inside the applicant zone functions. This was previously frozen as
//      "never mounted anywhere", which made the applicant journey permanently dead code;
//      the honest invariant is ZONED, not absent:
//         allowed  -> inside Applicant / InvitationAcceptanceRoute
//         denied   -> Dashboard, any privileged render, any public/unclassified fallback.
//   8. The applicant zone never renders a Portal/Admin surface, and the privileged Dashboard
//      never renders an applicant surface — checked over the actual function bodies.
//
// Exit 0 only if ALL checks pass; exit 1 (fail-closed) on ANY violation.
//
// HOW TO PROVE FAIL-CLOSED (do NOT commit these — local experiments only):
//   * Point a privileged route straight at a portal, e.g.
//       <Route path="/admin" element={<EnterpriseDashboard />} />        -> check 2 X
//   * Mount the applicant journey in the Dashboard body                  -> check 7/8 X
//   * Point an applicant route at <Dashboard mode="partner" />           -> check 6 X
//   * Add a new <Route path="/somewhere"> without classifying it         -> check 1 X
//   * Reintroduce a God-Mode bypass:  if (user.email === 'admin@...')    -> check 4 X
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

// Wildcard React Router paths contain `/*`, which is not a JavaScript comment while
// inside a string. The legacy regex stripper misread those paths as block comments.
// Route inventory therefore scans source directly; the focused route test separately
// rejects commented or client-selected authority paths.
const code = raw;
const lines = code.split(/\r?\n/);

// ---- Route classification sets ----
const PUBLIC_PATHS = [];
const APPLICANT_PATHS = [
  '/apply/small-business',
  '/apply/enterprise',
  '/apply/status',
  '/apply/:applicationId/documents',
  '/apply/:applicationId/agreement',
  '/apply/:applicationId/review',
  '/invitation/accept',
];
const PRIVILEGED_PATHS = ['/', '/admin', '/admin/*', '/portal', '/portal/:organizationId/*', '/portal/*'];

// Components that carry PRIVILEGED authority. None of these may be reached from an
// applicant or public route, directly or through an applicant zone function.
const PORTAL_COMPONENTS = ['EnterpriseDashboard', 'SmallBusinessDashboard', 'TournamentTV', 'V2AdminShell'];
const PRIVILEGED_ENTRYPOINTS = ['Dashboard', 'ScopedPartnerPortal'];
// Components that carry APPLICANT authority. None of these may be reached from a
// privileged, public or unclassified route.
const APPLICANT_COMPONENTS = ['PartnerApplicationJourney', 'PartnerInvitationAcceptance'];
// The only functions permitted to mount an applicant component.
const APPLICANT_ZONE_FUNCTIONS = ['Applicant', 'InvitationAcceptanceRoute'];

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
const applicantRoutes = [];
const privilegedRoutes = [];
const unclassified = [];
for (const r of routes) {
  if (r.path === '*' || PUBLIC_PATHS.includes(r.path)) publicRoutes.push(r);
  else if (APPLICANT_PATHS.includes(r.path)) applicantRoutes.push(r);
  else if (PRIVILEGED_PATHS.includes(r.path)) privilegedRoutes.push(r);
  else unclassified.push(r);
}

if (routes.length === 0) {
  fail('CHECK 1: no <Route> elements found — App.tsx shape unexpected (fail-closed)');
} else {
  pass(`CHECK 1: enumerated ${routes.length} route(s) — ${publicRoutes.length} public, ${applicantRoutes.length} applicant, ${privilegedRoutes.length} privileged`);
}
if (unclassified.length) {
  for (const r of unclassified) {
    fail(`CHECK 1: UNCLASSIFIED route path="${r.path}" — not in known PUBLIC/APPLICANT/PRIVILEGED sets. Classify it before shipping (fail-closed).`);
  }
}
// Ensure every expected route in each class is actually present (regression guard).
for (const p of PRIVILEGED_PATHS) {
  if (!privilegedRoutes.some((r) => r.path === p)) {
    fail(`CHECK 1: expected privileged route "${p}" not found in App.tsx`);
  }
}
for (const p of APPLICANT_PATHS) {
  if (!applicantRoutes.some((r) => r.path === p)) {
    fail(`CHECK 1: expected applicant route "${p}" not found in App.tsx`);
  }
}
// A public route may render NO authority-bearing component at all.
for (const r of publicRoutes) {
  const leaks = [...PORTAL_COMPONENTS, ...PRIVILEGED_ENTRYPOINTS, ...APPLICANT_COMPONENTS]
    .filter((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  if (leaks.length) fail(`CHECK 1: public route "${r.path}" renders authority-bearing component(s) ${leaks.join(', ')} — a public fallback must carry no authority`);
  else pass(`CHECK 1: public route "${r.path}" renders no authority-bearing component (element=${r.element})`);
}

// ================= CHECK 2: every PRIVILEGED route renders <Dashboard =================
// The Dashboard component is the resolver-gated entry point; a privileged route must
// NOT render a portal/admin component directly.
for (const r of privilegedRoutes) {
  const rendersDashboard = /<(?:Dashboard|ScopedPartnerPortal)[\s/>]/.test(r.element) || /<(?:Dashboard|ScopedPartnerPortal)$/.test(r.element);
  const rendersPortalDirect = PORTAL_COMPONENTS.some((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  const rendersApplicant = APPLICANT_COMPONENTS.concat(['ApplicantZone']).some((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  if (rendersApplicant) {
    fail(`CHECK 2: privileged route "${r.path}" renders an APPLICANT surface (element=${r.element}) — authority classes must not cross`);
  } else if (rendersDashboard && !rendersPortalDirect) {
    pass(`CHECK 2: privileged route "${r.path}" renders a resolver-gated entrypoint`);
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

function lineIndexOf(re, from = 0) {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
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

// ================= CHECK 6: every APPLICANT route renders an applicant entrypoint =====
// Behavioural, per route: the element must be an applicant zone entrypoint, must carry no
// privileged component, and — for the parameterised views — must forward the route view so
// the seven routes are genuinely distinct surfaces rather than one aliased page.
const APPLICANT_ENTRYPOINTS = ['ApplicantZone', 'InvitationAcceptanceRoute'];
const EXPECTED_APPLICANT_ELEMENT = {
  '/apply/small-business': /<ApplicantZone[^>]*intent="small_business"/,
  '/apply/enterprise': /<ApplicantZone[^>]*intent="enterprise"/,
  '/apply/status': /<ApplicantZone[^>]*view="status"/,
  '/apply/:applicationId/documents': /<ApplicantZone[^>]*view="documents"/,
  '/apply/:applicationId/agreement': /<ApplicantZone[^>]*view="agreement"/,
  '/apply/:applicationId/review': /<ApplicantZone[^>]*view="review"/,
  '/invitation/accept': /<InvitationAcceptanceRoute[\s/>]/,
};
for (const r of applicantRoutes) {
  const entrypoint = APPLICANT_ENTRYPOINTS.some((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  const privilegedLeak = [...PORTAL_COMPONENTS, ...PRIVILEGED_ENTRYPOINTS]
    .filter((c) => new RegExp(`<${c}[\\s/>]`).test(r.element));
  const expected = EXPECTED_APPLICANT_ELEMENT[r.path];
  if (privilegedLeak.length) {
    fail(`CHECK 6: applicant route "${r.path}" renders PRIVILEGED component(s) ${privilegedLeak.join(', ')} — an applicant route must never reach a Portal or Admin surface`);
  } else if (!entrypoint) {
    fail(`CHECK 6: applicant route "${r.path}" does not render an applicant zone entrypoint (element=${r.element})`);
  } else if (expected && !expected.test(r.element)) {
    fail(`CHECK 6: applicant route "${r.path}" does not carry its own view/intent (element=${r.element}) — the seven applicant routes must be distinct surfaces`);
  } else {
    pass(`CHECK 6: applicant route "${r.path}" renders its own applicant surface, with no privileged component`);
  }
}

// ================= CHECK 7: applicant components are ZONED, not absent ================
// Extract top-level function bodies by brace matching so a mount can be attributed to the
// function that actually renders it.
function functionBodies(source) {
  const found = new Map();
  const declRe = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let d;
  while ((d = declRe.exec(source)) !== null) {
    const name = d[1];
    // Skip the parameter list before looking for the body brace. These components take a
    // destructured props object with a TypeScript annotation, so the first `{` after the
    // declaration belongs to the parameters, not the body — matching it as the body made
    // every mount look like it lived at module scope.
    const paren = source.indexOf('(', d.index);
    if (paren === -1) continue;
    let parenDepth = 0;
    let afterParams = -1;
    for (let i = paren; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') parenDepth++;
      else if (ch === ')') { parenDepth--; if (parenDepth === 0) { afterParams = i; break; } }
    }
    if (afterParams === -1) continue;
    const open = source.indexOf('{', afterParams);
    if (open === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) found.set(name, { start: d.index, end, body: source.slice(open, end + 1) });
  }
  return found;
}
const bodies = functionBodies(code);

function ownerOf(index) {
  const owner = [...bodies.entries()].find(([, v]) => index > v.start && index < v.end);
  return owner ? owner[0] : '<module scope>';
}

for (const component of APPLICANT_COMPONENTS) {
  const mountRe = new RegExp(`<${component}[\\s/>]`, 'g');
  const owners = [];
  let hit;
  while ((hit = mountRe.exec(code)) !== null) owners.push(ownerOf(hit.index));
  if (owners.length === 0) {
    fail(`CHECK 7: applicant component <${component}> is mounted nowhere — the applicant journey would be unreachable dead code`);
    continue;
  }
  const illegal = owners.filter((o) => !APPLICANT_ZONE_FUNCTIONS.includes(o));
  if (illegal.length) {
    fail(`CHECK 7: <${component}> is mounted outside the applicant zone, in ${[...new Set(illegal)].join(', ')} — allowed only in ${APPLICANT_ZONE_FUNCTIONS.join('/')}`);
  } else {
    pass(`CHECK 7: <${component}> is mounted only inside the applicant zone (${[...new Set(owners)].join(', ')})`);
  }
}

// The applicant zone must be reachable ONLY through the applicant routes: <Applicant is
// rendered by ApplicantZone alone, and ApplicantZone appears only in applicant route elements.
const applicantMounts = [];
{
  const re = /<Applicant[\s/>]/g;
  let hit;
  while ((hit = re.exec(code)) !== null) applicantMounts.push(ownerOf(hit.index));
}
applicantMounts.length && applicantMounts.every((o) => o === 'ApplicantZone')
  ? pass('CHECK 7: <Applicant> is reachable only through <ApplicantZone> (the applicant route element)')
  : fail(`CHECK 7: <Applicant> is mounted outside <ApplicantZone> (${[...new Set(applicantMounts)].join(', ') || 'nowhere'}) — the applicant zone must have exactly one entrypoint`);

// ================= CHECK 8: no class renders another authority surface ================
const applicantZoneSource = APPLICANT_ZONE_FUNCTIONS
  .map((n) => bodies.get(n)?.body || '')
  .join('\n');
if (!applicantZoneSource.trim()) {
  fail(`CHECK 8: applicant zone function(s) ${APPLICANT_ZONE_FUNCTIONS.join('/')} not found — App.tsx shape changed (fail-closed)`);
} else {
  const leak = [...PORTAL_COMPONENTS, ...PRIVILEGED_ENTRYPOINTS]
    .filter((c) => new RegExp(`<${c}[\\s/>]`).test(applicantZoneSource));
  leak.length
    ? fail(`CHECK 8: the applicant zone renders privileged component(s) ${leak.join(', ')} — an application must never become Portal or Admin authority`)
    : pass('CHECK 8: the applicant zone renders no Portal or Admin component');
  // Portal readiness may be OFFERED as a link, but only from a server fact.
  /access\.portalReady/.test(applicantZoneSource)
    ? pass('CHECK 8: the applicant zone offers the Portal only behind the server-derived access.portalReady fact')
    : fail('CHECK 8: the applicant zone does not derive Portal readiness from the server resolver (access.portalReady)');
}

const dashboardBody = bodies.get('Dashboard')?.body || '';
if (!dashboardBody.trim()) {
  fail('CHECK 8: Dashboard function not found — App.tsx shape changed (fail-closed)');
} else {
  const leak = APPLICANT_COMPONENTS.concat(['ApplicantZone', 'Applicant'])
    .filter((c) => new RegExp(`<${c}[\\s/>]`).test(dashboardBody));
  leak.length
    ? fail(`CHECK 8: the privileged Dashboard renders applicant component(s) ${leak.join(', ')} — an applicant surface must never appear through a Portal/Admin fallback`)
    : pass('CHECK 8: the privileged Dashboard renders no applicant component');
}

// ============================== REPORT ==============================
console.log('\nROUTE-GUARD VERIFY — src/App.tsx\n' + '='.repeat(52));
console.log('\nROUTE INVENTORY:');
for (const r of publicRoutes) console.log(`  PUBLIC      path="${r.path}"  → ${r.element}`);
for (const r of applicantRoutes) console.log(`  APPLICANT   path="${r.path}"  → ${r.element}`);
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
  console.error(`❌ ROUTE-GUARD VERIFY FAILED — ${failed} violation(s). Route authority classes are not provably separated.`);
  process.exit(1);
}
console.log(`✅ ROUTE-GUARD VERIFY PASSED — all ${results.length} checks green across ${publicRoutes.length} public, ${applicantRoutes.length} applicant and ${privilegedRoutes.length} privileged route(s).`);
process.exit(0);
