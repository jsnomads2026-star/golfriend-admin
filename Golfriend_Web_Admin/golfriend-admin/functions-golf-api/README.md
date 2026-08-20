# Isolated V2 Golf API sync

Both callables run in `asia-southeast1`. `syncCoursesFromProvider` requires an active server-owned `admin_users/{uid}` staff or Director role, accepts at most 25 explicit course ids, and uses a Preview before an Apply. `getGolfApiSyncStatus` returns a staff-authorized aggregate status view only.

Preview reserves the exact number of provider requests in `platform/golfApiUsage` before it fetches. The transaction rejects any month that would exceed 100 requests. Apply uses the stored, fifteen-minute preview and therefore makes no provider request. It rechecks each current course, preserves manual locks, only upserts changed coordinates, and is idempotent by preview id.

The function creates immutable records in `golf_api_sync_audit` for Preview and Apply. `golf_api_sync_previews` is operational state only and changes once from `previewed` to `applied`.

## Future deployment only

Do not run this as part of this change. After the `GOLF_API_KEY` Secret Manager value and the rule release below are approved, deploy only this codebase:

```powershell
firebase --config firebase.golf-api.json deploy --only functions:golf-api:syncCoursesFromProvider,functions:golf-api:getGolfApiSyncStatus --project golfriend-v2-production-2ee34
```

Required Firestore-rules addition (not made here; Admin SDK remains the only writer):

```text
match /platform/golfApiUsage { allow read, write: if false; }
match /golf_api_sync_previews/{previewId} { allow read, write: if false; }
match /golf_api_sync_audit/{auditId} { allow read, write: if false; }
```

Retain the existing `courses` client-write denial. The status callable returns only aggregates; no browser read to the status, preview, or audit collections is required.
