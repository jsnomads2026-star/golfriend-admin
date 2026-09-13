# Country Analytics Producer to Admin Contract

Authority: backend commit `977e63d7c04093c50f962e1d8ebd0f5c5b42c3dc`. Admin is a read adapter only and must not create a second analytics producer.

| Contract point | Frozen backend producer | Previous Admin assumption | Reconciled Admin behavior |
| --- | --- | --- | --- |
| Collection/source | `analytics_aggregates` | `country_analytics_daily` | Reads only `analytics_aggregates`; the competing daily source is removed. |
| Document key | `period` document ID | Unspecified daily document ID | Queries producer field `period`; no client-selected collection or key namespace. |
| Schema | Field `schema = golfriend.v2.country-analytics.v1`; `authority = server` | `schemaVersion = golfriend.country-analytics-daily/v1` | Strict versioned adapter output `golfriend.country-user-analytics-interop/v1`; invalid authority/schema omitted. |
| UTC semantics | Monthly `period`, expected `YYYY-MM` | Daily `date`, `YYYY-MM-DD` | Date UI remains bounded to 31 UTC days and maps to overlapping UTC calendar months. No daily precision is claimed. |
| Country | ISO alpha-2 coarse code; invalid/missing becomes `UNKNOWN` | Free-form country normalized by Admin | Accepts only alpha-2 or exact `UNKNOWN`; no language/location inference. |
| Member metric | `memberCountryBuckets[].count`: distinct members, de-duplicated by UID during server generation | Daily active/new/returning counts | Displays distinct members only. Active/new/returning are explicitly `UNAVAILABLE_IN_FROZEN_V1`, never derived from totals. |
| Suppression | Shared backend `MIN_COHORT=10`; suppressed count is `null` | Admin-local floor 10 | Validates producer floor is 10 and re-suppresses missing, invalid, or below-floor counts. |
| Freshness | Aggregate `generatedAt` | Daily producer timestamp | Projects producer timestamp and marks missing or older-than-45-day source stale. |
| Authorization | Generation/read domain requires authenticated system or role with `ANALYTICS_READ`; Firestore rules protect server writes and staff reads | Admin callable required active `admin_users` staff and App Check | Admin callable retains active-staff and App Check checks; only server aggregate documents are read. Production role mapping must confirm Admin staff corresponds to backend analytics-read policy. |
| Restart/idempotency | Backend idempotency receipt and Firestore restart tests | Deterministic pure projection | Admin adapter restart test proves identical frozen input yields identical output; it performs no writes. |

Source integration status: distinct-member country analytics is code-complete and uses the frozen backend authority. Active/new/returning trends are not present in backend schema v1 and remain unavailable pending a separately approved producer schema revision; they are not a deployment-only commissioning item.
