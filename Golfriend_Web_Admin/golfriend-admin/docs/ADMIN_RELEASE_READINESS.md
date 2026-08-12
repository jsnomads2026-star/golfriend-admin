# Golfriend V2 Admin release readiness — B5-R10

Status: **ready with manual verification**. This package proves source, contract, build, and local gate readiness. It does not claim deployment, provider commissioning, production data, physical-device acceptance, or JHCC receipt.

Golfriend Admin manages Golfriend. JHCC manages Jaidee Holding.

## Commit lineage

| Slice | Commit | Purpose |
| --- | --- | --- |
| B5-R3 | `156a86ed78c020a361eae92050183a5535ed18ac` | V2 operations shell |
| B5-R4 | `8dc8a4c15eebb1dfec47663b7cb5de744317f4de` | Preview-bound Course apply |
| B5-R5 | `01f337325bc129084bc7a1f12025506891b63df6` | Marketing asset library |
| B5-R6 | `e3378c8b880bac173a5198b88669c64141651d5d` | Partner request operations |
| B5-R7 | `bbc3c7ef9cb6b6b72a88c8e66a97e3cb6dcb6470` | JHCC reporting foundation |
| B5-R8 | `5785be1da39392c66c5e892a56182985a5073479` | Integrated Admin quality gate |
| B5-R9 | `a53e9f6a4f63ffe6ee920574a40b9e8bff392bfe` | Commissioning contracts/readiness |
| B5-R10 | This document's containing commit | Final release gate and handoff; exact immutable SHA is recorded by Git and in the final execution report |

A Git commit cannot embed its own SHA without changing that SHA. The B5-R10 commit is therefore identified inside the artifact by its parent, purpose, and containing-commit relationship; `git rev-parse HEAD` is the authoritative exact value after commit.

## Admin area inventory

The allowlisted `?area=` inventory contains exactly eight areas.

| Area | Surface | Current classification |
| --- | --- | --- |
| `overview` | V2 Admin overview and operational boundaries | ready with manual verification |
| `courses` | Course catalogue and preview-bound Golf API operation | ready with manual verification; deployed-service smoke test required |
| `bookings` | Existing non-financial booking communication boundary | ready with manual verification; Lane C reporting input remains external |
| `partners` | Local-preview request review and unavailable decisions | blocked by external commissioning |
| `marketing` | Read-only local/static asset catalogue | blocked by genuine data/asset and external storage commissioning |
| `advertising` | Existing quarantined/unavailable boundary | blocked by external commissioning |
| `exchange` | Existing quarantined/unavailable OEM/Exchange boundary | blocked by external commissioning |
| `reports` | Deterministic local reports plus Commissioning Readiness | ready with manual verification; transmission blocked by external commissioning |

Unknown areas fail the allowlist and resolve safely. Unfinished legacy Admin consoles are not exposed through V2 area navigation.

## Locale matrix

Canonical locale order is exactly `en`, `th`, `ko`, `ja`, `zh`, `es`, `fr`, `de`; Arabic is not present.

| Locale | Shell/course/readiness key | Catalogue/report filtering | Release classification |
| --- | --- | --- | --- |
| `en` | present | present | ready with manual verification |
| `th` | present | present | ready with manual verification |
| `ko` | present | present | ready with manual verification |
| `ja` | present | present | ready with manual verification |
| `zh` | present | present | ready with manual verification |
| `es` | present | present | ready with manual verification |
| `fr` | present | present | ready with manual verification |
| `de` | present | present | ready with manual verification |

The selected shell locale persists while moving between Admin areas. Machine identifiers and exported JSON keys remain stable English identifiers. Marketing/Partner locale coverage reflects actual asset/request evidence and never upgrades untranslated content to complete. Human review of every long translation at 390px remains required.

## Capability and readiness registry

| Capability | State | Adapter/default | Release classification |
| --- | --- | --- | --- |
| `marketing.asset-storage` | unavailable | null | blocked by external commissioning |
| `partners.request-intake` | local_preview | null | blocked by external commissioning |
| `partners.decision-submit` | unavailable | null | blocked by external commissioning |
| `courses.preview-apply` | contract_ready | null by default; existing approved-service boundary injectable | ready with manual verification |
| `booking.report-ingest` | contract_ready | null | blocked by external commissioning |
| `advertising-oem.report-ingest` | contract_ready | null | blocked by external commissioning |
| `service-health.report-ingest` | contract_ready | null | blocked by external commissioning |
| `jhcc.report-transmit` | contract_ready | null | blocked by external commissioning |

No capability is commissioned. `contract_ready` means the typed validation boundary is ready; it does not mean a provider is active. `local_preview` is not trusted production data. Unknown health remains unknown.

## Schema and adapter inventory

All commissioning schemas are version 1:

