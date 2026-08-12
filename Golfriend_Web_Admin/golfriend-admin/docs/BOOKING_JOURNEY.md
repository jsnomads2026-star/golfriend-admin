# Booking Journey — Role × Step Map (strictly NON-FINANCIAL)

The tee-time booking journey carries **no money at any step**: no price, no chips,
no wallet debit, no escrow/hold, no settlement, payout, or refund. Availability is
just a **capacity counter** (`capacity` / `bookedCount`); a booking is a **seat
reservation** that moves through `pending → confirmed | rejected | cancelled`.

Every authoritative write is a **Cloud Function callable** (`functions/src/index.ts`).
Clients only *read their own scope* and *call* — they never write seat, slot, or
status state directly. Audit trail (`booking_audit`) and message threads
(`bookings/{id}/messages`) are written server-side by those callables.

## Journey steps

`availability` → `request` → `confirm` → `reject` → `cancel` → `message` → `audit`

## Backend callables (the only write paths)

| Callable | Purpose | Emits |
| --- | --- | --- |
| `manageTeeTimeSlot` | Author availability (`create` / `setStatus`); server-owns `capacity`/`bookedCount`. **No price.** | `tee_time_slots` |
| `requestBooking` | Player reserves a seat on a slot → `pending`. | `bookings`, `booking_audit` |
| `respondBooking` | Operator `confirm` / `reject` a pending booking; releases seat on reject. | `bookings`, `booking_audit` |
| `cancelBooking` | Player or operator cancels; releases the seat (nothing was ever charged). | `bookings`, `booking_audit` |
| `adminResolveBooking` | Staff override: `confirm` / `reject` / `cancel` any booking. | `bookings`, `booking_audit` |
| `sendBookingMessage` | Post a message to the booking thread. | `bookings/{id}/messages` |

## Role × Step matrix

Columns are the four role surfaces. Each cell names the **component + callable**,
or `read-only` (reads only, no write) / `n/a` (not part of that role's journey).

| Step | Public player | Small-Business operator | Admin staff | Enterprise |
| --- | --- | --- | --- | --- |
| **availability** | `BookingHandoff` — read-only (shows *seats-left*, no price) | `CourseAvailability` → `manageTeeTimeSlot` (`create`/`setStatus`) | `TeeTimeInventory` → `manageTeeTimeSlot` (`create`/`setStatus`) | `EnterpriseReporting` — read-only (tee-times, capacity utilization) |
| **request** | `BookingHandoff` → `requestBooking` | n/a | n/a | `EnterpriseReporting` — read-only (booking counts) |
| **confirm** | n/a | `BookingRequests` → `respondBooking('confirm')` | `BookingOversight` → `adminResolveBooking('confirm')` | read-only (confirmed count) |
| **reject** | n/a | `BookingRequests` → `respondBooking('reject')` | `BookingOversight` → `adminResolveBooking('reject')` | read-only (rejected count) |
| **cancel** | `BookingHandoff` → `cancelBooking` | `BookingRequests` → `cancelBooking` | `BookingOversight` → `adminResolveBooking('cancel')` | read-only (cancelled count) |
| **message** | `BookingHandoff` → `sendBookingMessage` (reads `bookings/{id}/messages`) | `BookingRequests` → `sendBookingMessage` (reads `bookings/{id}/messages`) | n/a (oversight console does not message) | n/a |
| **audit** | read-only (server writes `booking_audit`) | read-only (server writes `booking_audit`) | read-only (server writes `booking_audit`; console streams `bookings`) | read-only (`EnterpriseReporting` aggregates `bookings` by status) |

### Surface → component reference

- **Public player** — `src/components/public/BookingHandoff.tsx`
  Not signed in → sign-in *handoff* to the Golfriend app (no booking attempt).
  Signed in → `requestBooking`; active booking → `cancelBooking` + live message
  thread (`sendBookingMessage`). Displays *seats-left* only, never a price.
- **Small-Business operator** —
  `src/components/B2B/CourseAvailability.tsx` (onboard + publish availability via
  `manageTeeTimeSlot`) and
  `src/components/B2B/BookingRequests.tsx` (`respondBooking`, `cancelBooking`,
  `sendBookingMessage`), scoped to the partner's operated courses.
- **Admin staff** —
  `src/components/admin/TeeTimeInventory.tsx` (author any course's availability via
  `manageTeeTimeSlot`) and
  `src/components/admin/BookingOversight.tsx` (force `confirm`/`reject`/`cancel` any
  booking via `adminResolveBooking`; streams the whole `bookings` collection).
  No `refund`/`escalate`/`booking_hold`/`priceChips` anywhere.
- **Enterprise** — `src/components/B2B/enterprise/EnterpriseReporting.tsx`
  Fully **read-only**: client-side aggregates (bookings by status, tee-time count,
  capacity utilization) over operated courses. No writes, no revenue/price.

## Non-financial guarantee

Verified statically by `scripts/booking-journey-verify.mjs` (`npm run verify:booking`):
the booking components and the backend booking section contain **no** `priceChips`,
`booking_hold`, `escrow`, `refund`, `payout`, `settle`, or `chips` in code
(descriptive comments that *state* the non-financial rule are stripped before the
scan). Any violation fails the check (exit 1).
