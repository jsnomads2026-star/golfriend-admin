export type JourneyState =
  | 'auth_pending'
  | 'signed_out'
  | 'role_resolving'
  | 'error'
  | 'unauthorized'
  | 'suspended'
  | 'authorized';

export const JOURNEY_STATES: JourneyState[];

export interface PortalAccessInput {
  mode: 'admin' | 'partner';
  authPending?: boolean;
  user?: { uid?: string } | null;
  roleLoading?: boolean;
  resolveError?: boolean;
  adminDoc?: { role?: string; status?: string } | null;
  partnerDoc?: { tier?: string; status?: string; organizationId?: string; disabled?: boolean; accessExpiresAt?: string | {toMillis(): number}; trialEndsAt?: string | {toMillis(): number} } | null;
  requestedOrganizationId?: string | null;
  nowMs?: number;
}

export interface PortalAccess {
  state: JourneyState;
  surface?: 'admin' | 'small' | 'enterprise' | 'partner';
  role?: string;
  organizationId?: string;
  /** Presentation-only denial reason. Never widens access. */
  reason?: string;
}

export function resolvePortalAccess(input?: PortalAccessInput): PortalAccess;

/** Presentation-only admin denial reasons. Both carry identical (zero) privilege. */
export const ADMIN_NO_RECORD: string;
export const ADMIN_RECORD_NOT_ACTIVE: string;

/**
 * 'access_pending' only for an authenticated user with no server-owned admin_users
 * record; 'unauthorized' for every other admin denial; null when not an admin denial.
 */
export function adminAccessPresentation(access?: PortalAccess | null): 'access_pending' | 'unauthorized' | null;

export const ACTIVE_ADMIN_STATUSES: string[];
export const KNOWN_INACTIVE_ADMIN_STATUSES: string[];
export function normalizeStaffStatus(value: unknown): string | null;

/** The closed ADMIN role registry — the client twin of functions/src/authority.ts. */
export const ADMIN_ROLE_REGISTRY_VERSION: string;
export const CANONICAL_ADMIN_ROLES: string[];
export const OBSOLETE_ADMIN_ROLES: string[];
export const CANONICAL_PARTNER_TIERS: string[];
export const ENTERPRISE_PARTNER_TIER_ALIASES: string[];
export function isCanonicalAdminRole(value: unknown): boolean;

/** Client twin of the server isActiveStaff. A rendering decision only. */
export function isActiveAdminDoc(adminDoc: { role?: string; status?: string } | null | undefined): boolean;
export function isActiveDirectorDoc(adminDoc: { role?: string; status?: string } | null | undefined): boolean;

export const STATE_COPY: Record<string, { title: string; tone: 'info' | 'error' }>;

/** Applicant zone — a third authority zone that can never yield Portal access. */
export interface ApplicantAccessInput {
  authPending?: boolean;
  user?: { uid?: string } | null;
  roleLoading?: boolean;
  resolveError?: boolean;
  applicationDoc?: { id?: string; applicantUid?: string; status?: string } | null;
  partnerDoc?: { status?: string; organizationId?: string; disabled?: boolean } | null;
  requestedApplicationId?: string | null;
  /** null means "not asserted" and fails closed, exactly like false. */
  identityVerified?: boolean | null;
}

export interface ApplicantAccess {
  state: string;
  /** Derived from the server-owned partner document, never from application status. */
  portalReady: boolean;
  applicationId?: string | null;
  applicationStatus?: string;
  reason?: string;
}

export const APPLICANT_STATES: string[];
export const NON_PORTAL_APPLICATION_STATUSES: string[];
export function resolveApplicantAccess(input?: ApplicantAccessInput): ApplicantAccess;
