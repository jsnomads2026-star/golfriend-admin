# Lane B Rules Handoff — Firestore Contract (Non-Financial Booking + Related Authoritative Collections)

**Producer:** Lane C (`feat/laneC-consolidated`). **Consumer:** Lane B (Firestore `firestore.rules` + `firestore.indexes.json` authoring).

**Status:** Contract handoff, NOT rules code. Lane B owns the rules; this document is the source-of-truth extraction Lane B translates. Every fact below is derived from the real repo and cited `file:line`.

## Governing invariant (from `AUTHORITY_MANIFEST.md:9-13`)
The Admin web + partner portals + public web perform **reads only** on authoritative collections. **Every** authoritative mutation goes through an `onCall` Cloud Function in `functions/src/index.ts` (auth + role/operator gated, audited). Therefore for **every** collection below the datastore rule for writes is:

> **write: `false`** (Admin SDK / Cloud Functions only — the Admin SDK bypasses rules; no reachable client path may write).

Rules only need to encode **read** predicates. The `booking` block is strictly **non-financial**: no `priceChips`, `amount`, `hold`, escrow, settlement, payout or refund field is written or permitted anywhere (`AUTHORITY_MANIFEST.md:18,23-24`; confirmed by the callables — no such field appears in any booking write).

## Read-access safety model (GET vs LIST) — the key to safely opening reads

Firestore evaluates `allow read` for both single-doc GET and multi-doc LIST; for a **LIST** every returned doc must satisfy the predicate **and** the query must be constrained so it cannot return docs the caller may not read. The actual client access per role (from the real query shapes below) is:

| Collection | Player (public) | Operator (SB portal) | Staff / Admin | Enterprise |
|---|---|---|---|---|
| `bookings` | **GET only**, own doc `bookings/{slotId__uid}` — id encodes their uid; rule `resource.data.playerUid == request.auth.uid`. **No player LIST exists.** | **LIST** `where('courseId','in', operatedIds)` — rule permits per-doc read where caller operates `resource.data.courseId` | **LIST all** (unfiltered) — staff/God-Mode predicate | **LIST** `where('courseId','in', operatedIds)` (same as operator) |
| `bookings/{id}/messages` | GET/LIST own booking's thread (participant) | LIST operated booking's thread | LIST | — |
| `tee_time_slots` | GET/LIST (public supply) | LIST `where('courseId','in', ids)` | LIST all | LIST `where('courseId','in', ids)` |
| `course_operators` | — | LIST `where('operatorUid','==', uid)` (own only) | LIST | LIST `where('operatorUid','==', uid)` |
| `booking_audit` | — | — | staff only (no client reader) | — |
| `admin_users` | — | — | LIST (signed-in admin) | — |
| `enterprise_staff/{eUid}/members` | — | — | (optional) | LIST where path `eUid == request.auth.uid` |

**Safety consequence for rules:** players must be granted **GET on their own booking** but **never LIST `bookings`** (there is no player LIST query — do not open one). Operator/enterprise LIST is safe only because it is constrained by `courseId in operatedIds` and the per-doc rule re-checks operator ownership. Staff unfiltered LIST is the only broad read and must be staff/God-Mode gated. This is exactly the boundary needed to "open booking/operator reads" without leaking cross-tenant data.

---

## 1. `tee_time_slots`

**Doc id:** deterministic `` `${courseId}_${date}_${time.replace(':','')}` `` — `functions/src/index.ts:528`.

**Fields (written by `manageTeeTimeSlot`)** — create at `functions/src/index.ts:536-547`; `setStatus` update at `571-575`:

