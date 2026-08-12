# V2 Scheduled / Webhook Job Classification (read-only)

**Directive:** issue #19 — "Inspect `weeklyVaultJanitor`, `hourlyTreasurySweep` and `stripeB2BWebhook` and produce a read-only classification report against approved V2 economy and non-financial booking policy. **Do not modify** these scheduled/webhook jobs in this slice **unless they directly implement prohibited booking money flow**."

**Result: none of the three implements booking money flow, so none was modified this slice.** They are classified below and flagged for a separate founder economy decision. These jobs carry **no `admin@golfriend.co` / caller-email authority** (they run as SYSTEM / signature-verified), so they are outside the God-Mode removal set — the question here is purely whether their *economy* behaviour belongs in the non-financial V2 world.

| Job | Trigger | Reads / Writes | Touches booking money flow? | Economy classification | Action this slice |
|---|---|---|---|---|---|
| `weeklyVaultJanitor` (index.ts:127) | `onSchedule` weekly | reads `courses`; **deletes** duplicate `courses` docs by `clubID`/`clubName` | **No** | **Non-financial** (course-data hygiene). Compatible with V2 in substance. | **Not modified.** Flag: auto-**delete** of course docs overlaps `syncCoursesFromProvider`'s last-known-good / manual-lock preservation — recommend a review so the janitor cannot purge a manually-corrected course. |
| `hourlyTreasurySweep` (index.ts:185) | `onSchedule` hourly | reads **all** `transactions`; writes `platform/treasury` summary (`totalFiatVolumeUsd`, `totalEscrowLocked`, `netChipVelocity`) | **No** (reads the ledger; writes a summary doc — no booking/tee-time money) | **Prohibited-financial infrastructure** (fiat + escrow + chip-velocity reconciliation) under the non-financial V2 policy. | **Not modified** (not booking money flow, per directive). **Founder decision required:** does a treasury/economy reconciliation job exist in V2 at all? If not, quarantine in a separate slice. |
| `stripeB2BWebhook` (index.ts:234) | `onRequest` (Stripe, signature-verified) | on `checkout.session.completed`: sets `b2b_partners` tier/contract, **mints 10,000 chips** to `users`, stamps `transactions` | **No** (B2B subscription payment/onboarding — not booking) | **Prohibited-financial** (real fiat payment → wallet mint). It is the paid counterpart of the retained (non-financial) `cancelB2BContract` tier downgrade. | **Not modified** (not booking money flow, per directive). **Founder decision required:** is paid B2B tiering + chip mint part of V2? If not, quarantine the payment/mint path in a separate slice. |

## Consistency with the non-financial booking guarantee

The approved booking system (`tee_time_slots` / `bookings` / `booking_audit`) remains **strictly non-financial** — none of these three jobs reads or writes booking/tee-time money, so the booking guarantee is intact and no modification was required or made here.

## Recommended follow-up (separate slices, founder-gated)

1. `hourlyTreasurySweep` + `stripeB2BWebhook`: explicit founder ruling on whether a fiat/chip economy exists in V2. If not → quarantine fail-closed (same pattern as the callables in `V2_CALLABLE_AUTHORITY_CLASSIFICATION.md`).
2. `weeklyVaultJanitor`: keep (non-financial) but harden so it never deletes a manually-locked/trusted course; align with `syncCoursesFromProvider` preservation rules.
