# V2 Callable Authority Classification (Lane C)

**Directive:** issue #19 — "Remove the remaining server-side `admin@golfriend.co` email/God-Mode authority across Lane C, with explicit classification before modification."

**Rule applied:** every callable in `functions/src/index.ts` that carried the `callerEmail === 'admin@golfriend.co'` break-glass (or the earlier `syncCoursesFromProvider` variant) was classified into one of four buckets **before** modification. Approved operations now derive authority **only** from the server-owned `admin_users/{uid}` document via the `authority.ts` module (`isActiveStaff` / `isActiveDirector`), least-privilege per operation risk. Prohibited/unresolved operations are **quarantined fail-closed** — not re-authenticated into validity.

`isActiveStaff` = doc exists, `status !== 'Suspended'`, non-empty `role`. `isActiveDirector` = `isActiveStaff` **and** `role === 'Director'`.

## 1. Approved V2 — authority replaced with server-owned staff/Director

| Callable | Prior break-glass | New authority | Risk basis |
|---|---|---|---|
| `manageTeeTimeSlot` | staff OR God-Mode; else operator | `isActiveStaff` OR claimed operator | course inventory (staff or the course's operator) |
| `respondBooking` | staff OR God-Mode; else operator | `isActiveStaff` OR claimed operator | non-financial booking confirm/reject |
| `cancelBooking` | staff OR God-Mode; else owner/operator | `isActiveStaff` OR owner OR operator | non-financial booking cancel |
| `sendBookingMessage` | staff OR God-Mode; else owner/operator | `isActiveStaff` OR owner OR operator | booking messaging |
| `adminResolveBooking` | staff OR God-Mode | `isActiveStaff` | staff booking oversight |
| `applyModerationStrike` | Director OR God-Mode | `isActiveDirector` | ToS strike / ban (highest-risk moderation) — Director only |

## 2. Approved V2 — email is identity-resolution only (no God-Mode literal; retained + documented)

These never used a hard-coded privileged email. They lower-case the caller's own token email **solely** to build the candidate id set for the caller's **own** `b2b_partners/{id}` document (partners are keyed by uid **or** email variant from onboarding). Authority still derives from the resolved document's `status === 'active_partner'` (or `admin_users`). This is caller-identity resolution, **not** privilege-by-email, so it is retained.

| Callable | Email use | Authority source |
|---|---|---|
| `claimCourseOperator` | own `b2b_partners` doc-id candidates | resolved partner is `active_partner` |
| `manageEnterpriseStaff` | own `b2b_partners` doc-id candidates | resolved partner is `active_partner` + `tier==enterprise` |
| `cancelB2BContract` | own `b2b_partners` doc-id candidates | caller owns the resolved contract (self-service) |
| `reportPlayerIncident` | own `b2b_partners` doc-id candidates; stores `reporterEmail` in the audit record | `admin_users` staff OR `active_partner` |

## 3. Prohibited — financial/wallet/escrow/settlement/commerce → quarantined fail-closed

Incompatible with the non-financial V2 policy. Each is now a fail-closed export that throws `unavailable`, carries **no** privileged authority, **no** email/God-Mode, and **no** chip/transaction/escrow/fiat mutation. Prior implementations remain in git history; a compliant V2 design (if approved) must be built fresh — **not** re-enabled by changing authentication.

| Callable | Prohibited authority removed |
|---|---|
| `resolveEscrow` | escrow settlement + chip refund `increment` |
| `adminOverrideUser` | mint/burn chips (wallet) + `transactions`; coupled reliability path removed with it |
| `adminManagePartner` | mint/adjust chips (wallet) + commercial tier settlement |
| `logPlatformExpense` | fiat OPEX / treasury ledger writer |
| `resolvePhotoValidation` | chip ±50 (wallet) coupled to photo moderation |
| `updateFulfillmentOrder` | physical-goods order fulfillment lifecycle (commerce) |

## 4. Unresolved — no approved non-financial V2 policy → failed closed, **founder decision required**

Tournament/Play-domain operations outside the approved Lane C non-financial-booking scope. Per the directive I did **not** invent policy or re-authenticate them into V2; they are failed closed pending an explicit founder classification. **If the founder reclassifies any as approved V2, the follow-up is to restore it with `isActiveStaff`/`isActiveDirector` (least privilege) — reported separately, not assumed here.**

| Callable | Domain | Why unresolved |
|---|---|---|
| `drawRaffleWinner` | tournaments | raffle prize draw (tournament economy) |
| `manageTournamentOps` | tournaments | registration/flight state ops |
| `checkInFlight` | games/flights | flight check-in on `games`, not the non-financial `bookings` system |

## Note — already clean (no change needed)

- `syncCoursesFromProvider` — break-glass removed in the prior security slice (`isActiveStaff`).
- `setEmployeeStatus`, `inviteEmployee` — Director-gated via `admin_users` role directly; never carried an email God-Mode.
- Scheduled/webhook financial jobs (`weeklyVaultJanitor`, `hourlyTreasurySweep`, `stripeB2BWebhook`) run as SYSTEM with no caller-email authority; they are legacy financial infrastructure outside this email-break-glass slice and are flagged for the same non-financial-V2 review, **not** modified here.

## Enforcement

- `scripts/functions-godmode-gate.mjs` (`npm run gate:godmode`, in `npm run gate`) — repository-wide: fails if any reachable V2 Function reintroduces the `admin@golfriend.co` literal, `callerEmail`-based privilege authorization, `process.env` God-Mode bypass, or unowned privileged authority; and asserts every quarantined callable stays fail-closed with no financial mutation. Proven fail-closed by negative self-test.
- `functions/src/v2AuthorityConformance.test.ts` (`npm run test:v2authority`) — per-callable positive/negative authorization assertions for every retained callable and quarantine assertions for every excluded callable.
- `scripts/client-callable-gate.mjs` (`npm run gate:clientcallable`, in `npm run gate`) — walks the reachable client import graph from `src/main.tsx` and fails if any reachable Admin/Web/Small/Enterprise surface imports or invokes a quarantined/unresolved callable; asserts the prohibited consoles are unreachable and approved journeys stay reachable. Proven fail-closed.
- `scripts/nav-reachability-verify.mjs` (`npm run verify:nav`) — navigation-level: every quarantined/unresolved console tab renders `PolicyUnavailable`; no prohibited console is mounted; approved booking/availability/operator/enterprise/moderation/role journeys remain mounted.
- Client surfaces: the nine consoles were removed from active navigation (App admin tabs + Enterprise/Small-Business dashboards) and replaced by `src/components/common/PolicyUnavailable.tsx` (honest unavailable/policy-review state, no callable). `CourseTeeSheet` stays (approved flight display + `reportPlayerIncident`); only its `checkInFlight` control was neutralized. The console component files are preserved as unimported reference (unreachable).
- Scheduled/webhook jobs: see `docs/V2_SCHEDULED_JOBS_CLASSIFICATION.md` (read-only; none modified this slice).
