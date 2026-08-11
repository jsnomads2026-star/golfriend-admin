// ==========================================
// FILE: src/auth/roleJourney.js  (ESM — imported by App.tsx AND by the executable
// cross-role journey matrix in scripts/, so the SAME derivation is verified.)
// Server-owned portal access derivation. Access is derived ONLY from the
// server-owned role documents (admin_users / b2b_partners) — never from a
// client-known email, God-Mode literal, local bypass or fallback identity.
// ==========================================

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
    // Admin access is derived ONLY from a server-owned admin_users doc.
    if (!adminDoc) return { state: 'unauthorized', surface: 'admin' };
    if (adminDoc.status === 'Suspended') return { state: 'suspended', surface: 'admin' };
    if (!adminDoc.role) return { state: 'unauthorized', surface: 'admin' };
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
