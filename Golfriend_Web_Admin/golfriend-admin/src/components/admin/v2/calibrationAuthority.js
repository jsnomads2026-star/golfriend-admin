// ============================================================================
// The authority predicate for the Golf API calibration controls.
//
// Plain ESM on purpose: the component imports it AND scripts/admin-founder-access.test.mjs
// imports the SAME module, so the tests exercise the shipped predicate rather than a copy
// of it. A fixture that re-implemented this would pass while the surface regressed.
//
// This is a presentation gate. The server enforces the same authority independently on
// every call (enforceAppCheck + the director() predicate + verifyCalibrationActivation);
// nothing here is load-bearing for security, and nothing here may widen access.
// ============================================================================

/** Exact canonical role permitted to operate calibration. Never case-folded. */
export const CALIBRATION_ROLE = 'Director';

/**
 * All three conditions must hold: an active Director record derived from the
 * server-owned admin_users document, a real App Check attestation in this build, and an
 * online browser so authority can still be revalidated. `appCheck` must be exactly
 * `true` — `null` (unknown) fails closed just like `false`.
 */
export function calibrationControlsAvailable(identity) {
  if (!identity) return false;
  if (typeof identity.uid !== 'string' || identity.uid.trim() === '') return false;
  if (identity.role !== CALIBRATION_ROLE) return false;
  if (typeof identity.status !== 'string' || identity.status.trim().toLowerCase() !== 'active') return false;
  if (identity.appCheck !== true) return false;
  if (identity.online === false) return false;
  return true;
}

/** Why the controls are withheld, for honest operator copy. Never widens access. */
export function calibrationBlockedReason(identity) {
  if (calibrationControlsAvailable(identity)) return null;
  if (identity && identity.online === false) return 'offline';
  if (!identity || identity.appCheck !== true) return 'attestation';
  return 'director';
}
