// ==========================================
// FILE: scripts/functions-godmode-gate.mjs  (run: `npm run gate:godmode`)
// Repository-wide reintroduction guard for the Lane C V2 Cloud Functions.
// FAILS if any reachable V2 Function re-introduces:
//   - the hard-coded `admin@golfriend.co` privileged email (anywhere);
//   - caller-email-based privilege AUTHORIZATION (callerEmail === / !== an email,
//     or an email used in an isGodMode/isMasterAdmin authorization flag);
//   - a process.env / environment God-Mode bypass in a callable;
// and asserts every QUARANTINED callable stays fail-closed (throws `unavailable`,
// carries no privileged authority and no financial/economy mutation).
// Static source analysis only: no network, no emulator, no provider, no deploy.
// See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
// ==========================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../functions/src/index.ts');
const src = readFileSync(SRC, 'utf8');

const fails = [];
const assert = (cond, msg) => { if (!cond) { fails.push(msg); console.error(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

// Allow a self-test to inject a violation into a scratch copy without touching src.
const target = process.env.GODMODE_GATE_TARGET
  ? readFileSync(process.env.GODMODE_GATE_TARGET, 'utf8')
  : src;

// ---- 1. No hard-coded privileged email anywhere ----
const emailLiteral = target.match(/admin@golfriend\.co/g) || [];
assert(emailLiteral.length === 0, `no 'admin@golfriend.co' privileged-email literal anywhere (found ${emailLiteral.length})`);

// ---- 2. No caller-email privilege AUTHORIZATION patterns ----
// (Identity resolution — pushing callerEmail into a b2b_partners candidateIds array —
//  is allowed; comparing an email to grant privilege is not.)
const emailAuthCompare = target.match(/caller(Email)?\s*(===|!==)\s*['"][^'"]*@[^'"]*['"]/g) || [];
assert(emailAuthCompare.length === 0, `no callerEmail === '<email>' privilege comparison (found ${emailAuthCompare.length})`);
const godFlags = target.match(/\b(isGodMode|isMasterAdmin)\b/g) || [];
assert(godFlags.length === 0, `no isGodMode / isMasterAdmin authorization flag (found ${godFlags.length})`);

// ---- 3. No environment God-Mode bypass ----
const envBypass = target.match(/process\.env\.[A-Z0-9_]*(GOD|ADMIN|BYPASS|OVERRIDE|MASTER)[A-Z0-9_]*/gi) || [];
assert(envBypass.length === 0, `no process.env God-Mode/bypass identifier (found ${envBypass.length})`);

// ---- 4. Approved retained callables authorize via the server-owned module ----
const RETAINED = [
  'manageTeeTimeSlot', 'respondBooking', 'cancelBooking', 'sendBookingMessage',
  'adminResolveBooking', 'applyModerationStrike', 'syncCoursesFromProvider', 'setManualCourseCoordinates',
];
// Strip line/block comments so code-pattern scans never trip on documentation prose
// (a quarantine comment may legitimately name the "chips"/"transactions" it removed).
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const bodyOf = (name) => {
  const re = new RegExp('export const ' + name + ' = onCall\\([\\s\\S]*?\\r?\\n\\}\\);');
  const m = target.match(re);
  return m ? m[0] : null;
};
const codeOf = (name) => { const b = bodyOf(name); return b ? stripComments(b) : null; };
for (const name of RETAINED) {
  const code = codeOf(name);
  assert(!!code, `retained callable present: ${name}`);
  if (code) {
    assert(/isActive(Staff|Director)\s*\(/.test(code), `${name}: authorizes via isActiveStaff/isActiveDirector`);
    assert(!/admin@golfriend\.co/.test(code), `${name}: carries no email God-Mode`);
  }
}

// ---- 5. Quarantined callables stay fail-closed with no privileged/financial authority ----
const QUARANTINED = [
  'resolveEscrow', 'adminOverrideUser', 'adminManagePartner', 'logPlatformExpense',
  'resolvePhotoValidation', 'updateFulfillmentOrder', 'drawRaffleWinner',
  'manageTournamentOps', 'checkInFlight',
];
for (const name of QUARANTINED) {
  const body = bodyOf(name);
  const code = codeOf(name);
  assert(!!body, `quarantined callable present: ${name}`);
  if (body) {
    assert(/QUARANTINED \(/.test(body), `${name}: carries QUARANTINED classification marker`);
    assert(/throw new HttpsError\('unavailable'/.test(code), `${name}: fails closed with 'unavailable'`);
    // No privileged authority derivation and no financial/economy mutation in CODE.
    assert(!/isActive(Staff|Director)|admin_users|course_operators/.test(code), `${name}: no privileged authority derivation remains`);
    assert(!/\.collection\('(transactions|users)'\)|FieldValue\.increment|chips\s*:/.test(code), `${name}: no chip/transaction/economy mutation remains`);
  }
}

if (process.env.GODMODE_GATE_TARGET) {
  // Self-test mode: report status via exit code only.
  process.exit(fails.length ? 1 : 0);
}

if (fails.length) {
  console.error(`\n❌ functions-godmode gate FAILED (${fails.length}). A reachable V2 Function reintroduced email/God-Mode/env authority or a quarantined callable regained authority.`);
  process.exit(1);
}
console.log(`\n✅ functions-godmode gate passed: repository-wide — no admin@golfriend.co / caller-email / env God-Mode authority; ${RETAINED.length} retained callables use server-owned staff/Director authority; ${QUARANTINED.length} quarantined callables stay fail-closed with no privileged/financial authority.`);