| Field | Type | Source |
|---|---|---|
| `courseId` | string | index.ts:537 |
| `courseName` | string (from `courses.clubName`/`name`/id) | index.ts:522, 538 |
| `date` | string `YYYY-MM-DD` (validated `/^\d{4}-\d{2}-\d{2}$/`) | index.ts:501, 539 |
| `time` | string `HH:mm` 24h (validated `/^([01]\d|2[0-3]):[0-5]\d$/`) | index.ts:504, 540 |
| `capacity` | number, integer 1–8 | index.ts:513, 541 |
| `bookedCount` | number, server-initialized `0`, mutated by booking callables (±1) | index.ts:542 |
| `status` | string `open` \| `closed` (created as `'open'`; toggled by `setStatus`) | index.ts:543, 561, 571 |
| `createdByUid` | string (caller uid) | index.ts:544 |
| `createdAt` | serverTimestamp | index.ts:545 |
| `updatedAt` | serverTimestamp | index.ts:546, 574 |
| `updatedByUid` | string (setStatus only) | index.ts:573 |

**NO `priceChips` / price / amount field.** Client interfaces confirm (`TeeTimeInventory.tsx:18-26`, `CourseAvailability.tsx:15-18`).

**Owning callable:** `manageTeeTimeSlot` (index.ts:469) — actions `create` / `setStatus`. Write auth server-side: platform staff (non-`Suspended` `admin_users`) or God-Mode (`admin@golfriend.co`) may manage any course; otherwise caller must be the claimed operator (`course_operators/{courseId}.operatorUid == caller`) — index.ts:480-490, 525, 570.

**Read predicate for rules:**
- read: authenticated. Slots are non-sensitive public supply consumed by the player booking flow and read by staff + operators. Recommend `request.auth != null` (tighten to operator/staff only if platform requires, but the public booking flow reads them).

**Client read/query shapes:**
- `query(collection(db,'tee_time_slots'), orderBy('date'), orderBy('time'))` — `TeeTimeInventory.tsx:74` (admin, full inventory).
- `query(collection(db,'tee_time_slots'), where('courseId','in', ids))` — `CourseAvailability.tsx:80` and `EnterpriseReporting.tsx:36` (`ids` capped to 10, see Limits).

---

## 2. `bookings`

**Doc id:** `` `${slotId}__${playerUid}` `` (double underscore) — `functions/src/index.ts:624`.

**Fields (written by `requestBooking`)** — index.ts:648-660; lifecycle mutations add responder/cancel/resolve stamps:

| Field | Type | Source |
|---|---|---|
| `slotId` | string | index.ts:649 |
| `courseId` | string | index.ts:650 |
| `courseName` | string | index.ts:651 |
| `date` | string `YYYY-MM-DD` | index.ts:652 |
| `time` | string `HH:mm` | index.ts:653 |
| `playerUid` | string (booking owner) | index.ts:654 |
| `playerName` | string (from `users.nickname`/`name`, else `'Player'`) | index.ts:655 |
| `status` | string, **exactly** `pending` \| `confirmed` \| `rejected` \| `cancelled` | index.ts:656; confirm 718, reject 735, cancel 801; `AUTHORITY_MANIFEST.md:23` |
| `userStatusKey` | string localization key (`booking_pending`/`_confirmed`/`_rejected`/`_cancelled`) | index.ts:657, 719, 736, 802 |
| `createdAt` / `updatedAt` | serverTimestamp | index.ts:658-659 |
| `respondedByUid` / `respondedAt` | string / ts (respondBooking) | index.ts:720-721, 737-738 |
| `cancelledByUid` / `cancelledAt` | string / ts (cancelBooking) | index.ts:803-804 |
| `resolvedByUid` / `resolvedAt` | string / ts (adminResolveBooking) | index.ts:920-921, 936-937, 951-952 |
| `lastMessageAt` | serverTimestamp (set on each message) | index.ts:859 |

**NO price / amount / hold / escrow / refund field.** Confirmed by interfaces `BookingOversight.tsx:16-25`, `BookingRequests.tsx:13-20`, `EnterpriseReporting.tsx:13`.

**Owning callables:** `requestBooking` (index.ts:612), `respondBooking` (676), `cancelBooking` (756), `adminResolveBooking` (871). Each also appends `booking_audit` (§4) and adjusts `tee_time_slots.bookedCount`.

