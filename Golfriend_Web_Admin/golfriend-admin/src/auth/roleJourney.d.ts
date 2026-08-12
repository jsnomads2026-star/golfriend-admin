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

export const STATE_COPY: Record<string, { title: string; tone: 'info' | 'error' }>;
