// ==========================================
// FILE: functions/src/v2AuthorityConformance.test.ts
// Per-callable positive/negative authorization conformance for the Lane C V2
// break-glass removal (issue #19). For every RETAINED callable: asserts it
// authorizes via the server-owned admin_users module (isActiveStaff/isActiveDirector)
// and carries no email/God-Mode. For every EXCLUDED (quarantined) callable: asserts
// it is fail-closed with no privileged authority and no financial mutation.
// Static source conformance (no emulator/provider). Run: `npm run test:v2authority`.
// See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
// ==========================================
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const bodyOf = (name: string): string => {
  const m = src.match(new RegExp('export const ' + name + ' = onCall\\([\\s\\S]*?\\r?\\n\\}\\);'));
  assert.ok(m, `callable ${name} must exist`);
  return m![0];
};

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

// ---- Global negatives (repository-wide) ----
check('no admin@golfriend.co privileged email anywhere', () => {
  assert.equal((src.match(/admin@golfriend\.co/g) || []).length, 0);
});
check('no isGodMode / isMasterAdmin authorization flag anywhere', () => {
  assert.equal((src.match(/\b(isGodMode|isMasterAdmin)\b/g) || []).length, 0);
});
check('no caller-email privilege comparison anywhere', () => {
  assert.equal((src.match(/caller(Email)?\s*(===|!==)\s*['"][^'"]*@[^'"]*['"]/g) || []).length, 0);
});
check('no process.env God-Mode/bypass identifier anywhere', () => {
  assert.equal((src.match(/process\.env\.[A-Z0-9_]*(GOD|ADMIN|BYPASS|OVERRIDE|MASTER)[A-Z0-9_]*/gi) || []).length, 0);
});

// ---- RETAINED (approved V2): must authorize via server-owned module ----
const RETAINED_STAFF = ['manageTeeTimeSlot', 'respondBooking', 'cancelBooking', 'sendBookingMessage', 'adminResolveBooking', 'syncCoursesFromProvider', 'setManualCourseCoordinates'];
const RETAINED_DIRECTOR = ['applyModerationStrike'];

for (const name of RETAINED_STAFF) {
  check(`retained ${name}: authorizes via isActiveStaff, no God-Mode`, () => {
    const code = stripComments(bodyOf(name));
    assert.ok(/isActiveStaff\s*\(/.test(code), `${name} must call isActiveStaff`);
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
  });
}
for (const name of RETAINED_DIRECTOR) {
  check(`retained ${name}: authorizes via isActiveDirector, no God-Mode`, () => {
    const code = stripComments(bodyOf(name));
    assert.ok(/isActiveDirector\s*\(/.test(code), `${name} must call isActiveDirector`);
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
  });
}

// ---- EXCLUDED (quarantined): must be fail-closed, no authority, no financial ----
const QUARANTINED = ['resolveEscrow', 'adminOverrideUser', 'adminManagePartner', 'logPlatformExpense', 'resolvePhotoValidation', 'updateFulfillmentOrder', 'drawRaffleWinner', 'manageTournamentOps', 'checkInFlight'];
for (const name of QUARANTINED) {
  check(`quarantined ${name}: fail-closed, no privileged/financial authority`, () => {
    const body = bodyOf(name);
    const code = stripComments(body);
    assert.ok(/QUARANTINED \(/.test(body), `${name} must carry the QUARANTINED marker`);
    assert.ok(/throw new HttpsError\('unavailable'/.test(code), `${name} must fail closed with 'unavailable'`);
    assert.ok(!/isActiveStaff|isActiveDirector|admin_users|course_operators/.test(code), `${name} must derive no privileged authority`);
    assert.ok(!/\.collection\('(transactions|users)'\)|FieldValue\.increment|chips\s*:/.test(code), `${name} must perform no chip/transaction/economy mutation`);
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
  });
}

// ---- Identity-resolution callables retain email ONLY for own-doc lookup ----
for (const name of ['claimCourseOperator', 'manageEnterpriseStaff', 'cancelB2BContract', 'reportPlayerIncident']) {
  check(`identity-resolution ${name}: email used for candidateIds only, no God-Mode`, () => {
    const code = stripComments(bodyOf(name));
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
    // Any email use here must feed the caller's own b2b_partners candidate id set.
    if (/callerEmail|reporterEmail/.test(code)) {
      assert.ok(/candidateIds/.test(code), `${name} email use must be candidateIds identity resolution`);
    }
  });
}

console.log(`\nv2AuthorityConformance: ${passed} checks passed.`);
