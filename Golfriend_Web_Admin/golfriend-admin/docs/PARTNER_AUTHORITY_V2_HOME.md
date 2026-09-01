# Partner Authority V2 home and contract

**Status:** accepted architecture decision. The callable-only authority and
Firestore-denial boundary are implemented locally in this source. This record
does not add a durable Storage adapter, Admin screen, Portal screen, deployment,
or data migration.

## Canonical home

V2 Partner Authority belongs in this Firebase source:

- repository: `C:\\Golfriend\\golfriend-admin-main-postmerge`
- Firebase application root: `Golfriend_Web_Admin/golfriend-admin`
- deploy target: `golfriend-v2-production-2ee34` (the sole `.firebaserc`
  `default` target)
- Functions entrypoint: `functions/src/index.ts`
- existing decision-authority primitive: `isActiveDirector` in
  `functions/src/authority.ts`, backed only by `admin_users/{uid}` with
  `role === 'Director'` and an active, non-suspended staff record.

The target must be selected explicitly by this source's canonical target
resolver and deploy configuration.  A V1 target is not a fallback and is
rejected by `npm run gate:partner-authority-source`.

## Collections and document identifiers

| Collection | Identifier | Purpose |
| --- | --- | --- |
| `partner_applications` | server-generated `applicationId` | One applicant-owned application and its lifecycle state. |
| `partner_organisations` | deterministic `organisationId = applicationId` | The one organisation created only by approval of that application. |
| `partner_memberships` | deterministic `${organisationId}_${ownerUid}` | The initial approved owner membership. |
| `partner_application_evidence` | server-generated `evidenceId` | Private evidence metadata belonging to one application. |
| `partner_authority_audit` | server-generated `auditEventId` | Append-only authority transition and replay records. |

An application has one immutable `ownerUid`.  It may have multiple evidence
records.  The deterministic organisation and membership identifiers make the
approval invariant enforceable in one server transaction: one approved
application produces exactly one organisation and exactly one owner membership
for its immutable owner.

## Minimal data contract

`partner_applications` contains applicant-editable draft data required for the
application (partnership selection, legal-business details, golf-course/club
details, and references to evidence metadata), plus server-owned
`ownerUid`, `state`, `createdAt`, `updatedAt`, `submittedAt`,
`lastDecisionAt`, `organisationId`, and transition/replay keys.  The client
never supplies or changes `state` after submission, an organisation identifier,
an owner role, a decision reason, or any audit timestamp.

`partner_organisations` is server-created at approval and minimally contains
its immutable source `applicationId`, normalised organisation display data,
`createdAt`, and `createdByUid`.  `partner_memberships` is server-created at
approval and minimally contains `organisationId`, `uid`, the literal owner
role, `createdAt`, and `createdByUid`.  No client input chooses these IDs or the
owner role.

`partner_application_evidence` stores only metadata necessary to validate and
refer to applicant evidence: `applicationId`, submitter UID, content metadata,
private object reference, server-computed SHA-256, and server timestamps.
Evidence is requested through a callable, then uploaded once to the
server-created path `partner_application_evidence/{applicationId}/{evidenceId}/original`.
The only allowed types are PDF, JPEG, and PNG; each object is at most 10 MB.
Storage Rules allow the owner to create only that exact pending path and deny
list, overwrite, and delete. Finalisation downloads the private object through
the Admin SDK, verifies type and size, computes SHA-256 server-side, and marks
the immutable evidence record `ready`. No public or download URL is created.

Authenticated owner and active-Director review access is a protected Storage
`get` only; the access callable returns no URL. A future cloud delivery signer
is outside this contract and must fail closed unless separately commissioned.

Every Partner Authority callable requires a valid Firebase App Check token in
production, before application, evidence, audit, organisation, or membership
access. The Partner Portal must be registered with the V2 Firebase project's
chosen App Check provider and initialise its App Check SDK before calling any
Partner Authority callable; this document does not configure that provider or
claim that production attestation is commissioned.

`partner_authority_audit` is append-only and contains `applicationId`, action,
actor UID, actor role, prior state, resulting state, server timestamp,
required reason where applicable, idempotency key, and replay/outcome marker.
No client-provided audit time is accepted.

## Lifecycle and authority

| Transition | Caller | Preconditions | Server effect |
| --- | --- | --- | --- |
| create/save `draft` | application owner | authenticated owner | Validates editable fields; server timestamps and owner only. |
| `draft` → `submitted` | application owner | complete required fields and valid evidence metadata | Server validation, immutable submission audit event. |
| `submitted` → `evidence_requested` | active Director only | non-empty decision reason | Immutable decision audit event. |
| `submitted` or `evidence_requested` → `declined` | active Director only | non-empty decision reason | Immutable decision audit event; no organisation or membership. |
| `submitted` or `evidence_requested` → `approved` | active Director only | decision/replay key and all approval preconditions | In one transaction: create/link exactly one organisation, create exactly one owner membership, then append the approval audit event. |

Any unlisted transition, decision by a non-Director, missing reason, duplicate
conflicting decision, or replay with a mismatched payload fails closed.
Approval is the sole creator/linker of a partner organisation and owner
membership.  It must be idempotent: replay of the same decision key returns the
recorded outcome and creates neither a second organisation nor a second
membership or decision event.

## Legacy isolation and explicit exclusions

`b2b_partners` is legacy data only.  It is neither read nor written as V2
Partner Authority, cannot satisfy an application transition, cannot grant a
membership, and cannot authorise Portal access.  A future migration may use a
one-way, read-only compatibility adapter that records an unauthoritative legacy
reference on a reviewed application; it must never make `b2b_partners` an
authority source or mutate it.

This contract expressly excludes booking lifecycle, booking interoperability,
money, payments, pricing, commissions, tee inventory, venues, staff
invitations, trials, external email, and course operations.  It also does not
invent an evidence-object Storage adapter, invitation delivery, or an Admin
decision UI schema.
