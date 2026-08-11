#!/usr/bin/env node
// ============================================================================
// route-capability-map.mjs
// ----------------------------------------------------------------------------
// STATIC, EXECUTABLE reachable/quarantined ROUTE-CAPABILITY MAP.
//
// Parses (does NOT execute) the admin shell + the two B2B partner dashboards
// and emits a machine-readable JSON map of every route/tab -> component ->
// reachability, plus a human summary.
//
// A tab is REACHABLE only if it has BOTH a render line AND a nav button
// (or an explicit route). A tab that has a render/import but NO nav button /
// route is QUARANTINED / DEAD (e.g. the admin 'ledger' / 'sponsor' literals).
//
// The map is DESCRIPTIVE. A separate dead-route gate consumes `warnings`
// and enforces. This script exits 0 unless it cannot read a source file.
//
// Usage:  node scripts/route-capability-map.mjs
// Writes: route-capability-map.json (repo root) + prints JSON + summary.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const SRC = {
  app: join(REPO_ROOT, 'src', 'App.tsx'),
  small: join(REPO_ROOT, 'src', 'components', 'B2B', 'SmallBusinessDashboard.tsx'),
  enterprise: join(REPO_ROOT, 'src', 'components', 'B2B', 'EnterpriseDashboard.tsx'),
};

// Components expected to stay quarantined (must never be reachable). If either
// becomes reachable, a warning is emitted for the dead-route gate to fail on.
const EXPECTED_QUARANTINED = ['SponsorOnboardingWizard', 'LedgerWatchtower'];

// --- tolerant readers --------------------------------------------------------
function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`[route-capability-map] WARN: could not read ${path}: ${err.message}`);
    return null;
  }
}

// Collect all regex matches; never throw on an unmatched line.
function matchAll(src, re) {
  const out = [];
  if (!src) return out;
  let m;
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = rx.exec(src)) !== null) {
    out.push(m);
    if (m.index === rx.lastIndex) rx.lastIndex++; // guard against zero-width
  }
  return out;
}

// ----------------------------------------------------------------------------
// Shared dashboard parser: a component that switches on an internal `activeTab`
// with `{activeTab === 'x' && <Component .../>}` renders and
// `setActiveTab('x')` nav buttons. Returns per-tab reachability entries.
// ----------------------------------------------------------------------------
function parseTabSurface(src, surface) {
  const entries = [];
  if (!src) return entries;

  // Union literals declared in useState<...>(...) for activeTab (may be absent).
  const literalSet = new Set();
  const unionMatch = src.match(/const\s*\[\s*activeTab\s*,\s*setActiveTab\s*\]\s*=\s*useState<([\s\S]*?)>\s*\(/);
  if (unionMatch) {
    for (const lit of matchAll(unionMatch[1], /'([^']+)'/g)) literalSet.add(lit[1]);
  }

  // Render lines: activeTab === 'x' && <Component
  const renders = new Map(); // tab -> component
  for (const m of matchAll(src, /activeTab\s*===\s*'([^']+)'\s*&&\s*<([A-Za-z0-9_]+)/g)) {
    renders.set(m[1], m[2]);
    literalSet.add(m[1]);
  }

  // Nav buttons: setActiveTab('x')
  const navTabs = new Set();
  for (const m of matchAll(src, /setActiveTab\(\s*'([^']+)'\s*\)/g)) {
    navTabs.add(m[1]);
    literalSet.add(m[1]);
  }

  for (const tab of [...literalSet].sort()) {
    const component = renders.get(tab) || null;
    const hasRender = renders.has(tab);
    const hasNav = navTabs.has(tab);
    const reachable = hasRender && hasNav;

    let reason;
    if (reachable) reason = 'nav button + render present';
    else if (hasRender && !hasNav) reason = 'render present but NO nav button -> quarantined/dead';
    else if (!hasRender && hasNav) reason = 'nav button present but NO render line -> broken/dead nav';
    else reason = 'declared in activeTab union but neither render nor nav -> dead literal';

    entries.push({ surface, route_or_tab: tab, component, reachable, reason });
  }
  return entries;
}

// ----------------------------------------------------------------------------
// Public route parser for App.tsx: <Route path="..." element={<X .../>} />
// ----------------------------------------------------------------------------
function parsePublicRoutes(src) {
  const entries = [];
  if (!src) return entries;
  for (const m of matchAll(src, /<Route\s+path="([^"]+)"\s+element=\{\s*<([A-Za-z0-9_]+)/g)) {
    const [, path, component] = m;
    if (path === '*' || component === 'Navigate') {
      entries.push({
        surface: 'public',
        route_or_tab: path,
        component,
        reachable: true,
        reason: 'catch-all redirect (Navigate) -> reachable by default',
      });
      continue;
    }
    entries.push({
      surface: 'public',
      route_or_tab: path,
      component,
      reachable: true,
      reason: 'declared <Route> with element -> reachable',
    });
  }
  return entries;
}