- `golfriend.admin.marketing-asset-operation`
- `golfriend.admin.partner-request-intake`
- `golfriend.admin.partner-decision`
- `golfriend.admin.course-preview-apply`
- `golfriend.admin.booking-report-ingestion`
- `golfriend.admin.advertising-oem-report-ingestion`
- `golfriend.admin.service-health-report-ingestion`
- `golfriend.admin.jhcc-report-transmission`

The operational report remains `golfriend.admin.operations-report.v1`, version 1. All default commissioning adapters and the B5-R7 transmitter are null. Write-shaped operations require approved authorization, confirmation, idempotency, and audit behavior from an injected server-side adapter.

## Source matrix

| Source | Authority | Production totals |
| --- | --- | --- |
| Course operation callable boundary | server-authorized contract; deployment not asserted | only trusted results may be used after smoke test |
| Repository precommission controls | trusted source/build evidence | non-production operational evidence only |
| Marketing catalogue fixtures/static references | local preview or repository reference | excluded |
| Partner requests | local preview | excluded |
| Lane C booking report | unavailable external input | excluded until commissioned |
| Advertising/OEM reports | unavailable external input | excluded until commissioned |
| Service health | unavailable; status unknown | excluded; never inferred healthy |
| JHCC transmitter/receipt | unavailable | no delivery or receipt claim |

## Integration defects corrected in B5-R10

1. Readiness validation previously inspected only the built-in frozen registry. It now accepts candidate registries and rejects duplicate IDs, unsupported states, missing source evidence, and commissioned states without an adapter.
2. TXT report export previously omitted source timestamps and limitation metadata retained by JSON/CSV. TXT, CSV, and JSON now preserve source and limitation evidence, with focused regressions.

No other source defect justified a behavioral change.

## Executable release procedure

Run from `Golfriend_Web_Admin/golfriend-admin`:

```text
npm run gate:admin-release
```

The command performs source-level release assertions, TypeScript and Vite production build, the complete Lane B gate (including `gate:admin-v2` and every B5-R3–R9 verifier), and `npm audit --omit=dev`.

Validated B5-R10 result:

- Admin release source contract: pass — 8 routes, 8 locales, 8 capabilities.
- TypeScript/Vite production build: pass — 114 modules transformed.
- Full Lane B gate: pass.
- All focused Admin verifiers: pass.
- Production dependency audit: 0 vulnerabilities.
- Authority/no-write/no-secret/no-transmission and prohibited-claim scans: pass.
- Report TXT/CSV/JSON metadata reconciliation: pass.
- Registry uniqueness/state/evidence/adapter checks: pass.

## Production bundle findings

Validated Vite output:

| Artifact | Minified | Gzip |
| --- | ---: | ---: |
| `index.html` | 0.47 kB (478 bytes) | 0.30 kB |
| CSS bundle | 42.13 kB (42,136 bytes) | 8.96 kB |
| JavaScript bundle | 1,193.69 kB (1,193,699 bytes) | 339.74 kB |

The JavaScript chunk remains above Vite's 500 kB advisory threshold. Static-import inspection identifies the Firebase SDK and the broad legacy Admin/B2B/Public component graph as the primary structural contributors. Vite also reports that `firebase/storage` cannot move into a separate chunk because it is dynamically imported by `EventGenesisConsole` while statically imported by other legacy surfaces. Recharts and QR rendering are also reachable through statically imported legacy modules.

No splitting was applied. A safe refactor requires a separately owned route-level lazy-loading slice with route, auth, Firebase initialization, loading-state, and chunk regression tests. That risk is not justified in this final release gate.

## Manual browser and device checklist

Classification: **ready with manual verification**.

- Test desktop and 390px width for all eight areas, refresh, Back/Forward, and invalid `area` query values.
- Open/close the off-canvas menu using keyboard and pointer; verify focus visibility and logical order.
- Activate native buttons with Enter/Space and interactive table rows with their documented keyboard handlers.
- Verify initial dialog focus, contained Tab/Shift+Tab order, Escape close, and focus restoration for Course, Marketing, and Partner detail dialogs.
- Confirm no body overflow; tables scroll inside bounded containers; long IDs, translations, source labels, and errors remain readable.
- Confirm state meaning is not color-only and reduced-motion settings suppress nonessential transitions.
- Repeat locale switching across every area for all eight locales.
- Perform assistive-technology landmark, heading, table, warning, and accessible-name review.

## Real-data smoke-test prerequisites

Classification: **blocked by external commissioning** until each owner approves its contract.

