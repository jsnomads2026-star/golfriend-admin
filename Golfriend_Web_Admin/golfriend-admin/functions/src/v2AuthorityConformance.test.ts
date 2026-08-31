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

const src = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
const activationSrc = readFileSync(resolve(process.cwd(), 'src/partnerActivationRuntime.ts'), 'utf8');
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
const RETAINED_STAFF = ['setManualCourseCoordinates'];
const RETAINED_DIRECTOR = ['applyModerationStrike'];

for (const name of RETAINED_STAFF) {
  check(`retained ${name}: authorizes via isActiveStaff, no God-Mode`, () => {
    const code = stripComments(bodyOf(name));
    assert.ok(/isActiveStaff\s*\(/.test(code), `${name} must call isActiveStaff`);
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
  });
}
check('adminResolveBooking: retained name is an active-staff-gated refusal with no booking writes', () => {
  const code = stripComments(bodyOf('adminResolveBooking'));
  assert.ok(/isActiveStaff\s*\(/.test(code), 'refusal must retain the staff gate');
  assert.ok(/adminBookingResolutionRefusal\s*\(/.test(code), 'refusal helper must be invoked');
  assert.ok(!/runTransaction|writeBatch|bookingRef|slotRef|stampBookingAudit|\.set\s*\(|\.update\s*\(|\.delete\s*\(/.test(code), 'refusal must contain no mutation path');
  assert.ok(!/db\.collection\(['"](?:bookings|tee_time_slots|booking_audit)['"]\)/.test(code), 'refusal must not access booking record collections');
  assert.ok(!/status\s*:\s*['"](?:confirmed|rejected|cancelled)['"]/.test(code), 'refusal must not restore booking status writes');
  assert.ok(!/['"]admin_(?:confirmed|rejected|cancelled)['"]/.test(code), 'refusal must not restore admin audit actions');
});
for (const name of RETAINED_DIRECTOR) {
  check(`retained ${name}: authorizes via isActiveDirector, no God-Mode`, () => {
    const code = stripComments(bodyOf(name));
    assert.ok(/isActiveDirector\s*\(/.test(code), `${name} must call isActiveDirector`);
    assert.ok(!/admin@golfriend\.co/.test(code), `${name} must not contain the God-Mode email`);
  });
}

// ---- EXCLUDED (quarantined): must be fail-closed, no authority, no financial ----
const QUARANTINED = ['syncCoursesFromProvider', 'resolveEscrow', 'adminOverrideUser', 'adminManagePartner', 'logPlatformExpense', 'resolvePhotoValidation', 'updateFulfillmentOrder', 'drawRaffleWinner', 'manageTournamentOps', 'checkInFlight'];
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
check('claimCourseOperator: App Check plus approved organization membership, no email lookup', () => {
  assert.ok(/export const claimCourseOperator=onCall\(\{enforceAppCheck:true\}/.test(activationSrc));
  assert.ok(/member\(caller\)/.test(activationSrc));
  assert.ok(/authorizedCourseIds/.test(activationSrc));
  assert.ok(!/callerEmail|candidateIds|admin@golfriend\.co/.test(activationSrc));
});
check('manageTeeTimeSlot: modular App Check plus organization membership', () => {
  const availability = readFileSync(resolve(process.cwd(), 'src/partnerAvailabilityRuntime.ts'), 'utf8');
  assert.ok(/enforceAppCheck:true/.test(availability));
  assert.ok(/membership\(caller\)/.test(availability));
  assert.ok(/course_operators/.test(availability));
  assert.ok(!/admin@golfriend\.co/.test(availability));
});
check('booking responses: modular App Check plus exact enterprise course grant', () => {
  const booking = readFileSync(resolve(process.cwd(), 'src/partnerBookingRuntime.ts'), 'utf8');
  assert.ok(/enforceAppCheck:\s*true/.test(booking));
  assert.ok(/resolveEnterpriseBookingCourseAuthority/.test(booking));
  assert.ok(/transactionBookingAuthority/.test(booking));
  assert.ok(/enterprise_authority_memberships/.test(booking));
  assert.ok(!/partner_identity_bindings|partner_memberships|partner_organizations/.test(booking));
  assert.ok(!/admin@golfriend\.co/.test(booking));
});
check('Enterprise staff authority: canonical runtime is server-owned and exact-scope', () => {
  const authority = readFileSync(resolve(process.cwd(), 'src/enterpriseAuthorityRuntime.ts'), 'utf8');
  assert.ok(/resolveEnterpriseCourseAuthority/.test(authority));
  assert.ok(/m\.organizationId!==organizationId/.test(authority));
  assert.ok(/m\.scope\.propertyId!==propertyId/.test(authority));
  assert.ok(/m\.scope\.courseId!==courseId/.test(authority));
  assert.ok(!/callerEmail|candidateIds|admin@golfriend\.co/.test(authority));
});
for (const name of ['cancelB2BContract', 'reportPlayerIncident']) {
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
