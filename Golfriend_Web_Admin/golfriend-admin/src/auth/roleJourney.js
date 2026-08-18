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
 * The client twin of the ROLE REGISTRY in functions/src/authority.ts. Status was
 * already an allowlist here; the role was "any non-empty string", so an unrecognized
 * role rendered as ordinary staff on the very screens an operator uses to diagnose
 * access. scripts/admin-authority-matrix-verify.mjs asserts the two files agree.
 *
 * Derived from the code that writes the value: HRManagement offers 'Manager' and
 * 'Support'; 'Director' is the founding tier and is never hireable from the UI.
 */
export const ADMIN_ROLE_REGISTRY_VERSION = '2026-08-15.v1';

export const CANONICAL_ADMIN_ROLES = ['Director', 'Manager', 'Support'];

/** Retired roles that must now fail closed. Empty today; recorded, not implied. */
export const OBSOLETE_ADMIN_ROLES = [];
export const CANONICAL_PARTNER_TIERS = ['small_business', 'enterprise'];
export const ENTERPRISE_PARTNER_TIER_ALIASES = ['master_host', 'Product & Service Promotion'];

/** Exact membership. Never case-folded — folding a role widens authority. */
export function isCanonicalAdminRole(value) {
  return typeof value === 'string' && CANONICAL_ADMIN_ROLES.includes(value);
}

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

/**
 * Is this admin_users document an ACTIVE staff record? The client twin of
 * functions/src/authority.ts isActiveStaff. Client surfaces must call this rather than
 * comparing fields themselves — an inline check is how a suspended Director kept elevated
 * data access on the sponsor console long after the shared predicate existed.
 *
 * This is a rendering decision only. The server re-derives authority on every callable;
 * nothing here grants anything.
 */
export function isActiveAdminDoc(adminDoc) {
  if (!adminDoc || typeof adminDoc !== 'object' || Array.isArray(adminDoc)) return false;
  const status = normalizeStaffStatus(adminDoc.status);
  if (status === null || !ACTIVE_ADMIN_STATUSES.includes(status)) return false;
  if (typeof adminDoc.role !== 'string' || adminDoc.role.trim() === '') return false;
  if (OBSOLETE_ADMIN_ROLES.includes(adminDoc.role)) return false;
  return isCanonicalAdminRole(adminDoc.role);
}

/** Director tier. Exact role match, for the same reason the server uses one. */
export function isActiveDirectorDoc(adminDoc) {
  return isActiveAdminDoc(adminDoc) && adminDoc.role === 'Director';
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
  const {
    mode, authPending, user, roleLoading, resolveError, adminDoc, partnerDoc,
    requestedOrganizationId = null, nowMs = Date.now(),
  } = input;

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
    if (!isCanonicalAdminRole(adminDoc.role)) {
      return { state: 'unauthorized', surface: 'admin' };
    }
    return { state: 'authorized', surface: 'admin', role: adminDoc.role };
  }

  // Partner portals derive only from b2b_partners/{authenticated uid}.
  if (!partnerDoc) return { state: 'unauthorized', surface: 'partner' };
  if (partnerDoc.status !== 'active_partner' || partnerDoc.disabled === true) {
    return { state: 'suspended', surface: 'partner' };
  }
  const organizationId = typeof partnerDoc.organizationId === 'string'
    ? partnerDoc.organizationId.trim()
    : '';
  if (!organizationId) return { state: 'unauthorized', surface: 'partner' };
  if (requestedOrganizationId !== null && requestedOrganizationId !== organizationId) {
    return { state: 'unauthorized', surface: 'partner' };
  }
  const expiresAt = partnerDoc.accessExpiresAt ?? partnerDoc.trialEndsAt ?? null;
  if (expiresAt !== null) {
    const expiryMs = typeof expiresAt?.toMillis === 'function'
      ? expiresAt.toMillis()
      : Date.parse(String(expiresAt));
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      return { state: 'suspended', surface: 'partner' };
    }
  }
  const tierRaw = partnerDoc.tier;
  const tier = typeof tierRaw === 'string' ? tierRaw : '';
  const isEnterprise = tier === 'enterprise' || ENTERPRISE_PARTNER_TIER_ALIASES.includes(tier);
  const isSmallBusiness = tier === 'small_business';
  if (!isEnterprise && !isSmallBusiness) return { state: 'unauthorized', surface: 'partner' };
  return {
    state: 'authorized',
    surface: isEnterprise ? 'enterprise' : 'small',
    role: isEnterprise ? 'enterprise' : 'small_business',
    organizationId,
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

/**
 * Applicant zone (`/apply/*`).
 *
 * This is deliberately a THIRD authority zone, not a relaxation of the partner one. It never
 * yields Portal access: an applicant's own application — draft, submitted, information-needed,
 * pending or rejected — grants exactly the right to see and edit that application. Portal
 * authority comes only from the server-owned b2b_partners document written by the approval
 * transaction, which is why `portalReady` is derived from partnerDoc and never from
 * applicationDoc.
 */
export const APPLICANT_STATES = [
  'auth_pending', 'signed_out', 'verification_required', 'role_resolving', 'error',
  'ready', 'submitted', 'information_needed', 'rejected', 'suspended', 'approved',
];

/** Application statuses that are emphatically NOT Portal authority. */
export const NON_PORTAL_APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'info_needed', 'rejected', 'suspended'];

export function resolveApplicantAccess(input = {}) {
  const {
    authPending, user, roleLoading, resolveError,
    applicationDoc = null, partnerDoc = null, requestedApplicationId = null,
    identityVerified = null,
  } = input;

  if (authPending) return { state: 'auth_pending', portalReady: false };
  if (!user || !user.uid) return { state: 'signed_out', portalReady: false };
  if (resolveError) return { state: 'error', portalReady: false };
  if (roleLoading) return { state: 'role_resolving', portalReady: false };

  // Reading the explanation is public; saving or submitting requires verified identity.
  // `identityVerified === null` means the caller did not assert either way — fail closed.
  if (identityVerified !== true) return { state: 'verification_required', portalReady: false };

  // Portal readiness is a SERVER fact: an active partner document with an organization.
  const portalReady =
    partnerDoc?.status === 'active_partner' &&
    partnerDoc?.disabled !== true &&
    typeof partnerDoc?.organizationId === 'string' &&
    partnerDoc.organizationId.trim() !== '';

  if (!applicationDoc) return { state: portalReady ? 'approved' : 'ready', portalReady, applicationId: null };

  // An applicant may only ever address its own application.
  const ownerUid = applicationDoc.applicantUid;
  if (typeof ownerUid === 'string' && ownerUid !== user.uid) {
    return { state: 'error', portalReady: false, reason: 'cross_applicant_denied' };
  }
  const applicationId = typeof applicationDoc.id === 'string' ? applicationDoc.id : null;
  if (requestedApplicationId !== null && applicationId !== null && requestedApplicationId !== applicationId) {
    return { state: 'error', portalReady: false, reason: 'cross_applicant_denied' };
  }

  const status = String(applicationDoc.status || 'draft');
  const byStatus = {
    draft: 'ready', submitted: 'submitted', under_review: 'submitted',
    info_needed: 'information_needed', rejected: 'rejected', suspended: 'suspended',
    approved: portalReady ? 'approved' : 'submitted',
  };
  return {
    state: byStatus[status] || 'ready',
    // An approved application whose activation transaction has not yet written the partner
    // document is NOT Portal-ready. Approval alone is not entry.
    portalReady: status === 'approved' ? portalReady : false,
    applicationId,
    applicationStatus: status,
  };
}
