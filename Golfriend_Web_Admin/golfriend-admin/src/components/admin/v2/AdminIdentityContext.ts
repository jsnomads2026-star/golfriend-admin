// ============================================================================
// The governing admin authority, supplied once by App.tsx and consumed by any V2 surface
// that caches server-scoped content.
//
// This exists because a surface cannot decide for itself whether its cached data is still
// authorized. Only the shell knows that the user signed out, that the admin_users document
// now says Suspended, or that the browser went offline. Without it, a surface holds
// whatever it last fetched until something else forces a re-render — which is a disclosure
// when the content was scoped to an identity that no longer holds.
//
// The default is the ANONYMOUS identity, not a permissive one: a surface rendered outside
// the provider disposes its cache rather than trusting it.
// ============================================================================
import { createContext } from 'react';

export interface AdminIdentity {
  uid: string | null;
  role: string | null;
  status: string | null;
  /** Organization / course scope, when a surface is scoped to one. */
  scope: string | null;
  /** Server request/contract version, when the transport reports one. */
  requestVersion: string | number | null;
  /**
   * Verified App Check state. `null` means UNKNOWN — which is the honest value here,
   * because App Check is not provisioned in this repository. It is deliberately not
   * reported as `true`, which would claim an attestation that does not exist.
   */
  appCheck: boolean | null;
  /** Whether the browser believes it is online. Offline means authority cannot be revalidated. */
  online: boolean | null;
}

export const ANONYMOUS_IDENTITY: AdminIdentity = {
  uid: null, role: null, status: null, scope: null,
  requestVersion: null, appCheck: null, online: null,
};

export const AdminIdentityContext = createContext<AdminIdentity>(ANONYMOUS_IDENTITY);
