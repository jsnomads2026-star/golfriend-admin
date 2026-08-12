# Portal Auth Journey — State × Portal Matrix

This document is the human-readable companion to the executable check
`scripts/role-journey-verify.mjs`. Both import the **same** server-owned
derivation from `src/auth/roleJourney.js` (`resolvePortalAccess`,
`JOURNEY_STATES`, `STATE_COPY`), so this matrix cannot drift from the code
without the verifier failing (exit 1).

## Derivation guarantees (read first)

- **Access is derived ONLY from server-owned role documents** — `admin_users/{uid}`
  for the Admin portal and `b2b_partners/{…}` for the partner portals. No client
  input decides access.
- **No email / God-Mode / local bypass.** `resolvePortalAccess` takes **no** email
  or God-Mode literal input. A user whose email would match a God-Mode literal but
  who has **no** `admin_users` doc resolves to `unauthorized`. The server doc — not
  the identity string — is the sole source of truth.
- **TV display requires an authorized admin session.** The TV/kiosk surface is only
  reachable once the Admin portal has reached the `authorized` state via a valid
  `admin_users` doc; there is no unauthenticated TV path.
- **Bounded session.** Sessions sign out after 30 minutes of inactivity, returning
  the portal to `signed_out` and forcing fresh server-owned re-derivation.
- **Zero-V1 under v2-preview.** Auth resolves under injected V2 identities only
  (`resolveFirebaseTarget('v2-preview', env)`); it never falls back to
  `golfriend-v1` and fails closed when unconfigured.

## Journey states (order of evaluation)

`auth_pending → signed_out → error → role_resolving → unauthorized → suspended → authorized`

The first four are evaluated before any role doc is read and are therefore
mode-agnostic (identical across all three portals). The last three are derived
from the portal's server-owned role doc.

## Matrix — 7 states (rows) × 3 portals (columns)

| State | Admin (`admin_users/{uid}`) | Small-Business (`b2b_partners`) | Enterprise (`b2b_partners`) |
|---|---|---|---|
| **auth_pending** | Trigger: `authPending:true` (Firebase auth state unknown). Source: Firebase auth listener, no doc read yet. UI: "Establishing secure session…" (info). | Same trigger/source/UI. | Same trigger/source/UI. |
| **signed_out** | Trigger: `!user`/`!user.uid` (no authenticated user). Source: Firebase auth. UI: "Sign in required" (info). | Same. | Same. |
| **error** | Trigger: `resolveError:true` (role-doc read failed — network/permission). Source: doc-read failure. UI: honest retry — "We could not verify your access right now. Please retry." (error); no raw provider error shown. | Same. | Same. |
| **role_resolving** | Trigger: authenticated + `roleLoading:true`. Source: `admin_users/{uid}` fetch in flight. UI: "Verifying your access…" (info). | Source: `b2b_partners` fetch in flight. Same UI. | Source: `b2b_partners` fetch in flight. Same UI. |
| **unauthorized** | Trigger: authenticated but **no** `admin_users` doc, or doc has no `role`. Source: absence of `admin_users/{uid}.role`. UI: "This account is not authorized for this portal." (error). Surface: `admin`. | Trigger: **no** `b2b_partners` doc. Source: absence of partner doc. Same UI. Surface: `partner`. | Same as Small-Business (single partner resolution path). |
| **suspended** | Trigger: `admin_users/{uid}.status === 'Suspended'`. Source: `admin_users.status`. UI: "This account's access is currently suspended." (error). Surface: `admin`. | Trigger: `b2b_partners.status` present and `!== 'active_partner'` (e.g. `inactive`). Source: `b2b_partners.status`. Same UI. Surface: `partner`. | Same trigger/source/UI as Small-Business. |
| **authorized** | Trigger: `admin_users/{uid}.status === 'Active'` (not Suspended) **and** `role` present. Source: `admin_users.role`. UI: Admin console (+ TV display gated on this session). Surface: `admin`, `role` = the doc's role (e.g. `Director`). | Trigger: `b2b_partners.status === 'active_partner'` **and** tier is a small-business tier. Source: `b2b_partners.tier`. UI: Small-Business partner surface. Surface: `small`, role `small_business`. | Trigger: `b2b_partners.status === 'active_partner'` **and** tier ∈ {`enterprise`, `master_host`, `Product & Service Promotion`}. Source: `b2b_partners.tier`. UI: Enterprise partner surface. Surface: `enterprise`, role `enterprise`. |

## Surface derivation notes

- Admin `authorized` requires **both** a non-`Suspended` status **and** a non-empty
  `role`; a doc missing `role` falls back to `unauthorized` (never silently
  authorized).
- Partner `surface` is computed from `b2b_partners.tier`: enterprise if the tier is
  `enterprise` (case-insensitive), or exactly `master_host`, or exactly
  `Product & Service Promotion`; otherwise `small`.
- Every non-`authorized` state maps to honest, provider-error-free copy in
  `STATE_COPY` — raw Firebase/network errors are never surfaced to the user.
