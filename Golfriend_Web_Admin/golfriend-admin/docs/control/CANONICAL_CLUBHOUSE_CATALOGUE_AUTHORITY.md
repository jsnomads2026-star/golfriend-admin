# Canonical Club-house Catalogue Authority

## Contract

`clubhouses/{clubHouseId}` is the canonical member-facing destination. A
course/layout remains in `courses/{courseId}` and may carry `clubHouseId` only
when the link has explicit provider-property or provider-bookable-club evidence.
The canonical document stores the provider identifiers, display name, bounded
address and coordinate facts, `childCourseIds`, provider contact/reservation
facts, and a separate `bookingAuthority` record.

Provider contact and reservation fields are facts only. The importer always
writes `bookingAuthority.status: unavailable`; no provider fact becomes
verified booking authority. Future Partner, official-source, and verified Admin
corrections must identify their source in `bookingAuthority.verificationSource`.

## Provider-fact cache and freshness

`provider_club_facts/{providerClubId}` is a server-owned provider observation,
not a canonical club-house record. It contains only bounded Golf API detail
facts, including the provider identity, layouts, geography, contact/reservation
facts, `fetchedAt`, and provider-native `providerUpdatedAt` when supplied. It
never contains `clubHouseId` or a verified `bookingAuthority` claim.

`PROVIDER_CLUB_FACT_CACHE_TTL_MS` is exactly 24 hours from `fetchedAt` and is
separate from ingestion-job expiry. `providerUpdatedAt` is provenance only; it
never makes a fact permanently fresh. Preview and execution may reuse a fact
only within this TTL; an expired or absent fact must be refetched before any
canonical reconciliation write. Preview itself remains zero-write.

Provider club-detail fetching is deterministic and sequential: at most one
`/clubs/{providerClubId}` request is in flight. A 429 is fail-closed, records
only bounded rate headers when supplied, and is not retried automatically.

## Identity and geography gates

The deterministic identifier is `golfapi-property-{providerPropertyId}` when
the provider explicitly supplies a property identity, otherwise
`golfapi-club-{providerClubId}` only when the provider explicitly marks that
club bookable. A shared provider club ID, brand text, child course name, or
matching coordinates is never enough to group layouts. An unproven group is
returned as `provider_hierarchy_ambiguous` and is not written or linked.

Coordinates must be finite, within latitude/longitude bounds, and not `0,0`.
Discovery receives an authoritative member coordinate and independently applies
Haversine `<= 50 km`; provider radius filtering is advisory only. Invalid or
missing geography is excluded.

## Backfill control

`previewCourseClubhouseReconciliation` is App Check and coordinator protected,
bounded to 25 provider club groups / 200 writes, and returns zero writes. It
reports proven destinations, safely linkable courses, ambiguous groups, invalid
geography, retained existing links, provider contact facts, and unavailable
booking authority. It also reports provider-fact cache hits, live refetches,
and bounded non-secret rate evidence.

`executeCourseClubhouseReconciliation` is deliberately not run by this lane.
It needs the exact reviewed plan/source hashes, fails on ambiguity, preserves a
different existing `clubHouseId`, uses deterministic IDs, and writes one
immutable receipt. It never deletes or creates courses.

## Siam acceptance rule

Old Course, Plantation, Waterside, and Rolling Hills require independent
provider property/bookable-club evidence or verified enrichment before they are
member-facing destinations. Sugar Cane, Tapioca, and Pineapple remain child
layouts. Seoul Siam is excluded from Pattaya by the independent 50 km distance
calculation, not deletion or a Siam-specific rule.
