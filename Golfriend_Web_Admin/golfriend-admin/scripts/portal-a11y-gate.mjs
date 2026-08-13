#!/usr/bin/env node
// portal-a11y-gate.mjs
// FAIL-CLOSED source gate over the V2 portal auth journey in src/App.tsx.
// Scans the SOURCE TEXT of src/App.tsx (regex/string) for accessibility,
// loading/error, and no-bypass invariants. Exits 1 on ANY violation.
//
// Run:  node scripts/portal-a11y-gate.mjs
//
// -------------------------------------------------------------------------
// NEGATIVE SELF-TEST (how to prove this gate is genuinely fail-closed).
// Do NOT commit any of these mutations — they are only to prove the gate bites.
// Temporarily apply ONE of the following to src/App.tsx and re-run; the gate
// MUST print ✗ and exit 1 (echo $? / $LASTEXITCODE === 1):
//   * Remove `aria-busy` (or role="status"/role="alert"/aria-live) from the
//     state-screen block          -> check #1 fails.
//   * Delete `aria-label="Email"` / `aria-label="Password"`
//                                  -> check #2 fails.
//   * Delete the `getDoc(doc(db, 'admin_users'` read or resolvePortalAccess(
//                                  -> check #3 fails.
//   * Add `if (user.email !== 'admin@golfriend.co') return null;`
//                                  -> check #4 fails (client God-Mode literal).
//   * Change the TV guard to `if (isTvMode) return <TournamentTV />;`
//     (no access.state === 'authorized' nearby)
//                                  -> check #5 fails (unauthenticated bypass).
//   * Render `<p role="alert">{error.message}</p>` or set
//     `setAuthError(error.message)`
//                                  -> check #6 fails (raw provider error).
// Revert the mutation and the gate returns to all ✓ / exit 0.
// -------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = join(__dirname, '..', 'src', 'App.tsx');

let raw;
try {
  raw = readFileSync(TARGET, 'utf8');
} catch {
  console.error(`✗ FATAL: cannot read ${TARGET}`);
  process.exit(1);
}

// Comment-stripped copy for NEGATIVE scans, so a banned literal cannot hide in
// (nor be excused by) a comment. Removes /* */ block comments and // line
// comments. Positive scans use the raw source (real JSX/attributes).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // avoid eating URLs like http://
}
const stripped = stripComments(raw);

const results = [];
const record = (ok, label, detail = '') =>
  results.push({ ok, label, detail });

// ---------------------------------------------------------------------------
// POSITIVE checks (must be PRESENT in the raw source)
// ---------------------------------------------------------------------------

