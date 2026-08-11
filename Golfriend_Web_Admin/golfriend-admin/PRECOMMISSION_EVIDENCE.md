# Precommission Evidence — Lane C

- **Candidate:** `feat/laneC-consolidated` @ `967e3c8`
- **Generated:** 2026-08-11T05:29:37.266Z
- **Automated controls:** 15/15 pass, 0 fail
- **Manual/provider controls:** 6 BLOCKED (autoApproval:false)

## Automated controls (run by this tool)
| control | status | proves |
|---|---|---|
| `gate:authority` | ✅ pass | no client authoritative writes (12 collections) |
| `gate:dead-route` | ✅ pass | quarantined components unrouted/guarded; no superseded financial booking |
| `gate:v2` | ✅ pass | v2-preview fail-closed; zero-V1 |
| `gate:a11y` | ✅ pass | portal state screens accessible; no God-Mode/TV-bypass/raw error |
| `gate:fnauth` | ✅ pass | syncCoursesFromProvider authorizes via server-owned staff; no email God-Mode/env bypass |
| `gate:godmode` | ✅ pass | repository-wide: no admin@golfriend.co/caller-email/env God-Mode; retained callables use server-owned authority; quarantined callables fail-closed |
| `gate:clientcallable` | ✅ pass | no reachable client surface invokes any quarantined/unresolved callable; prohibited consoles unreachable |
| `gate:fnexport` | ✅ pass | hourlyTreasurySweep + stripeB2BWebhook cannot enter the clean-V2 bundle; weeklyVaultJanitor is lock-safe/fail-closed via the pure core |
| `verify:nav` | ✅ pass | quarantined console tabs render PolicyUnavailable; approved journeys remain mounted |
| `verify:booking` | ✅ pass | non-financial booking journey |
| `verify:v2` | ✅ pass | synthetic V2 non-financial journey; zero V1 |
| `verify:roles` | ✅ pass | cross-role journey matrix; server-owned derivation |
| `verify:guards` | ✅ pass | every privileged route behind the resolver |
| `verify:courseops` | ✅ pass | course-ops commissioning journey under synthetic V2 |
| `verify:seed` | ✅ pass | clean-V2 course/role/portal seed & journey conformance; zero-V1; non-financial |

## Externally-run automated (this commit)
| control | command | proves |
|---|---|---|
| `build:web` | `npm run build` | tsc -b && vite build |
| `build:functions` | `npm --prefix functions run build` | functions tsc |
| `test:functions` | `npm --prefix functions test` | courseSync + bookingLogic (22/22) |
| `check:laneb` | `LANEB_DIR=<checkout> npm run check:laneb` | Lane B v2-preview rules/index match published contract (skips without LANEB_DIR) |

## Manual / provider controls — BLOCKED (autoApproval:false)
| control | owner | note |
|---|---|---|
| `seed-first-director` | human/infra | write admin_users/{uid} Director out-of-band (server-owned admin; no email God-Mode) |
| `firestore-rules-deploy` | Lane B I1-B + deploy approval | author + deploy rules from the published contract |
| `v2-provider-appcheck` | issue #21 / infra | V2 project, App Check, provider identities |
| `emulator-auth-and-runs` | infra/founder | emulator authorization + runs |
| `deploy-hosting-functions` | founder/infra | production deployment |
| `ci-status` | CI | workflow runs (none currently reported) |

See `MANIFEST_HASHES.json`, `LANEC_LEDGER.json`, `docs/PRECOMMISSION_CONTROLS.md`, `docs/PRECOMMISSION_SEED_AND_SMOKE.md`.
