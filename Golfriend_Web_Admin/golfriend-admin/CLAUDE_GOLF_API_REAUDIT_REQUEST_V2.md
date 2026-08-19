# Golf API continuous-operation re-audit request

Date: 2026-08-19 (Asia/Bangkok)  
Target: `golfriend-v2` / `asia-southeast1`  
Decision requested: independent Claude PASS or FAIL. This packet does not self-approve activation.

## Mandatory stopped state

- `platform/golfApiCatalogueConfig.providerRequestsAllowed=false`
- Incremental and retry Cloud Scheduler jobs: `PAUSED`
- Blocked reason: `INDEPENDENT_REAUDIT_REQUIRED_AFTER_COMPROMISED_KEY_ROTATION`
- No canary, retry consumer, incremental provider run, or secret-value access was performed for this repair.

## Commits to audit

- Admin/backend/rules: `5cc830acb1dda8bc4d701d13c3e53e4af10c594f`
- App bounded catalogue search: `47b49d28c689ef72b1195c160815a5b744404c91`

## F1-F20 dispositions

1. Retry index: `course_catalogue_failures(retryState ASC,nextRetryAt ASC)` is deployed; required pre-existing indexes are retained in the same canonical file.
2. Bypass paths: provider canaries, commissioning, direct acquisition/ingestion adapters and scheduler-trigger scripts were removed; compatibility callables are deployed fail-closed.
3. Rotation: verify-only script checks Secret Manager version state, each deployed function's explicit secret version, Cloud Run service and latest ready revision; it emits a SHA-256 receipt and writes nothing without the independent-PASS activation gate.
4. Identity metrics: canonical CourseID, providerCourseId and ClubID uniqueness/missing metrics are separate; deterministic CourseID identity is enforced.
5. Quota evidence: provider remaining is accepted only from provider responses and recorded with timestamp and response digest in immutable evidence documents; status exposes evidence age.
6. Budget/SLO: authority remains 500 monthly / 100 reserve. Daily incremental SLO is 8 list pages + at most 2 details, max weight 3/day and 90/month; no authority increase.
7. Internal exhaustion: returns paused/deferred and never records a course failure or retry attempt.
8. Reservation recovery: expired reservations are transactionally released and `weightedReserved` is decremented once.
9. Cursor: page path/cache id plus exact club and course offsets are persisted after every mapping and on every stop.
10. Age refresh: `refreshAfterDays=30` participates in changed/incomplete/new selection.
11. List contract: every page explicitly requests `pageSize=200`; missing quota/total, non-array clubs, or oversized pages fail closed before processing.
12. Recovery count: only the lease-recovery transaction increments `recoveryCount`; evidence reconstruction does not overwrite it.
13. Rules gate: the required predeploy command runs domain/runtime tests, exact selection proof and the Firestore rules emulator; rules cover operational, quota, cache and activation collections.
14. Selection proof: exact export allowlist rejects missing and unexpected exports and provider/secret bypass patterns.
15. App boundary: recursive production-tree scan covers all mounted JS/TS/JSON/env client files outside dependencies/tests and rejects provider host/key names; the service has no provider transport.
16. Admin: the catalogue monitor has all eight locales and shows corrected counts, immutable receipt/digest, blocked reason, quota evidence, exact cursor, retries/dead letters and last/next run.
17. Search: mobile calls authenticated/App Check-protected `searchGolfApiCatalogue`; the callable performs a bounded indexed prefix query (limit 20). The full-collection dashboard is deployed fail-closed.
18. Compromise: the prior leak remains classified compromised/rotated/re-audit-pending. No Git history rewrite was attempted.
19. Activation path: committed and tested; verify-only metadata check succeeded for enabled Secret Manager version 2 and exact deployed revisions, with zero writes and zero provider requests. Activation remains gated off.
20. Worktree: unrelated edits were preserved; both repair worktrees are clean after these commits.

## Verification evidence

- Focused domain/runtime: 16/16 pass.
- Full Functions regression: exit 0; authority conformance includes fail-closed legacy callable.
- Firestore rules emulator: pass, including denied course writes and operational reads.
- Admin localization verifier and production build: pass (8 locales; Vite build complete).
- Complete App client-tree credential/provider scan: 2/2 pass.
- Course-catalogue exact-export proof: pass.
- Course-read and acquisition-control fail-closed selection proofs: pass.
- Rotation metadata verify-only: Secret Manager version `2` state `ENABLED`; revisions `scheduledgolfapicatalogueretries-00003-bob` and `scheduledgolfapicatalogueincremental-00008-fec`; writes 0, provider requests 0.

## Deployment evidence

Focused deployment completed to `golfriend-v2`:

- codebase `course-catalogue`: `searchGolfApiCatalogue`, `getGolfApiCatalogueStatus`, incremental scheduler, retry scheduler, count-receipt scheduler;
- codebase `course-read`: fail-closed `getCourseAcquisitionDashboard`;
- codebase `course-acquisition-control`: fail-closed `verifyGolfApiSecretBinding`;
- `enterprise-authority.firestore.rules`;
- `enterprise-authority.firestore.indexes.json`.

During the first index deployment, Firebase attempted to remove eight live indexes because the previously committed deployable file was empty. The exact definitions were recovered from Cloud Audit resource names and mounted canonical index sources, merged into the deployable file, and redeployed. The final file contains all eight original indexes plus the two catalogue indexes; the final index deployment exited 0.

## Immutable Firebase receipt

- Receipt: `1787102548697-ef957c23b19018b3`
- SHA-256: `ef957c23b19018b3ab6fd3bc586f1e625acbd292d5464b82348c7615e91e2d4e`
- canonical: 3,348
- usable: 3,338
- unique CourseID: 3,348
- unique providerCourseId: 3,348
- unique ClubID: 3,199
- missing CourseID: 0
- missing providerCourseId: 0
- missing ClubID: 119
- duplicate providerCourseId: 0
- quarantined: 1
- dead letters: 0
- provider requests used to create receipt: 0

The current count exceeds the earlier 3,268/3,258 baseline because 80 records had already been created by the pre-audit commissioning attempt. This repair did not delete those records or make further provider calls.

## Required independent checks

Please re-run the F1-F20 audit against both commits and the deployed `golfriend-v2` metadata. Do not activate provider traffic during review. Return PASS only if the runtime gate, scheduler pause, exact deployed secret-version/revision binding, additive index set, immutable receipt, bounded search, and all verification gates independently hold.
