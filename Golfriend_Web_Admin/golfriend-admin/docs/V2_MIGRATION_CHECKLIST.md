# V2 Firebase Migration Checklist (Lane C)

**Status: NOT YET AUTHORIZED.** Issue #21 governs V2 provisioning. Do **not**
create/point at a new provider project until #21 authorizes it. This checklist
makes the eventual switch a small, auditable change and depends on the
abstraction already in place (`src/firebaseConfig.ts` swap point + inventory in
`FIREBASE_V1V2_INVENTORY.md`). Booking must remain strictly non-financial through
migration.

## Preconditions (issue #21 owner)
- [ ] V2 Firebase project provisioned by the founder/infra owner (its `projectId`,
      `authDomain`, `storageBucket`, `messagingSenderId`, `appId`, web `apiKey`).
- [ ] V2 Firestore rules deployed from the Lane B I1-B least-privilege set derived
      from `AUTHORITY_MANIFEST.md` (Admin-SDK-only writes; owner reads preserved).
- [ ] V2 Secret Manager holds `GOLF_API_KEY`, `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET` (functions).
- [ ] Required composite indexes present in V2 (reconciled by Lane B; none invented).

## Client (Admin / Small Portal / Enterprise Portal / Public Web)
Single swap point — `src/firebaseConfig.ts`:
- [ ] Add a `'golfriend-v2'` entry to `FIREBASE_PROJECTS` with the V2 config.
- [ ] Select it via **either** `ACTIVE_PROJECT = 'golfriend-v2'` (code) **or**
      the `VITE_FIREBASE_PROJECT=golfriend-v2` build env (no code change).
- [ ] No component defines its own config — verified: all import `db/auth/storage`
      from `firebaseConfig.ts` (see inventory). No other edits required.

## Functions
- [ ] `.firebaserc` `default` → V2 project id (deploy target).
- [ ] `admin.initializeApp()` stays argument-less (resolves from the deploy project);
      confirm `GCLOUD_PROJECT` in the target environment.
- [ ] Redeploy functions to V2 (deploy is out of Lane C scope; infra owner).

## Data / auth continuity (infra owner, not Lane C code)
- [ ] Plan `users`, `b2b_partners`, `courses`, `tee_time_slots`, `bookings`,
      `course_operators`, `enterprise_staff`, moderation/audit collections
      migration/backfill or fresh-start policy.
- [ ] Auth users migration or re-registration policy (uids referenced by
      `admin_users`, `course_operators.operatorUid`, bookings `playerUid`).

## Verify after switch (Lane C gates — no emulator)
- [ ] `npm run build` (web) and `npm --prefix functions test` green.
- [ ] `npm run gate` green (authority + dead-route + booking-journey).
- [ ] `npm run map:routes` — reachable/quarantined unchanged.
- [ ] Confirm `ACTIVE_FIREBASE_PROJECT` logs/points at V2 in a non-prod build first.

## Non-goals (do NOT do here)
- No provider project creation/change before issue #21.
- No Firestore rules authored in Lane C (Lane B I1-B owns rules).
- No repository/folder reorganization (issue #21).
- No re-introduction of financial booking (`priceChips`/hold/refund) — enforced by
  `gate:dead-route` + `verify:booking`.
