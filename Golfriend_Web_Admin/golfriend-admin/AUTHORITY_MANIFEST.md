# Golfriend Admin/Portal — Authority Manifest (Lane C)

Branch `feat/laneC-consolidated`. This is the source-of-truth for **which Firestore
collections/fields are authoritative, which Cloud Function owns each write, and the
rule posture required at the datastore**. It exists so Lane B integration can
reconcile Admin/Portal authority with App/backend rules, and so a fail-closed
static gate (`npm run gate:authority`) can prove no reachable client writes these.

**Invariant:** the Admin web + partner portals + public web perform **reads only** on
authoritative collections. Every authoritative mutation goes through an `onCall`
Cloud Function in `functions/src/index.ts` (auth + role/operator gated, audited).
Clients must never finalize wallet/payment/booking/moderation/role/settlement state.

## Booking (NON-FINANCIAL — Director gate)
| Collection / field | Owning callable(s) | Client posture | Required rule |
|---|---|---|---|
| `tee_time_slots` (capacity, bookedCount, status) | `manageTeeTimeSlot` | read-only | write: staff or claimed course operator only (Admin SDK/functions) |
| `bookings` (status, userStatusKey, seat) | `requestBooking`, `respondBooking`, `cancelBooking`, `adminResolveBooking` | read-only | write: functions only; NO priceChips/amount/hold field permitted |
| `bookings/{id}/messages` | `sendBookingMessage` | read-only | write: functions only (participant-gated server-side) |
| `booking_audit` (append-only) | all booking callables (`stampBookingAudit`) | read-only | write: functions only; immutable |
| `course_operators` | `claimCourseOperator` | read-only | write: functions only (active partner claims own course) |

Statuses are exactly `pending|confirmed|rejected|cancelled`. No refunded/disputed, no
`priceChips`, no `transactions/booking_hold_*`, no chips debit/refund anywhere in booking.

## Economy / B2B / wallet
| Collection / field | Owning callable(s) | Required rule |
|---|---|---|
| `users.chips` / `.tier` / `.reliability_score` / verification | `adminOverrideUser`, `adminManagePartner`, `resolvePhotoValidation`, `reportPlayerIncident`, `applyModerationStrike` | write: functions only |
| `b2b_partners` (tier, badge, contract*) | `cancelB2BContract`, `adminManagePartner`, `stripeB2BWebhook` | write: functions only |
| `transactions` (ledger) | `logPlatformExpense`, `adminManagePartner`, `adminOverrideUser`, `stripeB2BWebhook`, `resolvePhotoValidation`, `applyModerationStrike`, `hourlyTreasurySweep` | write: functions only; immutable ledger |
| `enterprise_staff/{uid}/members` | `manageEnterpriseStaff` | write: functions only (active enterprise partner) |

## Moderation / role / access
| Collection / field | Owning callable(s) | Required rule |
|---|---|---|
| `moderation_incidents` | `reportPlayerIncident` | write: functions only; immutable |
| `blacklist`, `supportTickets` strike fields | `applyModerationStrike` | write: functions only |
| `admin_users.status` / role | `setEmployeeStatus`, `inviteEmployee` | write: functions only (Director) |

## Escrow / tournaments / fulfillment / course data
| Collection / field | Owning callable(s) | Required rule |
|---|---|---|
| `transactions` `escrow_locked` (match/tournament escrow — NON-booking) | `resolveEscrow` | write: functions only |
| `tournaments` (status/displayState), `tournaments/{id}/registrations` (flight) | `manageTournamentOps`, `drawRaffleWinner` | write: functions only (staff/host) |
| `games.status` (flight check-in) | `checkInFlight` | write: functions only (staff/operator) |
| `fulfillment_orders.status` | `updateFulfillmentOrder` | write: functions only (staff) |
| `courses` (coordinates) | `syncCoursesFromProvider` (server, Secret-Manager key), `setManualCourseCoordinates` (active staff) | write: functions only; clients have no direct write path; manual GPS corrections are server-stamped trusted/locked and audited |

## Quarantined dead code (no reachable client authoritative write)
- `SponsorOnboardingWizard` — unrouted; checkout decommissioned (early return).
- `LedgerWatchtower` — unrouted; chip/tier/reliability write handlers decommissioned (early return).

## Reported V1 runtime dependency (issue #21)
`src/firebaseConfig.ts` targets the `golfriend-v1` Firebase project (projectId/authDomain/storageBucket). Migration to a V2 project is a founder/infra decision; no provider change performed.
