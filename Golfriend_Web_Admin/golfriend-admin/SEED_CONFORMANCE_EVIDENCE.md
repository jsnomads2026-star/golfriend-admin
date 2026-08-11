# Lane C — Clean-V2 Seed & Journey Conformance Evidence

- **Fixture:** `fixtures/lanec-clean-v2-seed.json` (manifest v1.0.0)
- **Synthetic target:** `golfriend-v2-preview` — V1 leaks: 0
- **Generated:** 2026-08-11T03:21:19.702Z
- **Status:** ✅ CONFORMANT (0 Lane C-owned failure(s))

## Seeded counts
| collection | count |
|---|---|
| `admin_users` | 5 |
| `b2b_partners` | 3 |
| `players` | 2 |
| `courses` | 2 |
| `course_operators` | 2 |
| `tee_time_slots` | 3 |
| `bookings` | 1 |
| `booking_messages` | 2 |
| `booking_audit` | 2 |
| `enterprise_staff` | 1 |
| `portal_media` | 2 |

## Invariants checked (executable)
- every course_operators.operatorUid resolves to a b2b_partners id
- every tee_time_slots.courseId resolves to a courses.courseId
- every booking.slotId resolves to a tee_time_slots.id and booking.playerUid to a players.uid
- every booking.status is one of pending|confirmed|rejected|cancelled
- every tee_time_slots.bookedCount equals the number of non-terminal (pending|confirmed) bookings on that slot
- every booking_message.bookingId and booking_audit.bookingId resolves to a booking.id
- every portal_media.ownerCourseId resolves to a courses.courseId
- no document carries a financial field (priceChips|price|amount|hold|escrow|settlement|payout|refund|balance)
- no admin@golfriend.co / God-Mode identity or hard-coded privileged email exists anywhere
- no golfriend-v1 identifier appears anywhere

## Defects
- none — every referenced record validated by command output.

## Delegated / external (not claimed complete here)
- `check:laneb` — live byte-match of Lane B firestore.v2-preview.{rules,indexes} vs this contract (run with LANEB_DIR)
- `Lane B canonical seed runner` — unifying emulator seed/reset/integrity execution — Lane B-owned; this file is the Lane C contribution
- `Lane A Example World media` — mobile persona/album/video fixtures — Lane A-owned; Lane C validates only course/portal media