**Read predicate for rules (translate the server auth model):**
- read: `request.auth.uid == resource.data.playerUid` (owner) **OR** caller is the claimed operator of the booking's course (`get(/course_operators/$(resource.data.courseId)).data.operatorUid == request.auth.uid`) **OR** caller is staff (`exists(/admin_users/$(uid))` with `status != 'Suspended'`) or God-Mode. This mirrors the participant/operator/staff gating in `respondBooking` (index.ts:707-712), `cancelBooking` (784-789), `sendBookingMessage` (844-851), `adminResolveBooking` (886-891).
- Note: the admin `BookingOversight` reads the **whole** collection unfiltered (`BookingOversight.tsx:57`), so a staff/God-Mode predicate must permit an unfiltered collection read; operator/player reads are constrained by the `where('courseId','in',...)` / participant queries below.

**Client read/query shapes:**
- `query(collection(db,'bookings'))` — full, unfiltered — `BookingOversight.tsx:57` (admin/staff).
- `query(collection(db,'bookings'), where('courseId','in', ids))` — `BookingRequests.tsx:55` and `EnterpriseReporting.tsx:51` (operator/enterprise, `ids` capped to 10).

---

## 3. `bookings/{bookingId}/messages` (subcollection)

**Fields (written by `sendBookingMessage`)** — `functions/src/index.ts:853-858`:

| Field | Type | Source |
|---|---|---|
| `senderUid` | string (caller uid) | index.ts:854 |
| `senderRole` | string `player` \| `operator` \| `staff` (computed server-side) | index.ts:845, 855 |
| `text` | string, trimmed, max 2000 chars | index.ts:834, 856 |
| `createdAt` | serverTimestamp | index.ts:857 |

**Owning callable:** `sendBookingMessage` (index.ts:821). Participant gate server-side: owner player, claimed operator of the course, or staff/God-Mode (index.ts:844-851).

**Read predicate for rules:** same participant set as the parent booking — owner player (`get(parent booking).data.playerUid == uid`) OR operator of that booking's `courseId` OR staff. (Rules on a subcollection can `get()` the parent booking doc to resolve `playerUid`/`courseId`.)

**Client read/query shapes:**
- `query(collection(db,'bookings', activeId, 'messages'), orderBy('createdAt'))` — `BookingRequests.tsx:79` (operator portal).
- `query(collection(db,'bookings', bookingId, 'messages'), orderBy('createdAt','asc'))` — `BookingHandoff.tsx:254-256` (public/player).

---

## 4. `booking_audit`

**Doc id:** auto-id (`db.collection('booking_audit').doc()`) — `functions/src/index.ts:604`. **Append-only / immutable.**

**Fields (written by `stampBookingAudit`)** — index.ts:605-608:

| Field | Type | Source |
|---|---|---|
| `bookingId` | string | index.ts:606 |
| `action` | string (`requested`/`confirmed`/`rejected`/`cancelled`/`admin_confirmed`/`admin_rejected`/`admin_cancelled`) | index.ts:606; callers 662, 724, 741, 806, 924, 940, 955 |
| `byUid` | string (actor uid) | index.ts:606 |
| `byRole` | string (`player`/`operator`/`staff`) | index.ts:606 |
| `at` | serverTimestamp | index.ts:607 |

**Owning callables:** every booking callable via `stampBookingAudit` (`AUTHORITY_MANIFEST.md:20`).

**Read predicate for rules:** staff / God-Mode only recommended (audit trail; no client component currently reads it — no query found). write: `false`; additionally treat as **immutable** (no update/delete even via rules — enforced by Admin-SDK-only writes).

**Client read/query shapes:** none found (server-only append; no client reader).

---

## 5. `course_operators`

**Doc id = `courseId`** — `functions/src/index.ts:426`.

**Fields (written by `claimCourseOperator`)** — index.ts:435-441:

