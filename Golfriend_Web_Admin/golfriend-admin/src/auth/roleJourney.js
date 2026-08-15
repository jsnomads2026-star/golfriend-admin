// ==========================================
// FILE: src/auth/roleJourney.js  (ESM — imported by App.tsx AND by the executable
// cross-role journey matrix in scripts/, so the SAME derivation is verified.)
// Server-owned portal access derivation. Access is derived ONLY from the
// server-owned role documents (admin_users / b2b_partners) — never from a
// client-known email, God-Mode literal, local bypass or fallback identity.
// ==========================================

/**
 * Canonical ACTIVE admin statuses, normalized. Mirrors ACTIVE_STAFF_STATUSES in
 * functions/src/authority.ts; scripts/admin-authority-matrix-verify.mjs asserts the two
 * agree on every input, so a divergence is a gate failure rather than a support ticket.
 */
export const ACTIVE_ADMIN_STATUSES = ['active'];

/** Statuses known to mean "not authorized". Documentation and defence in depth only. */
export const KNOWN_INACTIVE_ADMIN_STATUSES = [
  'suspended', 'inactive', 'deactivated', 'revoked', 'expired',
  'disabled', 'deleted', 'removed', 'terminated', 'pending', 'unknown',
];

/**
 * Normalize a status for comparison: NFC, trimmed, lower-cased. Folds canonically
 * equivalent spellings only — a confusable such as a Cyrillic А is a different string and
 * stays rejected. Non-strings and blanks normalize to null, i.e. unknown.
 */
export function normalizeStaffStatus(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

/** Ordered journey states a portal can be in. */
export const JOURNEY_STATES = [
  'auth_pending',    // Firebase auth state not yet known
  'signed_out',      // no authenticated user
  'role_resolving',  // authenticated; server role doc still loading
  'error',           // role resolution failed (network/permission) — honest error UI
  'unauthorized',    // authenticated but no matching server role doc
  'suspended',       // authenticated + role doc present but access revoked
  'authorized',      // authenticated + authorized by a server-owned role doc
];

/**
 * Derive the portal access state.
 * @param {{
 *   mode: 'admin'|'partner',
 *   authPending?: boolean,
 *   user?: { uid?: string } | null,
 *   roleLoading?: boolean,
 *   resolveError?: boolean,
 *   adminDoc?: { role?: string, status?: string } | null,   // admin_users/{uid}
 *   partnerDoc?: { tier?: string, status?: string } | null,  // b2b_partners/{...}
 * }} input
 * @returns {{ state: string, surface?: 'admin'|'small'|'enterprise'|'partner', role?: string }}
 */
export function resolvePortalAccess(input = {}) {
  const { mode, authPending, user, roleLoading, resolveError, adminDoc, partnerDoc } = input;

  if (authPending) return { state: 'auth_pending' };
  if (!user || !user.uid) return { state: 'signed_out' };
  if (resolveError) return { state: 'error' };
  if (roleLoading) return { state: 'role_resolving' };

  if (mode === 'admin') {
    // Admin access is derived ONLY from a server-owned admin_users doc, and only from a
    // CANONICAL ACTIVE status — the same allowlist the server applies in
    // functions/src/authority.ts. These two must agree: if this branch authorized a status
    // the server denies, the portal would render an admin shell whose every action then
    // failed, which reads to the user as a broken product rather than as a denial.
    if (!adminDoc) return { state: 'unauthorized', surface: 'admin' };
    const status = normalizeStaffStatus(adminDoc.status);
    if (status !== null && KNOWN_INACTIVE_ADMIN_STATUSES.includes(status)) {
      return { state: 'suspended', surface: 'admin' };
    }
    // Anything not canonically active — missing, blank, malformed or simply unrecognized —
    // is unauthorized. It is NOT reported as 'suspended', because we do not know that.
    if (status === null || !ACTIVE_ADMIN_STATUSES.includes(status)) {
      return { state: 'unauthorized', surface: 'admin' };
    }
    if (!adminDoc.role || typeof adminDoc.role !== 'string' || adminDoc.role.trim() === '') {
      return { state: 'unauthorized', surface: 'admin' };
    }
    return { state: 'authorized', surface: 'admin', role: adminDoc.role };
  }

  // Partner portals derive from the server-owned b2b_partners doc.
  if (!partnerDoc) return { state: 'unauthorized', surface: 'partner' };
  const status = partnerDoc.status;
  if (status && status !== 'active_partner') return { state: 'suspended', surface: 'partner' };
  const tierRaw = partnerDoc.tier;
  const tier = String(tierRaw || '').toLowerCase();
  const isEnterprise =
    tier === 'enterprise' || tierRaw === 'master_host' || tierRaw === 'Product & Service Promotion';
  return {
    state: 'authorized',
    surface: isEnterprise ? 'enterprise' : 'small',
    role: isEnterprise ? 'enterprise' : 'small_business',
  };
}

/** Honest, provider-error-free copy for each non-authorized state (no raw errors). */
export const STATE_COPY = {
  auth_pending: { title: 'Establishing secure session…', tone: 'info' },
  signed_out: { title: 'Sign in required', tone: 'info' },
  role_resolving: { title: 'Verifying your access…', tone: 'info' },
  error: { title: 'We could not verify your access right now. Please retry.', tone: 'error' },
  unauthorized: { title: 'This account is not authorized for this portal.', tone: 'error' },
  suspended: { title: 'This account’s access is currently suspended.', tone: 'error' },
};
