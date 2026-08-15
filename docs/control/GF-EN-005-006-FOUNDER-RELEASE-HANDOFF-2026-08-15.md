# GF-EN-005 / GF-EN-006 Founder release handoff

**Founder release date:** 2026-08-15 (Asia/Bangkok)  
**Portal baseline recorded before implementation:** `089eba368c81df0fb709d0eae02023246fafd302`  
**Record status:** AUTHORITATIVE FOUNDER REQUIREMENT; implementation evidence is not asserted by this record.  
**Canonical inventory reconciliation:** PENDING because the owning `golfriend-v2-match` control checkout was already dirty, including `docs/control/GOLFRIEND-V2-ATOMIC-FEATURE-INVENTORY-2026-08-14.md`. This handoff must be reconciled into that master without overwriting concurrent work.

## Identifier correction

This release supersedes the legacy registry meaning of `GF-EN-005` ("View country/organization aggregates"). Effective with this release, `GF-EN-005` means **Post-activation course-profile operations**. The displaced analytics requirement is not deleted or considered delivered; it requires a newly approved stable identifier during canonical reconciliation and must not continue to use `GF-EN-005`.

`GF-EN-006` is newly allocated to **Consent-based Enterprise member linking**.

## Canonical master rows

The canonical inventory must replace its current `GF-EN-005` row and insert `GF-EN-006` immediately after it with the following requirements. These rows describe Portal consumers. Producer authority remains server-owned; absent producer commands yield honest unavailable projections and never local success.

| ID | Surface | Domain | Actor | Job | Entry surface | Success contract | Authority/privacy boundary | Consumers | Economy | Proactive AI | Locale | Construction status at release | Evidence at release | Next gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GF-EN-005 | Enterprise Portal | Course profile | Verified course-scoped staff | Submit post-activation profile/catalogue edits | Course profile operations | A versioned edit attempt is acknowledged by the server and remains pending/reviewable while the current approved profile stays visible until a replacement is approved | Immutable canonical course ID; client edits never become canonical; no live availability, price or provider-confirmation claims; suspended scope fails closed; immutable reference/audit projection | Enterprise, Admin-support handoff | NONE | FORBID | 0/8 at release; exact 8/8 required | MISSING | Founder release only; no implementation evidence asserted | Implement typed consumer and mounted accessible UI against producer acknowledgement, or honest unavailable state |
| GF-EN-006 | Enterprise Portal | Consented member linking | Authorized course-scoped staff and a specific known golfer | Invite and consent to a course membership link | Course member linking | A single-use, version-bound invitation reaches invited/accepted/declined/expired/revoked/unlinked state under server authority, with either party able to revoke/unlink | No general user directory browse/search; minimum necessary projection only; no private notes, location history, friends, bookings or cross-course data; organization/property/course isolation; suspension fails closed; no financial, booking, marketing-subscription or communication consent inferred; immutable consent/unlink receipts | Enterprise, golfer consent surface, Admin-support handoff | NONE | FORBID | 0/8 at release; exact 8/8 required | MISSING | Founder release only; no implementation evidence asserted | Implement typed consumer and mounted accessible UI against consent producer, or honest unavailable state |

## Required lifecycle and presentation

`GF-EN-005` must present `review`, `pending`, `approved`, `rejected`, `stale`, and `suspended` states. The approved profile remains the displayed canonical profile until a server-approved replacement exists. Every attempt is versioned and every reference/audit receipt is immutable.

`GF-EN-006` must present `invited`, `accepted`, `declined`, `expired`, `revoked`, `unlinked`, and `unavailable` states. Invitations target a specific known golfer; the Portal must not expose a general Golfriend directory. Consent is explicit and version-bound. Either the linked golfer or authorized course party may revoke/unlink through server authority.

Both rows require mounted, accessible and independently authored `en`, `th`, `ko`, `ja`, `zh`, `es`, `fr`, and `de` copy. Loading, retry, suspension, unavailable and honest Admin-support handoffs must not imply server acceptance.

## Producer boundary

The Portal may define the smallest typed consumer interface needed to request and project these operations. It must not create a second authority system, write canonical course/member records locally, fabricate receipts, or treat client state as acknowledgement.

The producer APIs still require authoritative server ownership for:

- course-profile approved/current and pending-attempt projections keyed by immutable course ID and version;
- submit-profile-edit acknowledgement, review disposition and immutable audit/reference receipts;
- targeted member-link invitation creation without directory discovery;
- golfer consent acceptance/decline bound to invitation ID and version;
- expiry, immediate revoke/unlink by either authorized party, and immutable consent/unlink receipts;
- organization/property/course scope enforcement and suspension gating for every read and command;
- minimum-necessary linked-member projection with cross-course isolation.

## Master summary reconciliation delta

Relative to the 147-row master snapshot, this release replaces one existing identifier and adds one new identifier. Before any implementation evidence is assessed, canonical reconciliation therefore changes the inventory total from **147 to 148** and changes construction `MISSING` from **31 to 32** in the live scoreboard (and from **15 to 16** in the later construction-only accepted-state summary), while leaving other status counts unchanged. Percentages and all repeated generated tables/lists must be regenerated from the reconciled 148-row source rather than hand-edited selectively.

The displaced legacy analytics requirement must be assigned a new Founder-approved ID before it is counted as an additional row. Until then, it is an explicit reconciliation blocker and must not be silently duplicated, dropped, or reported complete.

## Exclusions

This release does not authorize App implementation, Admin acquisition, booking lifecycle or desk work, live availability, provider confirmation, economy/commission/settlement authority, deployment, emulator, APK, push, merge, production data access, or Firebase rules changes.
