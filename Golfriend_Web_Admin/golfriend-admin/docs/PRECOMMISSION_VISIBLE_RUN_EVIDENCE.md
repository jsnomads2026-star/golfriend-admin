# Precommission Visible-Run Evidence — Web / Admin / SB Portal / Enterprise Portal

**Not the full test.** This records the authorized *visible* precommission run of the four Lane C surfaces against Lane C's **isolated local Firebase emulator** in the fixed `precommission` mode. It uses the Lane C-owned canonical slice; the full cross-lane canonical dataset remains a Lane B dependency (below).

## Configuration
- App mode: `VITE_FIREBASE_PROJECT=precommission` → resolves the demo-only project **`demo-golfriend-v2-canonical`** and connects Auth/Firestore/Functions/Storage to the local emulator (dev-only, fail-closed). Verified in-browser: `ACTIVE_FIREBASE_PROJECT="precommission"`, `USING_EMULATORS=true`, `auth.emulatorConfig={host:127.0.0.1,port:19701}`.
- Emulator (isolated ports, Lane B's `firestore.v2-preview.rules`/`storage.v2-preview.rules`): Auth `127.0.0.1:19701`, Firestore `127.0.0.1:19711`, Functions `127.0.0.1:5203` (26 callables loaded), Storage `127.0.0.1:19721`, project `demo-golfriend-v2-canonical`.
- Seed (Lane C-owned slice, Admin SDK): **10 auth users, 43 Firestore docs** (admin_users 5, b2b_partners 3, courses 2, course_operators 2, tee_time_slots 3, bookings 1, booking_audit 2, members/profiles, enterprise_staff 1). Login password (local only): `Precommission-1`.
- Web servers (separate confirmed ports): Web `:5180`, Admin `:5181`, Small-Business Portal `:5182`, Enterprise Portal `:5183`.

## Network boundary — PROVEN localhost-only (production unreachable)
Per surface, from `performance.getEntriesByType('resource')`, filtering for any non-localhost `https?://` origin:

| Surface | Firebase calls | Target | `external_nonlocal` |
|---|---|---|---|
| Web `:5180` | 0 (static) | — | **[]** |
| Admin `:5181` | 5 | all `127.0.0.1:{19701 auth, 19711 firestore}` | **[]** |
| SB Portal `:5182` | 5 | all `127.0.0.1:{19701, 19711}` | **[]** |
| Enterprise `:5183` | (auth+read) | all `127.0.0.1:{19701, 19711}` | **[]** |

Representative captured requests (Admin): `http://127.0.0.1:19701/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-precommission-emulator-key`, `http://127.0.0.1:19711/google.firestore.v1.Firestore/Listen/channel?...database=projects%2Fdemo-golfriend-v2-canonical%2F...`. The `identitytoolkit.googleapis.com` segment is a **path after the `127.0.0.1:19701` host** (Firebase emulator convention), not a request to Google. **Zero requests reached any production/`googleapis.com`/`golfriend-v1` endpoint on any surface.**

## Per-surface journeys (against the current local dataset)
- **Web `:5180`** — ✅ Public landing renders (`GOLFRIEND`), no Firebase calls.
- **Admin `:5181`** — ✅ Authenticated as Director (`ava@example.test` → `ex_director_ava`) via emulator. Data-backed reads working:
  - ✅ **Booking Audit** — 2 events (requested + confirmed) for the seeded booking, correct actor/role.
  - ✅ **Booking Oversight** — 1 booking streamed (Confirmed).
  - ✅ **HR & Staff** — full roster of 5, including negative fixtures (Dana Suspended, Omar NoRole) and Ava Director.
  - ✅ **Tee-Time Inventory** — 3 slots published.
  - ⚠️ **Course Vault / Core Seeder / Tee-Time course dropdown** — *blocked*: `courses` read is `permission-denied` under the v2-preview rules candidate (see below).
- **Small-Business Portal `:5182`** — ✅ Operator auth (`ex_operator_evan`) via emulator; ⚠️ dashboard *blocked*: `b2b_partners` read `permission-denied`.
- **Enterprise Portal `:5183`** — ✅ Enterprise auth (`ex_enterprise_erin`) via emulator; ⚠️ dashboard *blocked*: `b2b_partners` read `permission-denied`.

## Blocked flows (not app defects — dataset/rules coverage)
1. **`b2b_partners` read → `permission-denied`** (v2-preview rules `@ L134`). Consequence: both **portal dashboards** (SmallBusinessDashboard / EnterpriseDashboard) cannot resolve the signed-in partner's tier, so they stay on the B2B gateway. Partner **auth** itself works end-to-end against the emulator.
2. **`courses` read → `permission-denied`.** Consequence: the Admin **course vault** and the tee-time **course dropdown** are empty ("Failed to load course vault"); tee-time *slots* (which have a read grant) load fine.
3. **Full cross-lane canonical dataset not loaded.** Only the Lane C-owned slice was seeded. The full canonical set (auth 23 / firestore 149 / storage 66 + Lane A Example World media) is produced by **Lane B's orchestrator**, whose pushed tooling runs an ephemeral `emulators:exec` cycle (no persistent export) — a persistent-seed/export entrypoint is the missing piece for a data-complete visible run.

## Verdict
The `import.meta?.env` production-fallback defect is fixed; all four surfaces run in `precommission` mode against the **local emulator only**, with **network evidence proving zero production contact**. Authenticated Admin read-journeys are demonstrably data-backed. Portal dashboards and course-vault journeys are **blocked pending read-rule coverage for `b2b_partners`/`courses` and the full Lane B canonical dataset** — explicitly **not** a full end-to-end pass.
