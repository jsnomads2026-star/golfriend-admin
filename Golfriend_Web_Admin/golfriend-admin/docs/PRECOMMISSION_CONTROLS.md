# Pre-Commissioning Controls Catalog

**Branch:** `feat/laneC-consolidated` · **Owner of this doc:** Lane C · **Date:** 2026-08-11

This catalog separates controls into two classes:

- **AUTOMATED** — self-verifiable from repo source with a single command. Lane C owns and runs these; they are deterministic static/pure-logic checks with no provider, emulator, network, or deploy side effects. Because they are self-proving, their approval is implicitly **automated** (`autoApproval` implicitly true).
- **MANUAL / PROVIDER** — depend on out-of-band infrastructure, credentials, deploys, or human/founder authority not sourced from Lane C. These remain **BLOCKED** (`autoApproval: false`) until the responsible owner performs them.

No secrets or provider values appear in this document. Every automated row maps to a real entry in `package.json` `scripts` (or `functions/package.json`).

---

## 1. Automated controls (Lane C-owned, runnable now)

| Control | Command | What it proves | Type |
|---|---|---|---|
| Authority gate | `npm run gate:authority` | Static source scan of `src/`: clients issue **no authoritative writes** to the 12 authoritative collections (`users, transactions, b2b_partners, admin_users, tee_time_slots, bookings, course_operators, enterprise_staff, moderation_incidents, blacklist, games, fulfillment_orders`) and never client-increment authoritative fields (`chips, reliability_score, tier, priceChips`); only quarantined dead code is allowlisted. Exit 1 on any leak. | automated |
| Dead-route gate | `npm run gate:dead-route` | Quarantined components (`SponsorOnboardingWizard`, `LedgerWatchtower`) stay **unrouted and guarded** — not re-imported/re-rendered in `App.tsx`, decommission early-return guards intact; no superseded financial booking behavior restored. Exit 1 on regression. | automated |
| V2 mode gate | `npm run gate:v2` | The `v2-preview` mode is **fail-closed and zero-V1**: using the app's own resolver (`src/firebaseTarget.js`), v2 can never resolve any `golfriend-v1` identity/target; v1 leaks throw. Exit 1 on violation. | automated |
| Portal a11y gate | `npm run gate:a11y` | The V2 portal auth journey in `App.tsx` is **accessible and non-bypassable**: state screens carry `aria-busy`/`role`/`aria-live`, form fields are labelled, access derives from the server `admin_users` read; **no God-Mode literal**, no unauthenticated TV bypass, no raw provider error surfaced. Exit 1 on violation. | automated |
| Booking journey verify | `npm run verify:booking` | Static verifier of the strictly **non-financial** booking journey (11/11 checks): each role surface wires the expected Cloud Function callable, and **no financial primitive** (`priceChips`/`booking_hold`/escrow/refund/payout/settle/chips) exists in booking code. | automated |
| V2 synthetic verify | `npm run verify:v2` | Runs the non-financial booking journey under **injected fake-but-well-formed V2 identities**, proving the resolved target is V1-free and the journey stays non-financial. Local source test, no provider/emulator/network. | automated |
| Role journey verify | `npm run verify:roles` | Executable cross-role **journey matrix (24/24)** over the same server-owned derivation (`src/auth/roleJourney.js`) the app uses: every journey state is reachable for the correct inputs across both portal modes; access is **server-owned**, not client-assigned. | automated |
| Route guard verify | `npm run verify:guards` | Static proof over `App.tsx` that **every privileged route/surface (14/14)** sits behind the server-owned resolver inside an `access.state === 'authorized'` branch — no local/God-Mode/fallback identity and no client role assignment can reach a privileged portal; non-authorized states return a state screen first (fail-closed order). | automated |
| Course-ops journey verify | `npm run verify:courseops` | Course-operations **commissioning journey (24 checks)** under synthetic `v2-preview` config, exercising the real pure cores (`courseSync` + `bookingLogic`): provider sync dry-run/validation/manual-lock preservation/audit-failure, inventory, availability, operator assignment, and the non-financial booking lifecycle — proving zero V1 resolution. | automated |
| Aggregate gate | `npm run gate` | Runs all nine controls above in sequence (`gate:authority → gate:dead-route → gate:v2 → gate:a11y → verify:booking → verify:v2 → verify:roles → verify:guards → verify:courseops`); any failure aborts. | automated |
| Web build | `npm run build` | `tsc -b && vite build` — the Admin/Portal web app type-checks and builds cleanly. | automated |
| Functions unit tests | `npm --prefix functions test` | Compiles and runs the functions pure-logic suites (`courseSync.test.js` + `bookingLogic.test.js`), 22/22 — the authoritative booking/course-sync rules pass. | automated |
| Functions build | `npm --prefix functions run build` | `tsc` — Cloud Functions compile cleanly and produce `functions/lib` (the pure cores the verifiers import). | automated |
| Route-capability map | `npm run map:routes` | Descriptive route → capability map of the app's routes/surfaces (informational; no pass/fail assertion). | automated |