| Field | Type | Source |
|---|---|---|
| `courseId` | string | index.ts:436 |
| `courseName` | string (from `courses.clubName`/`name`/id) | index.ts:424, 437 |
| `operatorUid` | string (claiming caller uid) | index.ts:438 |
| `operatorPartnerId` | string (`b2b_partners` doc id: uid or email variant) | index.ts:439 |
| `claimedAt` | serverTimestamp | index.ts:440 |

**Owning callable:** `claimCourseOperator` (index.ts:387) — caller must be an `active_partner` in `b2b_partners`; server transaction blocks seizing a course already operated by another uid (index.ts:431-434).

**Read predicate for rules:** authenticated; effectively partner-scoped by the `where('operatorUid','==',uid)` query. read: `request.auth != null` (each caller only queries their own `operatorUid`). Tighten to `resource.data.operatorUid == request.auth.uid OR staff` if platform wants strict per-operator isolation.

**Client read/query shapes:**
- `query(collection(db,'course_operators'), where('operatorUid','==', partnerUid))` — `BookingRequests.tsx:47`, `CourseAvailability.tsx:63`, `EnterpriseReporting.tsx:23`.

---

## 6. Admin / staff views

### 6a. `admin_users`
**Doc id = employee uid.** **Fields (written by `inviteEmployee`)** — `functions/src/index.ts:357-364`:

| Field | Type | Source |
|---|---|---|
| `email` | string | index.ts:358 |
| `name` | string | index.ts:359 |
| `role` | string (e.g. `Director`, `Manager`, `Support`) | index.ts:360 |
| `status` | string (`Active`; `Suspended` gates privilege elsewhere) | index.ts:361, 481 |
| `createdAt` | serverTimestamp | index.ts:362 |
| `createdBy` | string (Director uid) | index.ts:363 |

**Owning callables:** `inviteEmployee` (index.ts:330, Director-gated 341-344), `setEmployeeStatus` (`AUTHORITY_MANIFEST.md:39`). Also read server-side as the staff predicate across booking/tee-time callables (index.ts:341, 480, 690, 767, 841, 886, 1111).

**Read predicate for rules:** staff only — `exists(/databases/$(db)/documents/admin_users/$(request.auth.uid))` (a signed-in admin may read the roster). No public read.

**Client read/query shapes:**
- `query(collection(db,'admin_users'), orderBy('createdAt','desc'))` — `HRManagement.tsx:20`.

### 6b. `enterprise_staff/{enterpriseUid}/members/{staffUid}`
**Fields (written by `manageEnterpriseStaff`)** — `functions/src/index.ts:1031-1039`:

| Field | Type | Source |
|---|---|---|
| `staffUid` | string (resolved Firebase Auth uid) | index.ts:1032 |
| `email` | string (lowercased) | index.ts:1033 |
| `role` | string `manager` \| `venue_staff` \| `analyst` (default `venue_staff`) | index.ts:1017-1018, 1034 |
| `status` | string (`active`) | index.ts:1035 |
| `enterpriseUid` | string (owning enterprise uid) | index.ts:1036 |
| `invitedAt` | serverTimestamp | index.ts:1037 |
| `invitedBy` | string (enterprise uid) | index.ts:1038 |

**Owning callable:** `manageEnterpriseStaff` (index.ts:975) — only an `active_partner` with `tier == enterprise`; roster namespaced under `enterprise_staff/{callerUid}/members` (index.ts:1009).

**Read predicate for rules:** the owning enterprise reads its own roster — `request.auth.uid == enterpriseUid` (the path segment). read: `request.auth.uid == enterpriseUid` (StaffRoles reads `enterprise_staff/{partnerUid}/members` where `partnerUid` is the signed-in enterprise). Optionally allow staff/God-Mode.

**Client read/query shapes:**
- `collection(db,'enterprise_staff', partnerUid, 'members')` (whole subcollection, no filter) — `StaffRoles.tsx:44`.

---

## 7. Limits / orderings

