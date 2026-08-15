# V2 Course acquisition foundation

## Authority boundary

The App continues to read the existing canonical `courses` authority through GF-LG-002. This Admin pipeline does not create a second App catalogue.

Provider rows pass through these states:

`provider fixture/live server adapter -> restricted evidence digest -> candidate -> reviewer decision -> separate approver -> golfriend.v2.course.v2`

Only the last state is Course Discovery eligible. Candidates, reviews, quota records, evidence and correction requests are server collections and are never App course facts.

## Why the old growth path did not grow Course Discovery

The earlier region import wrote `golfriend.course-growth/v1` records directly into `courses`. GF-LG-002 requires the reviewed canonical `golfriend.v2.course.v2` schema with valid coordinates, approved provenance, freshness and review flags. Consequently those growth records were not authoritative Course Discovery rows, while the older sync callable only reconciled already-known provider IDs and missing coordinates.

## Quota policy

The monthly budget, reserve and daily/weekly pacing are read from `golf_api_quota/{YYYY-MM}`. No permanent 500-request constant exists. Changing the configured budget from 500 to 100 requires no code change. A transaction creates one command receipt before a provider call; exact replay returns the same reservation and changed reuse fails. Reconciliation records actual completed/failed calls and releases unused reservation. An override requires explicit server-audited approval evidence.

The dry planner performs zero provider calls and zero writes. It consumes only canonical coverage gaps, privacy-safe country demand aggregates and explicit manual requests.

## Privacy and safety

- Golf API credentials remain a Functions secret and never enter client source or responses.
- Raw provider payloads are never returned to the App or Admin. Restricted evidence stores digests and provider request digests only.
- Candidate and dashboard responses are allowlisted.
- Duplicate signals never merge automatically.
- Publication is transactional, separation-of-duties protected, stale-overwrite safe and versioned with immutable before/after digests.
- Portal correction requests cannot mutate `courses`; they create review requests only.
- Country demand accepts approved aggregates only; no golfer location or history is exposed.
- API cost is infrastructure usage, not Tee circulation.

## Commissioning blockers

Source and fixture tests do not commission production. Before live use, operations must configure `GOLF_API_KEY`, create the authoritative monthly quota document, confirm staff role assignments (including the distinct `course_catalogue_approver`), close direct client access to the new server collections in the deployment-owned rules lane, and deploy the callables. No credential, production write, provider call, quota consumption or deployment occurred in this construction mission.
