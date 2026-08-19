# Claude V2 final-finding closure packet

Target: `golfriend-v2`, `asia-southeast1`  
Date: `2026-08-19T01:49:10.797Z`  
Decision requested: independent PASS or FAIL. This packet does not activate provider traffic.

## Hard-disabled state

- `providerRequestsAllowed=false`
- checkpoint state: `blocked`
- blocked reason: `INDEPENDENT_REAUDIT_REQUIRED_AFTER_COMPROMISED_KEY_ROTATION`
- provider schedulers: both `PAUSED`
- provider requests made for this closure: `0`
- secret-value reads: `0`

## B1 cursor traversal

`normalizeCursor` now skips zero-course and fully quarantined clubs only until the next valid course. It persists the resulting exact club/course offsets before processing, so a later club on the same page is never skipped. Detail-budget deferral retains the current exact cursor and writes no retry/failure record.

Behavioral coverage: zero-course, fully quarantined, mixed-course and interrupted-page offsets. Page cache has a 24-hour TTL, bounded cleanup (100 documents), and expired/missing-cache self-recovery that replays the persisted page from offset `0:0` without modifying transactional `recoveryCount`.

## R1 budget truth

The approved steady state remains 90 weighted calls/month within the 500 monthly / 100 reserve authority. Discovery is incremental and change-driven. `refreshAfterDays=30` is prioritization only—not a complete 30-day detail-refresh SLA. Admin labels this explicitly in all eight locales. Deferred detail work is not a failure or retry.

## Immutable deployed-state receipt

- Receipt ID: `1787104150798-e24bdb8682b41116`
- SHA-256: `e24bdb8682b411164a92ff5ece3cd9caea63b96408bb3087a370b9495fd58340`
- Canonicalization: `recursive-lexicographic-json-v1`
- Firebase write count for this evidence run: 1 dedicated immutable receipt

Evidence payload (canonical key ordering is applied recursively before compact JSON serialization and SHA-256):

```json
{
  "createdAt":"2026-08-19T01:49:10.797Z",
  "indexes":[
    {"collectionGroup":"course_catalogue_failures","fields":["retryState","nextRetryAt"],"name":"projects/golfriend-v2/databases/(default)/collectionGroups/course_catalogue_failures/indexes/CICAgJjFqZMK","state":"READY"},
    {"collectionGroup":"golf_api_quota_reservations","fields":["status","expiresAt"],"name":"projects/golfriend-v2/databases/(default)/collectionGroups/golf_api_quota_reservations/indexes/CICAgOi3kJAK","state":"READY"}
  ],
  "projectId":"golfriend-v2",
  "providerFunctions":{
    "scheduledGolfApiCatalogueIncremental":{"revision":"scheduledgolfapicatalogueincremental-00009-lof","secretVersion":"2","service":"projects/golfriend-v2/locations/asia-southeast1/services/scheduledgolfapicatalogueincremental"},
    "scheduledGolfApiCatalogueRetries":{"revision":"scheduledgolfapicatalogueretries-00004-zep","secretVersion":"2","service":"projects/golfriend-v2/locations/asia-southeast1/services/scheduledgolfapicatalogueretries"}
  },
  "providerRequests":0,
  "region":"asia-southeast1",
  "schedulers":{
    "scheduledGolfApiCatalogueIncremental":{"name":"projects/golfriend-v2/locations/asia-southeast1/jobs/firebase-schedule-scheduledGolfApiCatalogueIncremental-asia-southeast1","schedule":"every day 02:20","state":"PAUSED","timeZone":"Asia/Bangkok"},
    "scheduledGolfApiCatalogueRetries":{"name":"projects/golfriend-v2/locations/asia-southeast1/jobs/firebase-schedule-scheduledGolfApiCatalogueRetries-asia-southeast1","schedule":"every day 03:10","state":"PAUSED","timeZone":"Asia/Bangkok"}
  },
  "schema":"golfriend.course-catalogue-deployed-state-evidence.v1",
  "secret":{"name":"GOLF_API_KEY","state":"ENABLED","version":"2"},
  "secretValueAccessed":false
}
```

To recompute, recursively sort every object key lexicographically, preserve array order, serialize as compact JSON, and SHA-256 UTF-8 bytes. The result must equal the receipt SHA-256 above. The implementation is [record-course-catalogue-deployed-state.mjs](scripts/record-course-catalogue-deployed-state.mjs).

## Required activation invariant

After every redeploy of `scheduledGolfApiCatalogueIncremental` or `scheduledGolfApiCatalogueRetries`, regenerate an activation receipt from actual Secret Manager/Cloud Functions/Cloud Run metadata before activation. A receipt bound to an earlier revision is invalid. This is documented and enforced by [activate-course-catalogue-after-rotation.mjs](scripts/activate-course-catalogue-after-rotation.mjs).

## Verification

- Enforced catalogue predeploy: 21/21 focused tests, exact selection proof, Firestore rules emulator: pass.
- Full Functions regression: pass.
- Admin localization verifier and production build: pass.
- Complete client production-tree scan, including arbitrarily named test directories: 2/2 pass.
- All ten Firestore indexes: `READY`; the two required indexes are named in the immutable receipt.
- Deployment: `course-catalogue` functions and canonical Firestore rules only.

Please independently re-audit B1, B2, R1 and the nearby residuals. Do not enable provider traffic or run a canary during review.