**Automated controls: 14.**

---

## 2. Manual / provider controls — BLOCKED (`autoApproval: false`)

These are NOT Lane C source and cannot be self-verified from this repo. Each requires its named owner to act out-of-band.

| Control | Owner | Why blocked | Not Lane C source | autoApproval |
|---|---|---|---|---|
| Seed first **Director** in `admin_users` | Founder / infra (out-of-band Admin SDK or console) | Bootstrap platform admin is written via the Admin SDK, which bypasses rules; there is no reachable client path (per `BLANK_PROJECT_MANIFEST.md` seed order §6, step 1). Human/infra action. | Infra / console, not repo code | `false` |
| Firestore **rules** authoring + deploy | Lane B (`firestore.rules` + `firestore.indexes.json`) | `LANEB_RULES_HANDOFF.md` is a contract handoff, not rules code; Lane B translates and deploys the rules, and deploy needs approval (Lane B I1-B + deploy approval). | Lane B branch + deploy pipeline | `false` |
| V2 Firebase **project / App Check / provider identities** | Founder / infra | Governed by **issue #21**: no provider (Firebase/GCP) project may be created, changed, or repointed now; V2 provisioning and config swap are a founder/infra decision (`FIREBASE_V1V2_INVENTORY.md`). | Provider console / issue #21 | `false` |
| **Emulator** authorization + emulator runs | Infra / founder | `firebase emulators:start` requires infra authorization and a provisioned environment; the automated controls deliberately run local-only with no emulator. | Firebase CLI / infra environment | `false` |
| **Deployment / hosting / functions deploy** | Founder / infra | Hosting and `firebase deploy --only functions` push code to live provider infrastructure; explicit deploy approval required. | Deploy pipeline / provider | `false` |
| **CI** status / workflow runs | CI system | No CI workflow status is reported in this repo currently; CI execution and gating status are owned by the CI system, not runnable/verifiable from Lane C source. | CI service (none reported) | `false` |

**Manual / provider controls: 6.**

---

## 3. First safe post-lunch founder action (recommendation)

The single lowest-risk first action is to **seed the first Director document in `admin_users`** (out-of-band via the Admin SDK / console, per `BLANK_PROJECT_MANIFEST.md` §6 step 1). It writes exactly one bootstrap record, touches no financial state, and is the one prerequisite that unlocks exercising the server-owned admin/portal journey end-to-end — everything downstream of it is already proven server-owned by `verify:roles`, `verify:guards`, and `gate:a11y`. Everything Lane C owns is already green and self-verifiable now (`npm run gate` plus the web/functions builds and functions tests), so no code work blocks this; the Director seed is simply the smallest, most reversible step that moves the project from "green in source" to "green when actually driven by a real admin identity." Provider provisioning, rules deploy, and hosting can follow once their respective owners (issue #21 / Lane B / infra) approve.
