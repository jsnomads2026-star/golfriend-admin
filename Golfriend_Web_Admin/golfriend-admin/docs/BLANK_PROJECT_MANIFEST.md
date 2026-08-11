# Blank Project Commissioning Manifest

Branch: `feat/laneC-consolidated` · Scope: Lane C (Admin/Portal SPA + `functions/`)

**NAMES ONLY.** This manifest enumerates what a fresh (V2) Firebase project must
contain to run the Admin/Portal app and Cloud Functions. It contains **no**
secret values, project ids, API keys, or Firestore rules, and requires **no**
provider mutation. All names below were derived by grepping the real source
(`collection(db, '...')`, `db.collection('...')`, `defineSecret(...)`, and the
exports in `functions/src/index.ts`). Collections named in the batch brief that
are **not** referenced anywhere in source (`scorecards`, `app_config`) are
intentionally omitted and called out in §1.

---

## 1. Required Firestore collections (names only)

Top-level collections actually read/written by the app or Functions (23):

- `users`
- `b2b_partners`
- `admin_users`
- `courses`
- `tee_time_slots`
- `bookings`
- `booking_audit`
- `course_operators`
- `enterprise_staff`
- `transactions`
- `moderation_incidents`
- `blacklist`
- `supportTickets`
- `games`
- `tournaments`
- `fulfillment_orders`
- `vendors`
- `marketplaceOffers`
- `campaigns`
- `partners`
- `chats`
- `platform` (single doc `treasury` — Master Treasury HUD)
- `course_sync_audit`

Subcollections (4):

- `bookings/{id}/messages`
- `enterprise_staff/{id}/members`
- `tournaments/{id}/registrations`
- `chats/{id}/messages`

**Not referenced in source (excluded):** `scorecards`, `app_config`. These
appear in the commissioning brief but have **no** `collection(...)` reference in
Lane C code; do not seed them unless a future change introduces them.

Firestore creates collections lazily on first write, so none need pre-creation;
this list is the reference set for rules, indexes, and seed planning.

---

## 2. Cloud Functions (names only)

All exports from `functions/src/index.ts` (28 total).

**Scheduled (`onSchedule`) — 3**
- `nightlyCourseHealer`
- `weeklyVaultJanitor`
- `hourlyTreasurySweep`

**HTTP webhook (`onRequest`) — 1**
- `stripeB2BWebhook`

**Callable (`onCall`) — 23**
- `inviteEmployee`
- `claimCourseOperator`
- `manageTeeTimeSlot`
- `requestBooking`
- `respondBooking`
- `cancelBooking`
- `sendBookingMessage`
- `adminResolveBooking`
- `manageEnterpriseStaff`
- `syncCoursesFromProvider`
- `cancelB2BContract`
- `applyModerationStrike`
- `resolveEscrow`
- `reportPlayerIncident`
- `adminOverrideUser`
- `adminManagePartner`
- `setEmployeeStatus`
- `logPlatformExpense`
- `drawRaffleWinner`
- `checkInFlight`
- `manageTournamentOps`
- `resolvePhotoValidation`
- `updateFulfillmentOrder`

**Storage trigger (`functionsV1 ... .storage.object().onFinalize`) — 1**
- `photoWatchtower` (fires on finalize under the `avatars/` prefix)

---

## 3. Secrets required (names only — NO values)

Declared via `defineSecret(...)` in `functions/src/index.ts`:

- `GOLF_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Bind each in the V2 project's secret manager before deploying the Functions that
consume them (course sync uses `GOLF_API_KEY`; the Stripe webhook and B2B billing
paths use `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`).

---

## 4. Feature flags

There is **currently no feature-flag system in Lane C** — no remote-config,
env-flag registry, or per-feature gate exists in the codebase. State this
honestly rather than assuming one.

The only build-time selector is the Firebase target swap point in
`src/firebaseConfig.ts`:

- `VITE_FIREBASE_PROJECT` — build-time env override (optional).
- `ACTIVE_FIREBASE_PROJECT` — exported resolved target; defaults to
  `golfriend-v1` and throws if an unknown target is selected (never silently
  falls through). All components import `db`/`auth`/`storage` from this single
  module; no component defines its own config.

---

## 5. Roles (values the code checks)

- **Platform admins** — `admin_users.role` ∈ { `Director`, `Manager`, `Support` }
  (`Director` is the highest-privilege gate on most admin callables).
- **B2B partners** — `b2b_partners` with `status: active_partner` and
  `tier` ∈ { `enterprise`, `small_business` }.
- **Course operator** — identity keyed by `course_operators.operatorUid`
  (claimed via `claimCourseOperator`).
- **Enterprise staff** — `enterprise_staff/{id}/members` role ∈
  { `manager`, `venue_staff`, `analyst` }.
- **Player** — default `users` document (no elevated role).

---

## 6. Seed order (minimal ordered steps for a functional blank project)

1. Create the first **Director** in `admin_users` (bootstrap platform admin).
2. Seed **courses** (`courses`).
3. Partner onboarding — partner claims a course via `claimCourseOperator`
   (writes `course_operators`; requires an `active_partner` `b2b_partners` doc).
4. Publish tee-time inventory — `manageTeeTimeSlot` writes `tee_time_slots`.
5. Players request bookings — `requestBooking` writes `bookings` (+ `messages`),
   which operators handle via `respondBooking` / `cancelBooking`.

Downstream (tournaments, campaigns, fulfillment, treasury sweeps) light up once
the above spine exists; no additional seeding is required to boot.

---

## 7. Cutover steps (switch to V2)

High level — see `docs/V2_MIGRATION_CHECKLIST.md` for the authoritative detail;
do not duplicate it here.

1. Add the `golfriend-v2` entry to `FIREBASE_PROJECTS` in `src/firebaseConfig.ts`
   (the single swap point) once the V2 provider project exists.
2. Provision the §3 secrets in the V2 project.
3. Deploy `functions/` targeting the V2 project (functions deploy target).
4. Flip the selector to V2 — set `VITE_FIREBASE_PROJECT` (or `ACTIVE_PROJECT`)
   for the build.
5. Verify the migration gates in `V2_MIGRATION_CHECKLIST.md` before directing
   traffic.

---

## 8. Rollback steps (revert to golfriend-v1)

1. Flip the swap point back — unset `VITE_FIREBASE_PROJECT` (defaults to
   `golfriend-v1`) or restore `.firebaserc` to the v1 target.
2. Redeploy / repoint Functions at `golfriend-v1` if the deploy target was moved.
3. **No data migration is required if traffic was not yet cut over** — v1 data is
   untouched while V2 is being commissioned. If cutover already wrote to V2,
   follow the reconciliation steps in `V2_MIGRATION_CHECKLIST.md`.
