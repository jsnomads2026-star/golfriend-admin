# Independent Claude re-audit request: Golf API catalogue authority

Please independently audit commits `1cd246ab93038aa6bb2d4537f22dba8bf16f4f98` (App) and `4ee9facc374c8a523d41abe66586ddae7073c324` (Admin/backend). Do not rely on the commissioning agent's conclusions and do not expose any credential.

Verify:

- mobile/browser source contains no Golf API key, `EXPO_PUBLIC_GOLF_API_*`, provider URL, or direct provider request;
- all deployed provider traffic is behind the shared 5-request/second limiter, 500-call ledger, 100-call reserve, provider-reported quota reconciliation, scheduler lease, retry/dead-letter state, and fail-closed rotation gate;
- authenticated App Check-protected Director status projection and canonical rules deny client writes and operational collection reads;
- deterministic CourseID identity, providerCourseId/ClubID deduplication, curated-field preservation, quarantine, pagination, checkpoint recovery, and incremental selection are correct;
- the deployed `golfriend-v2` schedules have the intended state: provider-backed schedules paused pending rotation and the provider-free count receipt schedule enabled;
- no provider canary is attempted until James confirms a rotated Secret Manager version and quota.

Current evidence to re-check independently: 3,343 canonical, 3,333 usable, 3,343 unique CourseIDs, 3,171 unique ClubIDs, 145 missing ClubIDs; resume cursor page 141 to page 142; recovery count 2; provider-reported remaining 3,907.7; immutable count receipt `1787099865867-a630a157c690e151`.

Return findings by severity and state an independent outcome. This request does not assert PASS.
