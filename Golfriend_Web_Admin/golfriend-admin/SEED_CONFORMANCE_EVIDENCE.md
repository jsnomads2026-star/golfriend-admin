# Lane C — Clean-V2 Seed & Journey Conformance Evidence

- **Fixture:** `fixtures/lanec-clean-v2-seed.json` (manifest v1.1.1)
- **Synthetic target:** `golfriend-v2-preview` — V1 leaks: 0
- **Generated:** 2026-08-11T05:29:37.258Z
- **Status:** ✅ CONFORMANT (0 Lane C-owned failure(s))

## Seeded counts
| collection | count |
|---|---|
| `members` | 11 |
| `profiles` | 11 |
| `profiles_public` | 4 |
| `profiles_private` | 7 |
| `admin_users` | 5 |
| `b2b_partners` | 3 |
| `players` | 2 |
| `courses` | 2 |
| `course_aliases_accepted` | 1 |
| `course_operators` | 2 |
| `tee_time_slots` | 3 |
| `tee_time_slots_closed` | 1 |
| `bookings` | 1 |
| `booking_messages` | 2 |
| `booking_audit` | 2 |
| `enterprise_staff` | 1 |
| `portal_media` | 0 |
| `excluded_media` | 3 |
| `negative_authority` | 3 |

## Invariants checked (executable)
- every actor uid has exactly one members parent and one profiles parent
- every profile has explicit visibility public|private; private profiles are minimalProjection + publiclyReadable:false
- authority relationships are distinct collections (member/profile/admin_users/b2b_partners/course_operators/enterprise_staff); byType counts and byUid lists match actual records
- every course_operators.operatorUid resolves to a b2b_partners id
- every tee_time_slots.courseId resolves to a courses.courseId
- closed availability (availabilityState=closed) is not bookable and reserves no capacity
- every booking.slotId resolves to a tee_time_slots.id and booking.playerUid to a players.uid
- every booking.status is one of pending|confirmed|rejected|cancelled
- every tee_time_slots.bookedCount equals the number of non-terminal (pending|confirmed) bookings on that slot
- booking_messages id == ${bookingId}__message__NNNN and booking_audit id == ${bookingId}__audit__NNNN with zero-based padded-4 seq
- every booking_message.bodyKey exists in bodyKey_catalogue; no free-text body field is present
- negative authority fixtures (suspended/roleless) are retained with reason markers and fail authorization
- every positive portal_media carries verifiable bytes (bytesPresent:true) with assetId/versionId/ownerAuthority/sourcePath(assets/…)/targetPath(fixtures/…)/sha256/type/visibility/consent/moderation; any asset whose source bytes are absent/unverifiable is excluded_media (bytesPresent:false, no fabricated hash/size) and is never seeded
- every course alias resolves to a canonical Lane C courseId; unmapped/ambiguous aliases are rejected
- no document carries a financial field (priceChips|price|amount|hold|escrow|settlement|payout|refund|balance)
- no admin@golfriend.co / God-Mode identity or hard-coded privileged email exists anywhere
- no golfriend-v1 identifier appears anywhere

## Defects
- none — every referenced record validated by command output.

## Delegated / external (not claimed complete here)
- `check:laneb` — live byte-match of Lane B firestore.v2-preview.{rules,indexes} vs this contract (run with LANEB_DIR)
- `Lane B canonical seed runner` — unifying emulator seed/reset/integrity execution — Lane B-owned; this file is the Lane C contribution
- `Lane A Example World media` — mobile persona/album/video fixtures — Lane A-owned; Lane C validates only course/portal media
