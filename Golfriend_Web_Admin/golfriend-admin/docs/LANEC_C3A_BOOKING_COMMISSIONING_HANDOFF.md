# Lane C C3A booking commissioning handoff

## Scope and lineage

C3A continues the first-parent Lane C lineage: C2A `acae635` → C2B `943fc27` → C2B.1 `327624d` → C2C `9d65e89` → C2D `4285b08` → C2E `6f19473`. The rollback point before C3A is full SHA `6f194739f35e8a0cfb64e2d9ab567f846d52da41`.

C3A defines a non-mutating commissioning boundary. It does not replace the existing trusted streams or callable behavior, connect production data, change Firebase configuration or rules, invoke a callable, write Firestore, or transmit a report.

## Contract inventory

- `golfriend.admin.booking-data.v1`, version 1: overview, audit, and message streams; booking detail and course/provider lookups; normalized ISO timestamps with `null` for missing timestamps; explicit `unknown` status; unsubscribe, timeout, retry, source authority, Auth and staff-role prerequisites.
- `golfriend.admin.booking-callables.v1`, version 1: request/response, authorization, idempotency, audit event, retry, timeout, trusted error, unavailable, and no-direct-write-fallback contracts for `adminResolveBooking` and `sendBookingMessage`.
- `golfriend.admin.booking-report.v1`, version 1: deterministic identifier, generation window, source build and contract version, reconciliation, missing timestamp and unknown status counts, status and exception totals, and local CSV/TXT metadata. It excludes revenue, payment, conversion, geography, delivery confirmation, SLA success, and automatic JHCC transmission.
- `golfriend.admin.booking-readiness.v1`, version 1: exact nine-capability readiness registry.

All runtime contract objects are deeply immutable. The default adapter is unavailable. The deterministic fixture adapter is read-only and cannot report callable success.

## Truthful readiness

| Capability | State | Evidence summary |
|---|---|---|
| Booking streams | `contract_ready` | Adapter schema and local fixture smoke |
| Booking audit | `contract_ready` | Append-only viewer plus stream contract |
| Booking messages | `contract_ready` | Message stream and exact eight-locale schema |
| Booking-resolution callable | `contract_ready` | Request validation only; never invoked |
| Message-send callable | `contract_ready` | Request validation only; never invoked |
| Exception queue | `fixture_verified` | Retry regression plus fixture resubscription |
| Operations report | `fixture_verified` | Deterministic local reconciliation |
| Automatic reminders | `unavailable` | No approved reminder contract |
| JHCC report transmission | `unavailable` | Producer boundary only; no ingestion contract |

No capability is labelled `commissioned`.

## Real-data prerequisites

1. Approve and identify the read-only production adapter and trusted source owner.
2. Verify Firebase Auth is required and that the server validates a current staff role; do not rely on UI routing alone.
3. Review Firestore read schemas for bookings, booking audit events, booking messages, course/provider references, and booking details. Confirm timestamp and unknown-status normalization against real documents.
4. Verify deployed callable names, regions, request/response schemas, server-side staff authorization, idempotency retention, append-only audit events, error mapping, and timeout behavior.
5. Approve a read-only real-data smoke plan with named environment prerequisites. Secrets must never appear in logs.
6. Complete browser/device checks at 390 CSS pixels, keyboard-only navigation, visible focus, screen-reader announcements, and reduced-motion settings.

## Smoke procedures

Local, read-only procedure:

```text
npm.cmd run smoke:c3a:booking
```

The command reports only prerequisite names and configured/missing booleans. It uses deterministic fixtures, validates subscription cleanup and genuine retry resubscription, checks request shapes without invocation, reconciles the producer report, scans Lane C booking surfaces for direct write calls, and reports zero external writes.

Real-data procedure: unavailable. A future `--mode=real` path fails closed. It must first receive a separately approved read-only adapter and environment authorization.

Callable test procedure: unavailable. It requires separate explicit authorization after read-only commissioning, a test booking, verified staff identity, approved idempotency keys, audit-event observation, rollback ownership, and confirmation that third-party fulfillment will not be affected.

## Boundaries

Lane C produces booking operations views and a versioned report boundary. Lane B Admin files, Web, Portal, mobile, Firebase rules, Functions, and deployment configuration remain outside scope. Future JHCC ingestion owns its own approved contract and transmission authorization; C3A performs no automatic transmission.

Golfriend does not sell tee times or process tee-time payments. Availability and fulfillment remain with third parties. There is no Stripe checkout or subscription, fabricated reminder, direct browser write, or automatic JHCC path in C3A.
