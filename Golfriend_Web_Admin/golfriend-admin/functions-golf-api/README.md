# Isolated V2 Golf API sync

All three functions run in `asia-southeast1`. `syncCoursesFromProvider` requires an active server-owned `admin_users/{uid}` staff or Director role, accepts at most 25 explicit course ids, and uses a Preview before an Apply. `getGolfApiSyncStatus` returns a staff-authorized aggregate status view only. `runGolfApiIngestion` is the sole provider caller and runs every 15 minutes.

Preview is local and read-only: it makes no provider request, quota reservation, audit write, job write, or course mutation. Apply accepts the explicit `courseIds` and a fresh idempotency `requestId`, then enqueues a durable job only. The scheduled worker reserves one request from `platform/golfApiUsage` before every provider call. The same transaction rejects a missing/untrusted usage state or any month above the configured 100-request budget, so it fails closed without a provider call. Worker results preserve manual locks, only upsert verified changed coordinates, and are idempotent by job progress and lease.

The function creates immutable records in `golf_api_sync_audit` for Preview and Apply. `golf_api_sync_previews` is operational state only and changes once from `previewed` to `applied`.

## Future deployment only

Do not run this as part of this change. After the `GOLF_API_KEY` Secret Manager value and the rule release below are approved, deploy only this codebase:

```powershell
firebase --config firebase.golf-api.json deploy --only functions:golf-api:syncCoursesFromProvider,functions:golf-api:getGolfApiSyncStatus,functions:golf-api:runGolfApiIngestion --project golfriend-v2-production-2ee34
```

Required Firestore-rules addition (not made here; Admin SDK remains the only writer):

```text
match /platform/golfApiUsage { allow read, write: if false; }
match /golf_api_sync_previews/{previewId} { allow read, write: if false; }
match /golf_api_sync_audit/{auditId} { allow read, write: if false; }
```

Retain the existing `courses` client-write denial. The status callable returns only aggregates; no browser read to the status, preview, or audit collections is required.
