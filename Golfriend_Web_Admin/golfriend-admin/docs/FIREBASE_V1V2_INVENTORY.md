# Firebase V1/V2 Runtime & Config Inventory — Lane C

> **Scope:** Read-only inventory of every Firebase runtime/config dependency across the five Lane C surfaces, classifying each `golfriend-v1` binding and its V2 migration requirement.
> **Branch:** `feat/laneC-consolidated`
> **Status:** INVENTORY ONLY. No config was changed. No provider project was created or repointed. Issue #21 governs any actual V2 provider migration.

---

## 0. Executive picture

All client surfaces (Public Web, Admin, Small-Business Portal, Enterprise Portal) import the **single** module `src/firebaseConfig.ts`, which hardcodes the `golfriend-v1` project. That module is the one initialization point (`initializeApp`) and the sole export of `db` / `auth` / `storage`. No component defines its own `firebaseConfig` or calls `initializeApp` a second time.

Functions run against the same project **implicitly**: `functions/src/index.ts` calls `admin.initializeApp()` with no arguments, so the project is resolved from the deploy target in `.firebaserc` (`golfriend-v1`) / the ambient `GCLOUD_PROJECT` runtime env at execution time.

Client-side callable-function access uses `getFunctions()` with **no app/region argument** everywhere, so it binds to the default initialized app (→ `golfriend-v1`) and the default region.

---

## 1. Distinct `golfriend-v1` runtime dependency table

| # | Location (file:line) | What it is | Surface(s) affected | Classification | V2 migration requirement (point at a V2 project *without* creating/changing a provider project now) |
|---|---|---|---|---|---|
| 1 | `src/firebaseConfig.ts:9` | `projectId: "golfriend-v1"` | Public Web, Admin, Small-Business, Enterprise (all clients) | client-config | Swap the string value to the V2 projectId in this one field. Single client swap point. |
| 2 | `src/firebaseConfig.ts:8` | `authDomain: "golfriend-v1.firebaseapp.com"` | All client surfaces (all auth flows: `getAuth`, `signIn*`, `signOut`, `onAuthStateChanged`) | auth-domain | Repoint to the V2 auth domain (`<v2-project>.firebaseapp.com` or custom domain). Same file. |
| 3 | `src/firebaseConfig.ts:10` | `storageBucket: "golfriend-v1.firebasestorage.app"` | Admin (`storage`), Small-Business, Enterprise, Sponsors, Ad leads, Event Genesis (uploads) | storage | Repoint to the V2 bucket. Same file. |
| 4 | `src/firebaseConfig.ts:7` | `apiKey: "AIzaSy…IOYY"` (project-scoped web API key for golfriend-v1) | All client surfaces | client-config | Replace with the V2 project's web API key. Same file. Tied to golfriend-v1 even though the literal string differs. |
| 5 | `src/firebaseConfig.ts:11` | `messagingSenderId: "368292182099"` (golfriend-v1 sender/project number) | All client surfaces | client-config | Replace with V2 project number. Same file. |
| 6 | `src/firebaseConfig.ts:12` | `appId: "1:368292182099:web:986581e047a7e2ee2ceea6"` (golfriend-v1 web app id) | All client surfaces | client-config | Replace with V2 web app id. Same file. |
| 7 | `.firebaserc:3` | `"default": "golfriend-v1"` (functions/hosting deploy target) | Functions (deploy binding), Hosting | functions-runtime | Add/switch the deploy alias to the V2 project (or change default) so `firebase deploy` and the functions runtime bind to V2. |
| 8 | `functions/src/index.ts:14` | `admin.initializeApp()` (no args → project resolved implicitly from deploy target / `GCLOUD_PROJECT`) | Functions | functions-runtime | No literal to change here; project follows dependency #7. To pin V2 explicitly you would pass `{ projectId }`, but the intended swap is via the deploy target. |

**Distinct `golfriend-v1` runtime dependencies found: 8** — 6 in `src/firebaseConfig.ts` (lines 7–12) + 1 in `.firebaserc` (line 3) + 1 implicit functions binding (`functions/src/index.ts:14`).

Of these, the **literal string `golfriend-v1`** appears in exactly **4 places**: `src/firebaseConfig.ts:8`, `:9`, `:10`, and `.firebaserc:3` (also echoed in `AUTHORITY_MANIFEST.md:55` as documentation, not runtime). Rows 4–6 and 8 are golfriend-v1-specific identifiers/bindings that do not contain the literal string but resolve to the same project.

---

## 2. Surface-by-surface usage