- **`in` operator max 10:** operated-course fan-out queries cap the id array to 10 before `where('courseId','in', ids)`:
  - `BookingRequests.tsx:53` `operatedIds.slice(0, 10)` → bookings `in` (line 55).
  - `CourseAvailability.tsx:78` `.slice(0, 10)` → tee_time_slots `in` (line 80).
  - `EnterpriseReporting.tsx:31` `.slice(0, 10)` → tee_time_slots `in` (36) and bookings `in` (51); comment at line 33 states "'in' supports max 10 ids".
- **Orderings in use:**
  - `tee_time_slots`: `orderBy('date')` then `orderBy('time')` — `TeeTimeInventory.tsx:74`.
  - `admin_users`: `orderBy('createdAt','desc')` — `HRManagement.tsx:20`.
  - `bookings/{id}/messages`: `orderBy('createdAt')` / `orderBy('createdAt','asc')` — `BookingRequests.tsx:79`, `BookingHandoff.tsx:256`.
- **Client-side (not datastore) caps:** `BookingRequests.tsx:138` slices resolved bookings to 20 in memory (no query limit). No Firestore `limit()` is applied to any booking/tee-time query.

---

## 8. Required indexes (derived strictly from real queries)

| Query (source) | Fields | Index type |
|---|---|---|
| `tee_time_slots` `orderBy(date)` + `orderBy(time)` — `TeeTimeInventory.tsx:74` | `date ASC, time ASC` | **COMPOSITE — must be declared** in `firestore.indexes.json` |
| `tee_time_slots` `where('courseId','in',ids)` — `CourseAvailability.tsx:80`, `EnterpriseReporting.tsx:36` | `courseId` (equality/`in`) | single-field (auto) |
| `bookings` `where('courseId','in',ids)` — `BookingRequests.tsx:55`, `EnterpriseReporting.tsx:51` | `courseId` | single-field (auto) |
| `bookings` full collection, no filter — `BookingOversight.tsx:57` | none | no index |
| `course_operators` `where('operatorUid','==',uid)` — `BookingRequests.tsx:47`, `CourseAvailability.tsx:63`, `EnterpriseReporting.tsx:23` | `operatorUid` | single-field (auto) |
| `bookings/{id}/messages` `orderBy('createdAt')` — `BookingRequests.tsx:79`, `BookingHandoff.tsx:256` | `createdAt` | single-field (auto) |
| `admin_users` `orderBy('createdAt','desc')` — `HRManagement.tsx:20` | `createdAt` | single-field (auto) |
| `enterprise_staff/{uid}/members` whole subcollection — `StaffRoles.tsx:44` | none | no index |

**Exactly one composite index is implied by real code:**

```
collection: tee_time_slots
  - date  ASC
  - time  ASC
```

All other queries are single-field (Firestore auto-indexes these) or unfiltered collection reads needing no index. No `where` + `orderBy` combination exists on any booking-related collection, and no equality-plus-range query exists, so no other composite is required. **Do not declare indexes not implied above** (e.g., there is no `courseId + date` composite because no query combines them).

---

## Appendix — Owning-callable map (for rules comments)

| Collection | Owning callable(s) | index.ts |
|---|---|---|
| `tee_time_slots` | `manageTeeTimeSlot` | 469 |
| `bookings` | `requestBooking`, `respondBooking`, `cancelBooking`, `adminResolveBooking` | 612, 676, 756, 871 |
| `bookings/{id}/messages` | `sendBookingMessage` | 821 |
| `booking_audit` | `stampBookingAudit` (all booking callables) | 597 |
| `course_operators` | `claimCourseOperator` | 387 |
| `admin_users` | `inviteEmployee`, `setEmployeeStatus` | 330 |
| `enterprise_staff/{uid}/members` | `manageEnterpriseStaff` | 975 |

**Every entry: `write: false` at the datastore.** Rules encode reads only. Sources cross-checked against `AUTHORITY_MANIFEST.md:14-24, 32, 39`.
