// ============================================================================
// Founder / Director access-path tests.
//
// Behavioural where the logic is pure (access derivation, calibration authority) and
// structural where the subject is wiring that cannot be executed headlessly (which route
// the Admin root resolves to, whether the sign-in form offers recovery). The structural
// assertions are deliberately narrow: each one names the exact thing that must not
// silently regress, not a fuzzy shape.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePortalAccess,
  adminAccessPresentation,
  ADMIN_NO_RECORD,
  ADMIN_RECORD_NOT_ACTIVE,
} from '../src/auth/roleJourney.js';
import {
  calibrationControlsAvailable,
  calibrationBlockedReason,
} from '../src/components/admin/v2/calibrationAuthority.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const appSource = read('src/App.tsx');
const calibrationSource = read('src/components/admin/v2/V2CalibrationControls.tsx');
const courseOperationsSource = read('src/components/admin/v2/V2CourseOperations.tsx');
const founderCopy = read('src/i18n/admin/founderAccess.ts');

const user = { uid: 'founder-uid' };
const director = { role: 'Director', status: 'Active' };

// ---------------------------------------------------------------- root routing

test('Admin root routes to the Admin surface, never a consumer or public landing', () => {
  assert.match(appSource, /<Route path="\/" element={<Dashboard mode="admin" \/>} \/>/);
  assert.match(appSource, /<Route path="\/admin" element={<Dashboard mode="admin" \/>} \/>/);
  // The catch-all must fall back to Admin, not to a storefront/applicant surface.
  assert.match(appSource, /<Route path="\*" element={<Navigate to="\/admin" replace \/>} \/>/);
  // The admin root must not be a redirect into the partner/storefront journeys.
  assert.doesNotMatch(appSource, /<Route path="\/" element={<Navigate to="\/(storefront|apply|portal)/);
});

// ------------------------------------------------------------- sign-in state

test('signed-out admin renders the Firebase sign-in form, not a privileged shell', () => {
  assert.equal(resolvePortalAccess({ mode: 'admin', user: null }).state, 'signed_out');
  assert.match(appSource, /signInWithEmailAndPassword/);
  assert.match(appSource, /id="admin_email"/);
  assert.match(appSource, /id="admin_password"/);
  // Authority is never derived from a client-known email or a hard-coded literal.
  assert.doesNotMatch(appSource, /God[_ ]?Mode/i);
  assert.doesNotMatch(appSource, /adminDoc\?\.email|user\?\.email\s*===/);
});

test('auth_pending and role_resolving are distinct from authorization', () => {
  assert.equal(resolvePortalAccess({ mode: 'admin', authPending: true }).state, 'auth_pending');
  assert.equal(
    resolvePortalAccess({ mode: 'admin', user, roleLoading: true }).state,
    'role_resolving',
  );
});

// -------------------------------------------------------------- recovery entry

test('sign-in offers Firebase password recovery that cannot enumerate accounts', () => {
  assert.match(appSource, /sendPasswordResetEmail/);
  assert.match(appSource, /handleRecovery/);
  assert.match(appSource, /forgotPassword/);
  // Both the success and the failure branch must set the SAME neutral notice, so a
  // caller cannot tell a registered address from an unregistered one.
  const handler = appSource.slice(
    appSource.indexOf('const handleRecovery'),
    appSource.indexOf('// ---- Server-owned access derivation'),
  );
  assert.equal((handler.match(/setRecoveryNotice\('sent'\)/g) || []).length, 2);
  assert.doesNotMatch(handler, /error|message|code/i);
});

test('every founder-access string exists in all eight canonical locales', () => {
  for (const locale of ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']) {
    assert.match(founderCopy, new RegExp(`\\n  ${locale}: {`), `missing locale ${locale}`);
  }
  for (const key of ['accessPendingTitle', 'accessPendingDetail', 'forgotPassword',
    'recoverySent', 'calibrationDirectorRequired', 'calibrationAttestationRequired', 'calibrationSixScope', 'calibrationArm', 'calibrationRun']) {
    assert.equal((founderCopy.match(new RegExp(`${key}:`, 'g')) || []).length, 8, `key ${key}`);
  }
});

// ------------------------------------------------------- unauthorized access

test('signed-in user with no admin record gets access_pending with zero privilege', () => {
  const access = resolvePortalAccess({ mode: 'admin', user, adminDoc: null });
  assert.equal(access.state, 'unauthorized');
  assert.equal(access.reason, ADMIN_NO_RECORD);
  assert.equal(adminAccessPresentation(access), 'access_pending');
  assert.notEqual(access.state, 'authorized');
  assert.equal(access.role, undefined);
  assert.match(appSource, /adminAccessPresentation\(access\) === 'access_pending'/);
});

test('a present but non-active or non-canonical record is denied and is NOT access_pending', () => {
  for (const adminDoc of [
    { role: 'Director', status: 'Pending' },
    { role: 'Director', status: 'suspended' },
    { role: 'Director' },
    { status: 'Active' },
    { role: 'Owner', status: 'Active' },
    { role: 'director', status: 'Active' },
  ]) {
    const access = resolvePortalAccess({ mode: 'admin', user, adminDoc });
    assert.notEqual(access.state, 'authorized', JSON.stringify(adminDoc));
    if (access.state === 'unauthorized') {
      assert.equal(access.reason, ADMIN_RECORD_NOT_ACTIVE, JSON.stringify(adminDoc));
      assert.equal(adminAccessPresentation(access), 'unauthorized');
    }
  }
});

test('access_pending is presentation only and never leaks onto another surface', () => {
  assert.equal(adminAccessPresentation({ state: 'authorized', surface: 'admin' }), null);
  assert.equal(adminAccessPresentation({ state: 'unauthorized', surface: 'partner' }), null);
  assert.equal(adminAccessPresentation(null), null);
});

// --------------------------------------------------- Director-authorized access

test('an active Director record authorizes the Admin surface', () => {
  const access = resolvePortalAccess({ mode: 'admin', user, adminDoc: director });
  assert.equal(access.state, 'authorized');
  assert.equal(access.surface, 'admin');
  assert.equal(access.role, 'Director');
});

// --------------------------------------- calibration controls: Director + App Check



const identity = (over = {}) => ({
  uid: 'founder-uid', role: 'Director', status: 'Active',
  scope: null, requestVersion: null, appCheck: true, online: true, ...over,
});

test('calibration controls require an active Director AND App Check AND online', () => {
  assert.equal(calibrationControlsAvailable(identity()), true);
  assert.equal(calibrationControlsAvailable(identity({ appCheck: null })), false);
  assert.equal(calibrationControlsAvailable(identity({ appCheck: false })), false);
  assert.equal(calibrationControlsAvailable(identity({ role: 'Manager' })), false);
  assert.equal(calibrationControlsAvailable(identity({ role: 'Support' })), false);
  assert.equal(calibrationControlsAvailable(identity({ status: 'Suspended' })), false);
  assert.equal(calibrationControlsAvailable(identity({ uid: null })), false);
  assert.equal(calibrationControlsAvailable(identity({ online: false })), false);
  assert.equal(calibrationControlsAvailable(null), false);
});

test('blocked reason is honest and specific', () => {
  assert.equal(calibrationBlockedReason(identity()), null);
  assert.equal(calibrationBlockedReason(identity({ online: false })), 'offline');
  assert.equal(calibrationBlockedReason(identity({ appCheck: false })), 'attestation');
  assert.equal(calibrationBlockedReason(identity({ role: 'Manager' })), 'director');
});

test('the calibration surface adds no calibration logic and no privilege fallback', () => {
  // It may only invoke the locked server arm/run callables; it must not reimplement
  // provider access or let an operator provide a target.
  assert.match(calibrationSource, /armGolfApiSixCourseCalibration/);
  assert.match(calibrationSource, /runGolfApiSixCourseCalibration/);
  assert.doesNotMatch(calibrationSource, /providerClubId|providerCourseId|searchQuery/);
  assert.doesNotMatch(calibrationSource, /golfapi\.io|GOLF_API_KEY|measuredProviderCost|providerRemaining/);
  // No default-allow: the gate must be evaluated before any control renders.
  assert.match(calibrationSource, /if \(blocked\) {/);
  assert.doesNotMatch(calibrationSource, /appCheck !== false/);
});

test('Courses mounts the one approved calibration surface', () => {
  assert.match(courseOperationsSource, /import V2CalibrationControls from '\.\/V2CalibrationControls';/);
  assert.match(courseOperationsSource, /<V2CalibrationControls \/>/);
});

test('the shell reports real attestation state rather than claiming one', () => {
  assert.match(appSource, /appCheck: APP_CHECK_ACTIVE/);
  assert.doesNotMatch(appSource, /appCheck: true/);
});