### 1. Public Web — `src/components/public/*` + public routes in `src/App.tsx`
- Public routes (`src/App.tsx:45–48`): `/` LandingPage, `/storefront` B2BStorefront, `/discover` CourseDiscovery, `/legal` LegalPrivacy, `/support` SupportPage.
- Firebase init: none locally — imports `db` from `../../firebaseConfig`.
  - `CourseDiscovery.tsx:3` → `db`.
  - `B2BStorefront.tsx:6` → `db`; auth via `getAuth()` (`:20, :86, :193`), `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `setPersistence` (`:4`).
  - `BookingHandoff.tsx:10` → `db`; `getAuth()` (`:2, :121`); `getFunctions()` callables `requestBooking`/`cancelBooking`/`sendBookingMessage` (`:3, :139, :284, :304`).
- **Every one binds to `golfriend-v1`** via the shared config (auth-domain + client-config + callable region).

### 2. Admin — `src/App.tsx` dashboard + `src/components/admin/*`
- Admin route: `src/App.tsx:53` `/admin` → `Dashboard mode="admin"`. App-level auth: `getAuth()` at `:70, :85, :138` (`signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`); `db` from `./firebaseConfig` (`:5`).
- `admin/*` components import `db` (and some `storage`) from `../../firebaseConfig` and call `getFunctions()` (no region) callables, e.g.: PhotoValidator `resolvePhotoValidation`; EscrowWatchtower; BookingOversight `adminResolveBooking`; CourseSyncConsole `syncCoursesFromProvider`; TournamentManager `manageTournamentOps`; TeeTimeInventory `manageTeeTimeSlot`; FiatLedger `logPlatformExpense`; HRManagement `setEmployeeStatus`; SupportModerationHub; RaffleEngine `drawRaffleWinner`; ManualOverride `adminOverrideUser`; oem/OrderFulfillmentHub `updateFulfillmentOrder`. `EventGenesisConsole.tsx:2` and `sponsors/SponsorDashboard.tsx:6` also use `storage`/`auth`.
- All bind to `golfriend-v1` via the shared config; callables target the golfriend-v1 functions runtime.

### 3. Small-Business Portal — `src/components/B2B/SmallBusinessDashboard.tsx` + tabs
- `SmallBusinessDashboard.tsx:9` → `db, storage`; `getAuth` + `signOut` (`:6, :457, :460, :486`).
- Tab components: `BookingRequests.tsx` (`respondBooking`/`cancelBooking`/`sendBookingMessage`), `B2BPartners.tsx` (`adminManagePartner`), `WalletSettings.tsx`, `CourseTeeSheet.tsx` (`checkInFlight`/`reportPlayerIncident`), `CourseAvailability.tsx` (`claimCourseOperator`/`manageTeeTimeSlot`), `AdLeadsInbox.tsx` (`db, storage`) — all import from `../../firebaseConfig` and use `getFunctions()` with no region.
- All bind to `golfriend-v1`.

### 4. Enterprise Portal — `src/components/B2B/EnterpriseDashboard.tsx` + `enterprise/*`
- `EnterpriseDashboard.tsx:8` → `db, storage`; `getAuth` + `signOut` (`:5, :465, :496`).
- `enterprise/*`: VenueManager (`claimCourseOperator`), StaffRoles (`manageEnterpriseStaff`), OrgProfile, EnterpriseReporting, BillingBoundary — import `db` from `../../../firebaseConfig`; callables via `getFunctions()` (no region).
- All bind to `golfriend-v1`.

### 5. Functions — `functions/src/index.ts`
- `admin.initializeApp()` guarded by `if (!admin.apps.length)` (`:13–15`) — **no explicit project**; resolved from deploy target `.firebaserc` (`golfriend-v1`) / ambient `GCLOUD_PROJECT`.
- Secrets via `defineSecret` (`:22–24`): `GOLF_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Secret Manager, project-scoped to golfriend-v1).
- Uses `firebase-functions/v2` (https, scheduler) and one `firebase-functions/v1` import (`:6`) for legacy targeting; `@google-cloud/vision` client (`:18`) also runs under the ambient project.
- Compiled mirror at `functions/lib/index.js:52,58–60` (build output — same bindings).

---

## 3. V2 migration requirement summary

There are exactly **two swap points** to move Lane C onto a V2 project:

1. **Client swap point — `src/firebaseConfig.ts` (lines 7–12).** Replacing the six-field `firebaseConfig` object repoints every client surface at once (Public Web, Admin, Small-Business, Enterprise), because all of them import the single exported `db`/`auth`/`storage`. This covers projectId, authDomain, storageBucket, apiKey, messagingSenderId, appId. No per-component change is needed. Client `getFunctions()` calls follow the initialized app automatically.
2. **Functions project binding — `.firebaserc` (line 3) deploy target.** Because `functions/src/index.ts` uses `admin.initializeApp()` with no arguments, the functions runtime binds to whatever project the deploy targets. Adding/switching the V2 alias (or default) is the functions-side swap; the `admin.initializeApp()` call itself needs no edit unless an explicit `projectId` pin is desired.

**Constraint (issue #21):** No provider (Firebase/GCP) project may be created, changed, or repointed **now**. This inventory only identifies *what would change*; the actual V2 project provisioning and the config swap are gated by issue #21 and are a founder/infra decision (consistent with `AUTHORITY_MANIFEST.md:55`).

---

## 4. Inventory-only note

This document is a read-only inventory. **No configuration, code, `.firebaserc`, or provider project was modified.** The `golfriend-v1` project remains the live target for every surface. The single new file created by this task is this document.