- Authenticate with a non-email-based active Admin role; verify suspended, missing, and role-less users fail closed.
- Verify authorized Course preview uses a bounded batch, returns exact course IDs, rejects a mismatch, applies once, and handles an identical idempotent retry without duplicate writes.
- Load one redacted trusted partner request/evidence record; verify data minimization, source label, unavailable fallback, decision preview, trusted confirmation, and audit event.
- Load one approved Marketing asset; verify version, locale, provenance, authorization, retention/malware controls, and unavailable fallback.
- Ingest one immutable report from each approved provider; reconcile schema, source timestamp, digest, freshness, limitations, and exclusion rules.
- Validate one JHCC payload, explicitly confirm once, receive a trusted receipt, and retry with the same idempotency key without duplicate transmission.
- Disable each adapter and confirm the UI immediately returns to its honest unavailable/read-only state.

## Authentication and provider prerequisites

- **ready with manual verification:** server-owned active staff/Director authorization boundaries and fail-closed source gates.
- **blocked by external commissioning:** approved Marketing storage owner, authorization, retention, malware, export, and audit policies.
- **blocked by external commissioning:** Partner system of record, evidence-access policy, decision service, status authority, notification owner, and immutable audit history.
- **blocked by external commissioning:** deployed Course callable environment, preview TTL, role policy, operational rollback, and authorized smoke test.
- **blocked by external commissioning:** observability owner, health semantics, freshness threshold, and read scope.
- **requires human decision:** James/provider approval of every owner, policy, role, and commissioning evidence set.

## Cross-lane contract-only boundaries

No other lane is imported or modified.

### Lane C booking report producer

Admin expects an immutable `golfriend.admin.booking-report-ingestion` v1 envelope with schema/version, period start/end, records, trusted source timestamp, and a digest suitable for deterministic reconciliation. It is read-only input; missing data is never fabricated and Golfriend does not sell tee times or process tee-time payments. Status: **blocked by external commissioning**.

### Web Partner Portal application envelope

Admin expects a stable request ID, organization/type/region, minimized contact and locale, submitted date, requested collaboration, optional course identifiers, evidence references, source/provenance, and status history. Evidence retrieval and decisions are separate authorized services. Portal submission is not approval. Status: **blocked by external commissioning**.

### Marketing asset source

Admin expects versioned asset identity, title/category, exact locale coverage, format/status, updated/source provenance, intended channel, approval evidence, disclosure requirements, and adapter-declared preview/download support. Status: **blocked by genuine data/asset** and **blocked by external commissioning**.

### JHCC receiver/transmitter

Admin produces `golfriend.admin.operations-report.v1` and validates the future `golfriend.admin.jhcc-report-transmission` v1 envelope. Transmission requires explicit confirmation, authorization, idempotency, audit, and trusted receipt. No endpoint, credential, schedule, email, background job, send, or receipt is configured. Status: **blocked by external commissioning** and **requires human decision**.

## Rollback, merge, and deployment proposal

Rollback point: B5-R9 commit `a53e9f6a4f63ffe6ee920574a40b9e8bff392bfe`.

Proposed merge order — **not executed**:

1. Review and merge the single B5-R10 Lane B commit after manual browser/accessibility evidence is accepted.
2. Review Lane C and Web producer contracts independently; do not copy their implementations into Admin.
3. Approve and implement backend adapters as separate, owner-specific changes with server authorization and audit tests.
4. Re-run `gate:admin-release` against the final integration commit before any deployment approval.

Proposed deployment sequence — **not executed**:

1. Approve environment, authorization, data classification, retention, rollback, and smoke plans.
2. Deploy approved server-side providers with adapters disabled.
3. Run provider-specific contract and authorization smoke tests.
4. Build and deploy Admin through the approved release process.
5. Enable one adapter at a time, execute its smoke checklist, and disable immediately on reconciliation or authority failure.
6. Commission JHCC transmission last, only after payload validation, explicit confirmation, receipt, retry, and disable tests pass.

## Post-deployment smoke checklist

- Confirm the deployed build identifier and eight-area allowlist.
- Verify sign-in, role denial, sign-out, refresh, navigation history, locale persistence, desktop, and 390px behavior.
- Verify every absent adapter fails closed without a success claim.
- Reconcile Course preview/apply IDs and idempotent result.
- Reconcile all trusted report metrics to source timestamps/digests; verify preview metrics remain excluded.
- Export TXT/CSV/JSON and compare source/limitation metadata.
- Confirm unknown service health remains unknown.
- Confirm JHCC transmission remains unavailable unless separately commissioned; if commissioned, verify one trusted receipt and audit event.
- Exercise each documented disable/rollback mechanism.

## Decisions required from James

Classification: **requires human decision**.

- Accept manual desktop/390px and assistive-technology evidence.
- Approve or defer the later route-level bundle-splitting slice.
- Select owners and systems of record for Marketing, Partner, Lane C reporting, Advertising/OEM reporting, service health, and JHCC transmission.
- Approve data fields, classifications, retention, audit events, authorization roles, freshness rules, retry/timeout policies, and rollback procedures.
- Approve merge and deployment timing. No commissioning or deployment should be inferred from this source-ready package.
