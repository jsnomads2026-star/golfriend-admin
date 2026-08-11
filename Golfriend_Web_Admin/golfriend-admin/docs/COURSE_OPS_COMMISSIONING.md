# Course-Operations Commissioning Journey (synthetic V2)

Executable: `npm run verify:courseops` (`scripts/course-ops-journey-verify.mjs`). Runs the
full course-operations lifecycle against the **real pure cores** (`functions/lib/courseSync.js`,
`functions/lib/bookingLogic.js`) under an **injected `v2-preview` config**, proving zero
`golfriend-v1` resolution. Local source test only — no provider, emulator, network, or deploy.

## Stages verified (24 checks)

### 0. Synthetic V2 config
Resolves `v2-preview` from injected `VITE_FIREBASE_V2_*` identities; asserts the config
carries **zero V1 identifiers** (`findV1Leaks == []`).

### 1. Provider sync (dry-run / validation / manual-lock / audit failure)
Uses `classifyCourseSync` + `isValidCoordinate`/`isValidProviderId`:
- **dry-run classifications:** broken→`updated`, already-correct→`nochange` (idempotent), provider-id mismatch→`conflict`, provider bad coords→`conflict`, no provider data→`missing`.
- **strict validation:** null-island `(0,0)` and out-of-range coords rejected; blank/`unknown` provider ids rejected.
- **manual-lock preservation:** a trusted manual correction (`manualLock`) with divergent provider data → `skipped_manual` (never silently overwritten).
- **audit-failure path:** an invalid stored provider id → `error` (never silently applied) — the write/audit path is not taken.

### 2. Inventory + availability (non-financial)
Tee-time slot carries **no price**; `isSlotBookable` = open + `bookedCount < capacity`; closed/full slots are not bookable.

### 3. Operator assignment (server-owned authority)
The claimed operator authorizes their own course; a non-operator is denied — mirroring `claimCourseOperator`/`course_operators.operatorUid`.

### 4. Non-financial booking lifecycle
`request → confirm → reject → cancel → message → audit` via `statusAfter`/`seatDeltaFor`/`applySeatDelta`/`isNonFinancialBooking`: request reserves a seat (→ pending), confirm keeps it (no money), reject/cancel release the seat (**no refund** — nothing was charged), messages are communicative, and the audit trail is append-only + non-financial.

### Whole-run proof
The entire synthetic state (config + slot + operator + booking + messages + audit) contains **no `golfriend-v1` identifier**.

## Ties to the rest of the commissioning package
- Route/role auth: `PORTAL_AUTH_JOURNEY.md` + `verify:roles` + `gate:a11y` + `verify:guards`.
- Authority/rules: `AUTHORITY_MANIFEST.md` + `LANEB_RULES_HANDOFF.md`.
- V2 target: `FIREBASE_V1V2_INVENTORY.md` + `V2_MIGRATION_CHECKLIST.md` + `gate:v2`.
- Blank project: `BLANK_PROJECT_MANIFEST.md`. Ledger: `LANEC_LEDGER.json`.
- Full suite: `npm run gate`.