// 1. Accessible loading/status/error state screens.
{
  const hasStatus = /role\s*=\s*(['"`])status\1|role\s*=\s*\{\s*['"`]status['"`]/.test(raw)
    || /['"`]status['"`]/.test(raw) && /role=\{isError \? 'alert' : 'status'\}/.test(raw);
  const hasAlert = /['"`]alert['"`]/.test(raw) && /role=/.test(raw);
  const hasAriaLive = /aria-live/.test(raw);
  const hasAriaBusy = /aria-busy/.test(raw);
  const ok = hasStatus && hasAlert && hasAriaLive && hasAriaBusy;
  record(ok, 'State screens are accessible (role status+alert, aria-live, aria-busy)',
    ok ? '' : `status=${hasStatus} alert=${hasAlert} aria-live=${hasAriaLive} aria-busy=${hasAriaBusy}`);
}

// 2. Login form inputs are labelled.
{
  // Accept either a literal accessible name or the localized i18n binding
  // (t('email')/t('password')) — inputs must carry an aria-label either way.
  const email = /aria-label\s*=\s*(['"`])Email\1/.test(raw) || /aria-label\s*=\s*\{\s*t\(\s*['"`]email['"`]\s*\)\s*\}/.test(raw);
  const password = /aria-label\s*=\s*(['"`])Password\1/.test(raw) || /aria-label\s*=\s*\{\s*t\(\s*['"`]password['"`]\s*\)\s*\}/.test(raw);
  const formLabel = /<form[\s\S]{0,200}?aria-label/.test(raw);
  const ok = email && password && formLabel;
  record(ok, 'Login form is labelled (aria-label Email + Password + <form aria-label>)',
    ok ? '' : `email=${email} password=${password} form=${formLabel}`);
}

// 3. Access derived from the server-owned resolver + admin_users doc read.
{
  const resolver = /resolvePortalAccess\s*\(/.test(raw);
  const adminDoc = /getDoc\s*\(\s*doc\s*\(\s*db\s*,\s*(['"`])admin_users\1/.test(raw);
  const ok = resolver && adminDoc;
  record(ok, "Access derived from resolvePortalAccess( + getDoc(doc(db,'admin_users'",
    ok ? '' : `resolver=${resolver} admin_users=${adminDoc}`);
}

// ---------------------------------------------------------------------------
// NEGATIVE checks (must be ABSENT — comment-stripped source)
// ---------------------------------------------------------------------------

// 4. No client God-Mode / email-literal authorization gate.
{
  const godMode =
    /user\.email\s*!==\s*(['"`])admin@golfriend\.co\1/.test(stripped) ||
    /email\s*===\s*(['"`])admin@golfriend\.co\1/.test(stripped) ||
    /(['"`])admin@golfriend\.co\1/.test(stripped);
  const ok = !godMode;
  record(ok, "No client God-Mode/email auth literal ('admin@golfriend.co') in App.tsx",
    ok ? '' : 'Found admin@golfriend.co authorization literal in source');
}

// 5. No unauthenticated TV bypass. Any TournamentTV render must sit within a
//    few lines of an access.state === 'authorized' guard.
{
  // Direct bypass patterns: isTvMode returning TV with no authorized check on line.
  const rawBypass =
    /if\s*\(\s*isTvMode\s*\)\s*\{?\s*return\s*<TournamentTV/.test(stripped);

  // Every TournamentTV *render* (JSX <TournamentTV) must have an authorized
  // guard within 5 lines above it.
  const lines = stripped.split('\n');
  let guardedOk = true;
  const authGuard = /access\.state\s*===\s*(['"`])authorized\1/;
  for (let i = 0; i < lines.length; i++) {
    if (/<TournamentTV\b/.test(lines[i])) {
      const from = Math.max(0, i - 5);
      const window = lines.slice(from, i + 1).join('\n');
      if (!authGuard.test(window)) guardedOk = false;
    }
  }
  const ok = !rawBypass && guardedOk;
  record(ok, "No unauthenticated TV bypass (every <TournamentTV> guarded by access.state==='authorized')",
    ok ? '' : `rawBypass=${rawBypass} allGuarded=${guardedOk}`);
}

// 6. No raw provider error surfaced to the UI, and login catch sets static copy.
{
  // Raw error surfaced inside JSX expression: {error.message}, {err.message},
  // {e.message}, {error?.message}, {something.code}
  const jsxError =
    /\{[^{}]*\b(error|err|e)\??\.message[^{}]*\}/.test(stripped) ||
    /\{[^{}]*\b(error|err|e)\??\.code[^{}]*\}/.test(stripped);

  // Login catch must NOT do setAuthError(error.message) etc — must be static.
  const dynamicAuthError =
    /setAuthError\s*\(\s*(error|err|e)\??\.(message|code)/.test(stripped);

  const ok = !jsxError && !dynamicAuthError;
  record(ok, 'No raw provider error in UI (no {error.message}/.code JSX; setAuthError uses static copy)',
    ok ? '' : `jsxError=${jsxError} dynamicAuthError=${dynamicAuthError}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('\nPortal a11y / no-bypass source gate  (src/App.tsx)\n');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.ok ? '' : `\n      -> ${r.detail}`}`);
  if (!r.ok) failed++;
}
console.log('');
if (failed > 0) {
  console.error(`GATE FAILED: ${failed} violation(s).`);
  process.exit(1);
}
console.log('GATE PASSED: all checks green.');
process.exit(0);
