# Pre-Commissioning: Seed Order, Portal Smoke Checklist & Course-Sync Dry-Run Evidence

Branch `feat/laneC-consolidated` · Scope: Lane C (Admin/Portal SPA + `functions/`).

**Purpose.** Bring a fresh (blank/V2) Firebase project from "deployed but empty" to
"operable and verified" — *without* the legacy email God-Mode. Admin authorization is
now **server-owned**: access is derived only from `admin_users/{uid}` and
`b2b_partners/{...}` role docs (see `src/auth/roleJourney.js`, `AUTHORITY_MANIFEST.md`).
This document is **names and steps only** — it carries **no** secret values, project ids,
API keys, coordinates, or provider actions. It orders the operator work; it does not perform it.

Companion references: `docs/BLANK_PROJECT_MANIFEST.md` (§6 seed order, §5 roles),
`docs/COURSE_OPS_COMMISSIONING.md` (dry-run classifications), `AUTHORITY_MANIFEST.md`
(collection → owning callable → role gate).

---

## 1. Seed order (first-Director / admin / operator)

Ordered steps to make a fresh project operable. Each step names the **callable or
collection** and the **role required**. No data values are given here — only the sequence.

| # | Step | Callable / Collection | Role required | Notes |
|---|------|-----------------------|---------------|-------|
| 0 | **Bootstrap the first Director** — write the initial `admin_users/{uid}` doc with `role: Director`, `status: Active` | `admin_users/{uid}` (direct write) | **Out-of-band** (Admin SDK / Firebase console) | See bootstrap caveat below. This is the *only* step not performed through a callable. |
| 1 | Director invites platform staff (Manager / Support) | `inviteEmployee` → writes `admin_users/{uid}` | **Director** | Creates the Auth account + role doc for each further admin. |
| 2 | Seed course inventory | Admin **Course Sync / Core Seeder** (`CourseSeeder`, `CourseSyncConsole`) → `courses` | Platform staff (admin session) | Course docs are content; GPS coords are non-authoritative. |
| 3 | Partner onboards their course | `claimCourseOperator` → writes `course_operators` | Active `b2b_partners` (`status: active_partner`) claiming their own course | Establishes `course_operators.operatorUid` authority. |
| 4 | Operator publishes tee-time availability | `manageTeeTimeSlot` → writes `tee_time_slots` | Platform staff **or** the claimed course operator | **Non-financial** — slots carry capacity/`bookedCount`/status, **no price**. |
| 5 | Players request bookings; operators respond | `requestBooking`, `respondBooking`, `cancelBooking`, `adminResolveBooking` → `bookings` (+ `booking_audit`) | Player requests; operator/staff confirm/reject/cancel; Director-tier resolves disputes | Statuses exactly `pending\|confirmed\|rejected\|cancelled`. No refund/hold/price fields. |
| 6 | Booking messaging + audit | `sendBookingMessage` → `bookings/{id}/messages`; `stampBookingAudit` → `booking_audit` (append-only) | Booking participants (server-gated) | Communicative only; audit immutable + non-financial. |

Downstream surfaces (tournaments, campaigns, fulfillment, treasury sweeps) light up once
this spine exists; no additional seeding is required to boot (see `BLANK_PROJECT_MANIFEST.md` §6).

### Bootstrap caveat (first Director)

`inviteEmployee` is itself **Director-gated** — the callable rejects any caller whose
`admin_users/{uid}` doc is missing or not `role: Director` (`functions/src/index.ts`,
"MASTER GATE"). On a blank project **no such doc exists yet**, so there is a chicken-and-egg
bootstrap: no callable can mint the first Director. The first Director **must** therefore be
written **out-of-band** — via the Firebase Admin SDK or the Firestore console — directly to
`admin_users/{uid}` with `role: Director`, `status: Active`, keyed by that person's Auth
`uid`. This is a deliberate one-time privileged action; there is intentionally no email
God-Mode fallback in the client. Every subsequent admin is created through `inviteEmployee`.

> Sync-console note: `syncCoursesFromProvider` still contains a legacy
> `callerEmail === 'admin@golfriend.co'` God-Mode branch alongside its platform-staff gate.
> Once step 0/1 seed real staff, that branch is dead for normal operation; flagged for
> follow-up, not changed here.

---

## 2. Portal smoke checklist (manual, post-seed)

Manual control — **`autoApproval: false`**. Run this by hand after seeding, once per portal.
State names below are the `JOURNEY_STATES` from `src/auth/roleJourney.js`; the derivation is
`resolvePortalAccess(...)` and the on-screen copy is `STATE_COPY`.

**Journey states to walk:** `auth_pending` → `signed_out` → (`role_resolving`) →
`authorized` | `unauthorized` | `suspended` | `error`.

For each portal, verify: the **correct state screen** renders, **no raw provider error** is
ever surfaced (only the honest `STATE_COPY` text), and the state matches the seeded role doc.

