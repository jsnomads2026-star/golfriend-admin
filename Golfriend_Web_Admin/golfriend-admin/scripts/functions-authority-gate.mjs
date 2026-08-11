// ==========================================
// FILE: scripts/functions-authority-gate.mjs  (run: `npm run gate:fnauth`)
// Fail-closed security gate: `syncCoursesFromProvider` must authorize ONLY via
// the server-owned admin_users staff authority (isActiveStaff) and must NEVER
// reintroduce an email/God-Mode break-glass. Also asserts the pure authority
// core stays fail-closed. Exit 1 on any violation.
// ==========================================
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const idx = readFileSync(ROOT + 'functions/src/index.ts', 'utf8');
const auth = readFileSync(ROOT + 'functions/src/authority.ts', 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const fails = [];
const ok = (n) => console.log(`  ✓ ${n}`);
const must = (cond, n) => { if (cond) ok(n); else { fails.push(n); console.error(`  ✗ ${n}`); } };

// Extract the syncCoursesFromProvider function body (to the next top-level export).
const start = idx.indexOf('export const syncCoursesFromProvider');
must(start >= 0, 'syncCoursesFromProvider is present');
let body = '';
if (start >= 0) {
  const rest = idx.slice(start + 1);
  const nextExport = rest.indexOf('\nexport const ');
  body = stripComments(rest.slice(0, nextExport >= 0 ? nextExport : rest.length));
}

// 1. NO email God-Mode / break-glass anywhere in the function (code, not comments).
must(!/admin@golfriend\.co/.test(body), 'syncCoursesFromProvider: no admin@golfriend.co break-glass literal');
must(!/callerEmail\s*===/.test(body) && !/token\?\.email/.test(body), 'syncCoursesFromProvider: no email-based authorization');
// 2. Uses the server-owned staff authority derived from admin_users.
must(/admin_users/.test(body), "syncCoursesFromProvider: reads admin_users");
must(/isActiveStaff\s*\(/.test(body), 'syncCoursesFromProvider: authorizes via isActiveStaff (server-owned)');
// 3. No env / hard-coded identity bypass.
must(!/process\.env\./.test(body), 'syncCoursesFromProvider: no process.env bypass');

// 4. The pure authority core stays fail-closed and email-free.
const a = stripComments(auth);
must(!/admin@golfriend\.co/.test(a) && !/email/i.test(a), 'authority.ts: no email/identity concept');
must(/status === 'Suspended'[\s\S]*return false/.test(a) || /Suspended'\) return false/.test(a), 'authority.ts: suspended → deny');
must(/role[\s\S]{0,80}return false/.test(a), 'authority.ts: role-less → deny');
must(/!adminDoc[\s\S]{0,40}return false/.test(a), 'authority.ts: missing doc → deny');

if (fails.length) {
  console.error(`\n❌ functions-authority gate FAILED (${fails.length}) — an email God-Mode / bypass was (re)introduced. Authorize via server-owned admin_users staff only.`);
  process.exit(1);
}
console.log('\n✅ functions-authority gate passed: syncCoursesFromProvider authorizes via server-owned active staff only; no email God-Mode / env bypass; authority core fail-closed.');
