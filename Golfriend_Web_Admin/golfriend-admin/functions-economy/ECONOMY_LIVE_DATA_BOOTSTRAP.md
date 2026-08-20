# Economy Master live-data bootstrap — read-only audit

Observed 2026-08-20.  The confirmed V2 Production project is `golfriend-v2-production-2ee34`; its deployed function list does not include `getV2EconomyMasterSnapshot`.  No production collection read contract is deployed, so production record counts and freshness are deliberately **unavailable**, not assumed zero.

| Domain | Canonical source | V2 target | Current count / freshness | Required evidence / blocker |
| --- | --- | --- | --- | --- |
| Active policy | `v2_economy_policy_versions/policy_<sha256(golfriend:v2-economy:policy:booking-concierge-five-tee-v1)>` from `backend/economy-core/teeReservationFirestoreService.js` | Same collection and deterministic id | Source data: unproven; V2 Production: unavailable | Expected schema is `golfriend.economy-policy-version.v1`, active `booking-concierge-five-tee-v1`, 5 Tee. A current authoritative document read is required. |
| Tee lots | `v2_tee_lots/lot_<sha256(...)>` | Same collection/id convention | Source data: unproven; V2 Production: unavailable | `golfriend.tee-lot.v1`; prove count, newest issue/expiry time, and issued/remaining/reserved reconciliation. |
| Journal | `v2_economy_journal_entries/journal_<sha256(...)>` | Same collection/id convention | Source data: unproven; V2 Production: unavailable | `journal_entry_v1`; prove count, latest `createdAt`, and every entry's debit/credit balance. |
| Reconciliation | `v2_economy_reconciliation_cases/reconciliation_<sha256(...)>` | Same collection/id convention | Source data: unproven; V2 Production: unavailable | `golfriend.economy-reconciliation-case.v1`; prove count, latest update, and pending-case treatment. |
| Policy audit | No implemented canonical collection; architecture documentation names `PolicyChangeAudit` only | `v2_economy_policy_change_audit/<audit id>` | Missing / unavailable | No financial-policy history exists to migrate. Implement an authoritative append-only audit contract before price changes or audit-backed reporting. |

`admin_users/{uid}` is the Director authorization dependency: the callable requires `role === 'Director'` and a status other than `Suspended`. This is a read permission gate, not financial authority.

Country coverage is missing: the canonical journal writer records purpose and service request metadata, but no `countryCode`. Therefore there is no provable ISO-country coverage and country-level economy reports must remain unavailable.

The source service establishes a **schema contract**, not an identified live source dataset. Missing financial evidence is: an immutable source snapshot/digest, document counts/freshness, balanced-journal proof, lot reconciliation proof, policy-audit history, and country attribution. It is unsafe to populate V2 Economy until all are supplied and independently checked.

## Controlled future migration (not implemented)

1. An authorized finance operator performs a read-only export/count of the authoritative source and V2 target, then records timestamp, schema validation, country codes, ledger-balance totals, lot totals, and an immutable digest.
2. Feed those facts to `planV2EconomyBootstrap`; it must return `ready-for-separately-authorized-migration` and the target must explicitly be `confirmed-empty` or schema-compatible.
3. Obtain separate finance approval for a one-time, idempotent server-side migration. That future job must preserve deterministic ids, validate every ledger entry, create the missing policy audit history, and abort on any conflict. It is intentionally absent from this codebase.