### Admin portal (`/admin`, `mode="admin"` — derives from `admin_users/{uid}`)
- [ ] Signed-out: `signed_out` → the "GOLFRIEND ADMIN SIGN-IN" login form is shown.
- [ ] During sign-in: `auth_pending` then `role_resolving` → "Establishing secure session…" / "Verifying your access…".
- [ ] Seeded Director/staff: `authorized` (surface `admin`) → admin dashboard renders.
- [ ] Authenticated with **no** `admin_users` doc: `unauthorized` → honest copy + Sign-out button; **no** dashboard.
- [ ] Doc with `status: Suspended`: `suspended` → honest copy + Sign-out; **no** dashboard.
- [ ] Forced role-read failure (network/permission): `error` → "could not verify… please retry", **never** a raw provider error string.
- [ ] `?tv=true`: TournamentTV opens **only** when `authorized` + surface `admin`; signed-out/unauthorized/suspended fall through to the normal state screen (**no unauthenticated bypass**).
- [ ] Idle session: after the bounded inactivity window (`SESSION_IDLE_MS`) the session auto signs-out (defence-in-depth).

### Small-Business portal (`/partner`, `mode="partner"` — `b2b_partners`, tier `small_business`)
- [ ] Signed-out: `partner` redirects to `/storefront` (public).
- [ ] Seeded `active_partner` + tier `small_business`: `authorized` (surface `small`) → `SmallBusinessDashboard`.
- [ ] Partner doc `status` not `active_partner`: `suspended` → honest copy + "Return to Storefront".
- [ ] Authenticated, no `b2b_partners` doc (after retry buffer): `unauthorized`.
- [ ] Role-read failure: `error` (honest), no raw provider error.
- [ ] Idle auto sign-out applies.

### Enterprise portal (`/partner`, `mode="partner"` — `b2b_partners`, tier `enterprise`/`master_host`)
- [ ] Seeded `active_partner` + enterprise-class tier: `authorized` (surface `enterprise`) → `EnterpriseDashboard`.
- [ ] Suspended / unauthorized / error states behave as the Small-Business list above.
- [ ] Idle auto sign-out applies.

### Public arena (no auth — `/`, `/storefront`, `/discover`, `/legal`, `/support`)
- [ ] Public routes render without any auth gate; unknown paths redirect to `/`.
- [ ] No admin/partner data leaks onto public screens; reads-only posture holds.

### Non-financial booking journey (walk end-to-end once, post-seed)
- [ ] **Availability**: seeded `tee_time_slots` show as bookable only when open **and** `bookedCount < capacity`; closed/full slots are not bookable; **no price** anywhere.
- [ ] **Request**: player `requestBooking` → booking `pending`, one seat reserved.
- [ ] **Confirm**: operator `respondBooking(confirm)` → `confirmed`, seat kept, **no money moves**.
- [ ] **Reject / Cancel**: `respondBooking(reject)` / `cancelBooking` → `rejected`/`cancelled`, seat released, **no refund** (nothing was charged).
- [ ] **Message**: `sendBookingMessage` posts a participant message; `booking_audit` gains an append-only, non-financial entry.

---

## 3. Course-sync dry-run evidence template

Capture evidence from a **`mode: "preview"`** run of `syncCoursesFromProvider` (dry-run:
returns proposed diffs, **writes nothing** — only `mode: "apply"` mutates `courses`). Fill one
row per `courseId`. Value cells are intentionally **blank** — this is a template.

| courseId | before (lat, lng) | after (lat, lng) | result | notes |
|----------|-------------------|------------------|--------|-------|
|          |                   |                  |        |       |
|          |                   |                  |        |       |
|          |                   |                  |        |       |
|          |                   |                  |        |       |

**`result` vocabulary** (from `classifyCourseSync`): `updated` · `nochange` · `conflict` ·
`missing` · `skipped_manual` · `error`.

### Expected safety properties (assert while filling the table)
- **Manual lock preserved** → a course carrying a trusted manual correction (`manualLock` /
  `requiresManualGPS`) with divergent provider data must resolve to **`skipped_manual`**,
  never silently overwritten.
- **Null-island / bad id rejected** → provider coords of `(0,0)` or out-of-range, or a
  blank/`unknown` provider id, must resolve to **`conflict`** (bad coords / id mismatch) or
  **`error`** (invalid stored provider id → audit-failure path, write not taken) — never
  silently applied.
- **Missing provider data** → no provider record (e.g. 404) resolves to **`missing`**.
- **Idempotent re-run** → a course already correct resolves to **`nochange`**; re-running the
  same preview yields the same classification (no drift).
- **Broken → fixable** → a course with broken/missing coords and good provider data classifies
  as **`updated`** in preview (would write only under `apply`).

### Proof on synthetic data
`npm run verify:courseops` (`scripts/course-ops-journey-verify.mjs`) exercises these exact
classifications against the **real pure cores** (`functions/lib/courseSync.js`,
`functions/lib/bookingLogic.js`) under an injected `v2-preview` config — no provider,
emulator, network, or deploy. It proves the safety properties above (24 checks) and zero
`golfriend-v1` resolution. Use it as the synthetic backstop; use this table for a real
preview run's evidence.
