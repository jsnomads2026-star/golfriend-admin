# Lane C C3B booking release readiness

## Commit identity and scope

- Exact branch: `feat/laneC-consolidated`
- Exact parent: `97cbc878406a1e460e95e25b4c2e7dfaa119e65f` (C3A)
- Expected C3B commit: the direct child of that parent with subject `chore(admin): finalize Lane C booking release readiness`; its full SHA is recorded in the final execution report because a commit cannot contain its own SHA.
- Rollback point: C3A `97cbc878406a1e460e95e25b4c2e7dfaa119e65f`

This package is a release-readiness inventory and local verification boundary. It is not production commissioning, deployment evidence, provider health evidence, or approval.

## Capability inventory

| Capability | Classification | Data source | Authority |
|---|---|---|---|
| Booking Oversight | `implemented` | Firestore booking read stream | Trusted `adminResolveBooking` callable for mutations |
| Booking Audit | `implemented` | Append-only Firestore audit read stream | Golfriend Booking Platform |
| Booking Detail Panel | `manual_verification_required` | Booking audit and message read streams | Read-only Lane C UI |
| Booking Message Composer | `implemented` | Local templates; callable boundary for send | Trusted `sendBookingMessage` callable |
| Booking Exception Queue | `fixture_verified` | Booking read stream and pure classifier | Lane C Admin presentation |
| Booking Operations Report | `fixture_verified` | Booking read stream and pure aggregator | Lane C producer boundary |
| Booking data contract v1 | `contract_ready` | Injectable read-only adapter contract | Golfriend Booking Platform |
| Booking callable contract v1 | `contract_ready` | Server-authoritative callable interfaces | Golfriend Booking Platform |
| Booking report contract v1 | `contract_ready` | Deterministic producer schema | Lane C Admin |
| Booking readiness contract v1 | `contract_ready` | Deterministic local registry | Lane C Admin |
| Automatic reminders | `unavailable` | No approved adapter or contract | Unassigned |
| JHCC report transmission | `blocked_external` | Lane C producer boundary only | Future JHCC integration |
| Production dependency audit | `blocked_external` | npm production dependency audit | Golfriend Admin maintainers |

Allowed classifications are exactly `implemented`, `fixture_verified`, `contract_ready`, `manual_verification_required`, `blocked_external`, and `unavailable`. Fixture verification and contract readiness do not mean commissioned.

## Locale contract

All locale owners preserve exactly this set and order: `en`, `th`, `ko`, `ja`, `zh`, `es`, `fr`, `de`. Arabic is absent.

## Schemas and timestamps

Expected booking fields are `id`, `status`, `courseId`, optional `courseName`, tee-time `date` and `time`, player identity fields, locale, and `createdAt`. Stream adapters normalize valid timestamps to ISO-8601 UTC. A missing timestamp is represented as `null` at the C3A adapter boundary and as `undefined` in the existing C2 report aggregator; both are counted explicitly and never fabricated. Unknown statuses normalize to `unknown` or are counted under the report’s unknown-status bucket.

Expected audit fields are `id`, `bookingId`, `action`, actor/role attribution, and `createdAt`/`at`. Expected message fields are `id`, `bookingId`, sender role, text/body representation, locale where supplied, and `createdAt`. Real Firestore commissioning must verify these names and timestamp types before a read adapter is approved.

## Authority and state behavior

Lane C Firestore surfaces are read-only subscriptions with explicit cleanup. Booking resolution stays behind `adminResolveBooking`; message sending stays behind `sendBookingMessage`. There is no direct-write fallback.

Stream-backed surfaces expose loading, retry, error, empty, and unavailable states. Exception Queue and Operations Report retry counters create genuine resubscriptions. Booking Detail Panel focuses on open, traps focus, closes on Escape, restores prior focus, and removes listeners/subscriptions on cleanup. Reduced-motion styling is preserved, controls retain visible focus, and the release summary stacks at 390 CSS pixels.

Automatic reminders remain unavailable. Automatic JHCC transmission remains unavailable. Golfriend does not sell tee times or process tee-time payments. Course availability and fulfillment belong to third parties. Lane C does not infer or claim revenue, payment, conversion, geography, provider availability, delivery confirmation, or SLA success.

## Remaining commissioning prerequisites

- `firebase_auth`: approved authenticated Admin session.
- `staff_role` and `server_staff_authorization`: verified server-owned active staff authorization.
- `booking_read_schema`, `booking_audit_schema`, `booking_detail_schema`, `firestore_schema_review`, and `source_schema_review`: real read-model field and timestamp verification.
- `approved_read_adapter` and `real_read_adapter`: reviewed read-only production adapter with timeout, retry, error, and unsubscribe evidence.
- `adminResolveBooking_callable`, `sendBookingMessage_callable`, and `callable_deployment_review`: deployed callable identity, region, request/response, timeout, and trusted error verification.
- `audit_event_review`: append-only audit-event observation for authorized callable testing.
- `approved_reminder_contract` and `delivery_authority`: product, privacy, and delivery approval; currently absent.
- `approved_jhcc_ingestion_contract` and `transmission_authorization`: future consumer contract and separate transmission approval; currently absent.
- `human_commissioning_approval`: evidence review by the accountable human owner.
- `production_dependency_remediation` and `clean_production_dependency_audit`: resolve the 2026-08-12 audit findings for `protobufjs` (moderate) and `react-router`/`react-router-dom` (high), then rerun the production-only audit. No automatic dependency fix was applied in C3B.
- Manual browser/device review: authenticated desktop and 390px journeys, keyboard focus cycle, screen-reader announcements, Safari/iOS, physical devices, and assistive technology.

## Local verification

Run `npm.cmd run gate:c3b`, `npm.cmd run gate:c3a`, `npm.cmd run gate:c2e`, the C2A–C2D focused gates, infrastructure gates, journey verifiers, TypeScript, Vite build, changed-file ESLint, dependency audit, boundary scans, and `git diff --check`. The full chained gate refreshes seed evidence timestamps; restore both evidence files to their exact C3A blobs before staging.

## Proposed release sequence — NOT EXECUTED

1. Human review of the C3B commit and manifest.
2. Push the reviewed branch — **NOT EXECUTED**.
3. Open and review a pull request — **NOT EXECUTED**.
4. Merge only after explicit approval — **NOT EXECUTED**.
5. Commission a read-only adapter in a non-production environment — **NOT EXECUTED**.
6. Perform separately authorized callable tests — **UNAVAILABLE / NOT EXECUTED**.
7. Deploy only with an approved release plan — **NOT EXECUTED**.

No provisioning, Firebase write, callable invocation, report transmission, push, merge, or deployment is part of C3B.
