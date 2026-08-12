# Golfriend Admin V2 handoff — B5-R3 through B5-R9

Golfriend Admin manages Golfriend operations. JHCC manages Jaidee Holding. Admin prepares reports for a future approved JHCC contract; it does not implement or impersonate JHCC.

## Delivered

- V2 shell, URL-addressable navigation, persistent in-shell locale selection, responsive off-canvas navigation.
- Course catalogue and protected provider preview/apply workflow; apply is bound to previewed course IDs.
- Read-only Marketing Library with honest local-preview/static-asset provenance.
- Read-only Partner Request Operations with evidence-only checklist and unavailable decision submission.
- Deterministic Reports foundation (`golfriend.admin.operations-report.v1`, version 1) with TXT/CSV/JSON local export and disabled transmitter.
- Typed B5-R9 commissioning contracts and an immutable Admin readiness registry. Contract-ready means the validation boundary exists; it does not mean the capability is commissioned.
- Booking, Advertising and OEM/Exchange remain routed only to their pre-existing approved/quarantined boundaries; this batch does not change their authority.

## Sources and missing contracts

- Trusted: server-authorized Course callable boundary; repository precommission/source gates; verified repository static assets/routes.
- Local preview, excluded from production totals: Marketing and Partner fixtures.
- Missing adapters: partner request/decision service, marketing storage/export adapter, Lane C booking reporting provider, advertising/OEM reporting providers, service-health provider, Golfriend-to-JHCC transmitter.

No approvals, publishing, partner accounts, messages, financial totals, provider delivery, automatic reporting, deployment or commissioning are claimed.

## Commissioning matrix

All default adapters are null/unavailable. No row is commissioned in this build. Build evidence is the repository build identifier `B5-R9@5785be1`, not an external-service timestamp.

| Capability | Current truthful state | Contract / schema | Trusted owner or source | Prerequisites | Security / authorization | Smoke test required after commissioning | Rollback / disable | James or future-provider decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `marketing.asset-storage` | unavailable | `golfriend.admin.marketing-asset-operation` v1 | B5-R5 read-only catalogue only; storage owner absent | Storage owner; retention and malware policy; audit sink | Server-authorized storage adapter and scoped Admin permission | Upload, retrieve, export, audit, and retry with one idempotency key | Remove adapter injection and return to read-only catalogue | Choose storage owner, retention, export, and approval policies |
| `partners.request-intake` | local_preview | `golfriend.admin.partner-request-intake` v1 | B5-R6 labelled local-preview provider | Approved request source; evidence access; data minimization review | Least-privilege read service; protected evidence access audit | Load one redacted request and authorized evidence; verify unavailable fallback | Remove provider injection and expose labelled preview/unavailable state | Choose system of record and necessary contact/evidence fields |
| `partners.decision-submit` | unavailable | `golfriend.admin.partner-decision` v1 | No decision service; B5-R6 preview only | Decision service; role policy; immutable audit; notification owner | Authorized Admin confirmation through server service | Preview, confirm once, repeat same idempotency key, inspect one trusted result | Disable decision adapter; preserve preview/copy/export | Approve decision authority, status model, and notification ownership |
| `courses.preview-apply` | contract_ready | `golfriend.admin.course-preview-apply` v1 | B5-R4 server-authorized boundary | Approved deployed callable; preview TTL; authorized-environment test | Authorized Admin role; exact preview ID and course-ID reconciliation | Preview known IDs, reject mismatch, apply once, retry without duplicate writes | Disable injected apply adapter; retain local preview | Approve environment, role, TTL, and operational rollback procedure |
| `booking.report-ingest` | contract_ready | `golfriend.admin.booking-report-ingestion` v1 | Lane C-owned future provider; currently absent | Lane C contract; source timestamp/digest; minimization review | Read-only Admin ingestion; no Lane C source import | Ingest immutable fixture through provider; reconcile digest and excluded totals | Remove provider; mark section source unavailable | Lane C owner decides report schema, cadence, and allowed fields |
| `advertising-oem.report-ingest` | contract_ready | `golfriend.admin.advertising-oem-report-ingestion` v1 | Future Advertising/OEM source owners | Domain owners; schemas; trusted timestamps/digests | Read-only domain adapters | Ingest each domain fixture; verify no campaign-delivery or activation claim | Remove domain adapter; mark section unavailable | Domain owners decide metrics, freshness, and semantics |
| `service-health.report-ingest` | contract_ready | `golfriend.admin.service-health-report-ingestion` v1 | Future observability owner | Health semantics; freshness threshold; source owner | Read-only observability scope | Test healthy/degraded/unavailable/unknown and stale source; never coerce unknown | Remove adapter; display unknown/source unavailable | Choose observability owner, freshness, and health definitions |
| `jhcc.report-transmit` | contract_ready | `golfriend.admin.jhcc-report-transmission` v1 using `golfriend.admin.operations-report.v1` | B5-R7 local report generator; transmitter null | Approved Golfriend-to-JHCC contract; transmitter; authorization; receipt policy | Explicit confirmation plus stable idempotency key | Validate payload, confirm once, obtain trusted receipt, retry without duplicate delivery | Remove transmitter injection; local preview/validation/export remain | James/JHCC owner decides contract, authority, receipt, and disable procedure |

Golfriend Admin manages Golfriend. JHCC manages Jaidee Holding. The matrix defines only future integration boundaries: it creates no credentials, endpoints, schedules, background jobs, external writes, or commissioning claim. Golfriend does not sell tee times or process tee-time payments.

## Remaining verification

- Authorized deployed-environment smoke test and real data-provider integration after contracts are approved.
- Physical-device and assistive-technology review at 320/390/768/desktop widths.
- The production bundle remains about 1.17 MB before gzip. Legacy statically imported Admin/Portal modules dominate it; scoped splitting was not attempted because it would cross the B5-R8/B5-R9 ownership boundary. A later route-level architecture slice should address it with dedicated regression coverage.
