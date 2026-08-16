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

All default adapters are null/unavailable. No row is commissioned in this build. Build evidence
for the original eight rows is the repository build identifier `B5-R9@5785be1`; the four
Founder-ratified acquisition rows added 2026-08-15 carry `B5-R13@df52da6`. Neither is an
external-service timestamp. Appending the acquisition rows did not reorder, rename or re-evidence
any of the frozen eight — asserted in `commissioning-readiness-verify.mjs` and `admin-release-gate.mjs`.

| Capability | Current truthful state | Contract / schema | Trusted owner or source | Prerequisites | Security / authorization | Smoke test required after commissioning | Rollback / disable | James or future-provider decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `marketing.asset-storage` | unavailable | `golfriend.admin.marketing-asset-operation` v1 | B5-R5 read-only catalogue only; storage owner absent | Storage owner; retention and malware policy; audit sink | Server-authorized storage adapter and scoped Admin permission | Upload, retrieve, export, audit, and retry with one idempotency key | Remove adapter injection and return to read-only catalogue | Choose storage owner, retention, export, and approval policies |
| `partners.request-intake` | local_preview | `golfriend.admin.partner-request-intake` v1 | B5-R6 labelled local-preview provider | Approved request source; evidence access; data minimization review | Least-privilege read service; protected evidence access audit | Load one redacted request and authorized evidence; verify unavailable fallback | Remove provider injection and expose labelled preview/unavailable state | Choose system of record and necessary contact/evidence fields |
| `partners.decision-submit` | unavailable | `golfriend.admin.partner-decision` v1 | No decision service; B5-R6 preview only | Decision service; role policy; immutable audit; notification owner | Authorized Admin confirmation through server service | Preview, confirm once, repeat same idempotency key, inspect one trusted result | Disable decision adapter; preserve preview/copy/export | Approve decision authority, status model, and notification ownership |
| `courses.preview-apply` | contract_ready | `golfriend.admin.course-preview-apply` v1 | B5-R4 server-authorized boundary | Approved deployed callable; preview TTL; authorized-environment test | Authorized Admin role; exact preview ID and course-ID reconciliation | Preview known IDs, reject mismatch, apply once, retry without duplicate writes | Disable injected apply adapter; retain local preview | Approve environment, role, TTL, and operational rollback procedure |
| `booking.report-ingest` | contract_ready | `golfriend.admin.booking-report-ingestion` v1 | Lane C-owned future provider; currently absent | Lane C contract; source timestamp/digest; minimization review | Read-only Admin ingestion; no Lane C source import | Ingest immutable fixture through provider; reconcile digest and excluded totals | Remove provider; mark section source unavailable | Lane C owner decides report schema, cadence, and allowed fields |
| `advertising-oem.report-ingest` | contract_ready | `golfriend.admin.advertising-oem-report-ingestion` v1 | Future Advertising/OEM source owners | Domain owners; schemas; trusted timestamps/digests | Read-only domain adapters | Ingest each domain fixture; verify no campaign-delivery or activation claim | Remove domain adapter; mark section unavailable | Domain owners decide metrics, freshness, and semantics |
| `service-health.report-ingest` | contract_ready | `golfriend.admin.service-health-report-ingestion` v1 | Future observability owner | Health semantics; freshness threshold; source owner | Read-only observability scope | Test healthy/degraded/unavailable/unknown and stale source; never coerce unknown | Remove adapter; display unknown/source unavailable | Choose observability owner, freshness, and health definitions |
| `acquisition.prospect-registry` | local_preview | `golfriend.admin.acquisition-prospect-registry` v1 | B5-R10 labelled local-preview provider | Approved acquisition source; data minimization review | Least-privilege read; outbound allowlist enforced | Load one redacted registry page; verify unavailable fallback | Remove provider injection; return to labelled preview | Choose the system of record and the necessary contact fields |
| `acquisition.opportunity-report` | contract_ready | `golfriend.admin.course-opportunity-evidence` v1 | B5-R11 deterministic evidence contract | Approved distribution channel; retention policy | Local generation only; no distribution path | Generate, export, and confirm no invoice or unattributed claim | Remove the distribution adapter; local export remains | Approve evidence content and how a course receives it |
| `acquisition.analytics` | local_preview | `golfriend.admin.course-acquisition-report` v1 | B5-R12 aggregation over labelled preview rows | Approved acquisition source; threshold ratification | Read-only aggregation | Aggregate a fixture; verify suppression and coverage | Remove the source; analytics revert to preview | Ratify the aggregation threshold and attribution source |
| `acquisition.outreach-tracking` | unavailable | `golfriend.admin.acquisition-outreach-tracking` v1 | B5-R11 draft generation with a null outreach adapter | Approved outreach adapter; human approval workflow; consent review | Explicit recipient selection plus human approval | Queue one draft for approval; verify nothing is sent | Remove the adapter; drafts stay local | Approve the delivery owner, consent basis and retention |
| `jhcc.report-transmit` | contract_ready | `golfriend.admin.jhcc-report-transmission` v1 using `golfriend.admin.operations-report.v1` | B5-R7 local report generator; transmitter null | Approved Golfriend-to-JHCC contract; transmitter; authorization; receipt policy | Explicit confirmation plus stable idempotency key | Validate payload, confirm once, obtain trusted receipt, retry without duplicate delivery | Remove transmitter injection; local preview/validation/export remain | James/JHCC owner decides contract, authority, receipt, and disable procedure |