// ----------------------------------------------------------------------------
// Dead-import cross-check: an imported component never rendered (`<Name`) and
// never routed within the file body is a dead import.
// ----------------------------------------------------------------------------
function findDeadImports(src, fileLabel) {
  const dead = [];
  if (!src) return dead;
  for (const m of matchAll(src, /^\s*import\s+([A-Za-z0-9_]+)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const [, name, from] = m;
    // Usage = any `<Name` JSX occurrence anywhere in the file (import line excluded by pattern).
    const used = new RegExp(`<${name}[\\s/>]`).test(src);
    if (!used) dead.push({ file: fileLabel, component: name, importedFrom: from });
  }
  return dead;
}

// Is a component name reachable (rendered or routed) anywhere across sources?
function isComponentReferenced(name, sources) {
  const rx = new RegExp(`<${name}[\\s/>]`);
  return sources.some((s) => s && rx.test(s));
}

// ============================================================================
// MAIN
// ============================================================================
const appSrc = safeRead(SRC.app);
const smallSrc = safeRead(SRC.small);
const entSrc = safeRead(SRC.enterprise);

const publicRoutes = parsePublicRoutes(appSrc);
const adminTabs = parseTabSurface(appSrc, 'admin');
const smallTabs = parseTabSurface(smallSrc, 'small-portal');
const enterpriseTabs = parseTabSurface(entSrc, 'enterprise-portal');

const surfaces = [...publicRoutes, ...adminTabs, ...smallTabs, ...enterpriseTabs];

const deadImports = [
  ...findDeadImports(appSrc, 'src/App.tsx'),
  ...findDeadImports(smallSrc, 'src/components/B2B/SmallBusinessDashboard.tsx'),
  ...findDeadImports(entSrc, 'src/components/B2B/EnterpriseDashboard.tsx'),
];

// Expected-quarantined assertions -> warnings feed the separate dead-route gate.
const allSources = [appSrc, smallSrc, entSrc];
const warnings = [];
const quarantineAssertions = EXPECTED_QUARANTINED.map((name) => {
  const referenced = isComponentReferenced(name, allSources);
  if (referenced) {
    warnings.push(
      `DEAD-ROUTE GATE: expected-quarantined component "${name}" is REACHABLE (rendered/routed). It must not be wired in.`
    );
  }
  return { component: name, expected: 'quarantined', reachable: referenced, ok: !referenced };
});

const reachableCount = surfaces.filter((e) => e.reachable).length;
const quarantinedCount = surfaces.filter((e) => !e.reachable).length;

const map = {
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/route-capability-map.mjs',
  descriptive: true,
  repoRoot: REPO_ROOT,
  sources: {
    app: 'src/App.tsx',
    smallPortal: 'src/components/B2B/SmallBusinessDashboard.tsx',
    enterprisePortal: 'src/components/B2B/EnterpriseDashboard.tsx',
  },
  counts: {
    total: surfaces.length,
    reachable: reachableCount,
    quarantined: quarantinedCount,
    deadImports: deadImports.length,
    warnings: warnings.length,
  },
  surfaces,
  deadImports,
  quarantineAssertions,
  warnings,
};

// Write machine-readable map to repo root.
const outPath = join(REPO_ROOT, 'route-capability-map.json');
try {
  writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
} catch (err) {
  console.error(`[route-capability-map] WARN: could not write ${outPath}: ${err.message}`);
}

// Emit machine-readable JSON to stdout.
console.log(JSON.stringify(map, null, 2));

// --- human summary (stderr so stdout stays clean JSON) ----------------------
const bySurface = (s) => surfaces.filter((e) => e.surface === s);
const line = (e) =>
  `    [${e.reachable ? 'REACHABLE ' : 'QUARANTINE'}] ${e.route_or_tab} -> ${e.component || '(none)'}  (${e.reason})`;

const summary = [];
summary.push('');
summary.push('=== ROUTE-CAPABILITY MAP (human summary) ===');
summary.push(`  total=${surfaces.length}  reachable=${reachableCount}  quarantined=${quarantinedCount}  deadImports=${deadImports.length}  warnings=${warnings.length}`);
for (const s of ['public', 'admin', 'small-portal', 'enterprise-portal']) {
  const rows = bySurface(s);
  if (!rows.length) continue;
  summary.push(`  -- ${s} (${rows.filter((r) => r.reachable).length}/${rows.length} reachable) --`);
  rows.forEach((e) => summary.push(line(e)));
}
if (deadImports.length) {
  summary.push('  -- deadImports (imported, never rendered/routed) --');
  deadImports.forEach((d) => summary.push(`    ${d.component}  <- ${d.importedFrom}  [${d.file}]`));
} else {
  summary.push('  -- deadImports: none --');
}
summary.push('  -- expected-quarantined assertions --');
quarantineAssertions.forEach((q) =>
  summary.push(`    ${q.component}: reachable=${q.reachable} -> ${q.ok ? 'OK (not reachable)' : 'FAIL (reachable!)'}`)
);
if (warnings.length) {
  summary.push('  !! WARNINGS (fed to dead-route gate) !!');
  warnings.forEach((w) => summary.push(`    ${w}`));
}
summary.push('============================================');
console.error(summary.join('\n'));

// Descriptive tool: always exit 0 (a separate gate enforces on `warnings`).
process.exit(0);
