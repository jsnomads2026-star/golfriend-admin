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
  partnerDoc?: { tier?: string; status?: string } | null;
}

export interface PortalAccess {
  state: JourneyState;
  surface?: 'admin' | 'small' | 'enterprise' | 'partner';
  role?: string;
}

export function resolvePortalAccess(input?: PortalAccessInput): PortalAccess;

export const ACTIVE_ADMIN_STATUSES: string[];
export const KNOWN_INACTIVE_ADMIN_STATUSES: string[];
export function normalizeStaffStatus(value: unknown): string | null;

/** The closed ADMIN role registry — the client twin of functions/src/authority.ts. */
export const ADMIN_ROLE_REGISTRY_VERSION: string;
export const CANONICAL_ADMIN_ROLES: string[];
export const OBSOLETE_ADMIN_ROLES: string[];
export function isCanonicalAdminRole(value: unknown): boolean;

/** Client twin of the server isActiveStaff. A rendering decision only. */
export function isActiveAdminDoc(adminDoc: { role?: string; status?: string } | null | undefined): boolean;
export function isActiveDirectorDoc(adminDoc: { role?: string; status?: string } | null | undefined): boolean;

export const STATE_COPY: Record<string, { title: string; tone: 'info' | 'error' }>;