Golfriend Admin manages Golfriend. JHCC manages Jaidee Holding. The matrix defines only future integration boundaries: it creates no credentials, endpoints, schedules, background jobs, external writes, or commissioning claim. Golfriend does not sell tee times or process tee-time payments.

## B5-R10 through B5-R12 — Enterprise course acquisition and opportunity reporting

Outbound acquisition of **unsigned** courses, mounted inside the existing eight-area
allowlist (`partners` and `reports`). No new area and no new commissioning capability
row: the matrix above is unchanged and still has exactly eight rows.

- **B5-R10 acquisition registry** — prospect/course registry with outreach stage,
  contact history, contract/pilot visibility and a conversion handoff into the
  recorded `partner_submissions` intake pipeline. The handoff is a preview: it grants
  no partner status and staff provisioning stays authoritative.
- **B5-R11 outreach and opportunity evidence** —
  `golfriend.admin.course-opportunity-evidence.v1` v1, plus five outreach draft kinds
  across all eight canonical locales. Drafts are generated and exportable; there is no
  transport and the send control is permanently disabled.
- **B5-R12 acquisition analytics and JHCC contract** —
  `golfriend.admin.course-acquisition-report.v1` v1, transmitted under
  `golfriend.admin.jhcc-acquisition-report-transmission.v1`. Transmitter is null.

### Invariants enforced in code and asserted by the gates

- An unsigned course receives opportunity evidence, never an invoice. No price,
  currency or commission amount appears in any acquisition analytics payload.
- A commission is reported effective only with a signed agreement, a stated effective
  date covering the evaluation day, and verified activation. Commercial eligibility is
  owned by the partner-onboarding domain (`golfriend.course-partner.v1`); Admin reports
  it and can never confer it.
- Confirmed bookings and played rounds are withheld as *not claimed* unless the demand
  source is authoritatively attributed. A country rollup takes the weakest attribution
  of its inputs, and a total built from a subset of courses is reported as partial.
- Aggregates below the minimum stay suppressed even under authoritative attribution.
- Outbound artifacts are built from a shareable projection only — no member identity,
  internal contact detail, owner or internal note can appear.
- JHCC delivery is fail-closed twice over: it requires an approved, effective-dated
  authorization record, and every payload is screened for prohibited fields and
  personal value patterns. A payload failing screening is never deliverable.

- Registry free text is screened before it reaches any outbound artifact or the analytics,
  and a value that fails screening is replaced rather than emitted.

**Known privacy limit (not solved by code):** the screen catches structured identifiers —
email addresses, telephone runs, coordinates, IP addresses. A bare personal name in a free-text
field is not mechanically detectable and will pass the screen.

**Founder ruling, 2026-08-15 — free-text minimization.** This limit is now bounded structurally
rather than by detection. Outbound opportunity reports, JHCC payloads and automated outreach
artifacts carry **allowlisted structured fields only** (`OUTBOUND_FIELD_ALLOWLIST`); registry
free text and contact-history narrative never cross the boundary, and contact history is reduced
to a count and a date. A personal name may appear **only** in an explicitly selected
recipient/contact field of a draft awaiting human approval (`recipientContact`, opt-in), and
never in analytics or aggregated evidence.

### Founder release, 2026-08-15

- Four capabilities ratified and added to the matrix in lockstep, all uncommissioned.
- Privacy-safe JHCC acquisition contract `GOLFRIEND-JHCC-ACQUISITION-2026-08-15`, effective
  2026-08-15, **aggregate oversight only**: prospect counts/status, country/course coverage,
  opportunity-report generation counts, Portal conversion status, completeness/partial-coverage
  flags. Personal names, email, phone, coordinates, IP, free text, private notes, booking
  identity and raw contact history are prohibited and excluded by construction — the payload is
  built from counts, not from rows.
- **Transmission remains disabled.** Delivery now requires all three of a clean privacy screen,
  an approved effective-dated authorization, and a **mounted transmitter**. The authorization is
  on record; the transmitter is null, so `deliverable` is false.
- Four fail-closed adapter interfaces (`acquisitionAdapters.mjs`): acquisition data source,
  outreach delivery, Portal conversion handoff, JHCC transmitter. Every production adapter is
  null and resolves to `ADAPTER_UNAVAILABLE` as a non-retryable refusal. A mounted **preview**
  adapter still cannot send — outreach may only queue for human approval — and a conversion
  adapter claiming `active_partner` cannot grant partner status.

Verifier: `verify:acquisition-adapters`, wired into `gate:admin-v2`.

Verifiers: `verify:course-acquisition`, `verify:course-opportunity`,
`verify:acquisition-reporting`, all wired into `gate:admin-v2`.

**Not claimed:** no approved acquisition data source, no outreach or handoff service,
no JHCC authorization record, no transmitter, no delivery and no commissioning. All
providers are labelled local preview and excluded from production totals.

## Remaining verification

- Authorized deployed-environment smoke test and real data-provider integration after contracts are approved.
- Physical-device and assistive-technology review at 320/390/768/desktop widths.
- The production bundle remains about 1.17 MB before gzip. Legacy statically imported Admin/Portal modules dominate it; scoped splitting was not attempted because it would cross the B5-R8/B5-R9 ownership boundary. A later route-level architecture slice should address it with dedicated regression coverage.
