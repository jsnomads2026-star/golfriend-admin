# Course-catalogue import ledger — 2026-09-05

Founder ruling: blob-level import at identified commits (option 1). Records what was imported, what
was excluded, and who owns each excluded contract. Nothing here was deployed.

Canonical baseline: `claude/catalogue-rebaseline-20260905`, cut clean from `b5a11ee` on
`codex/production-country-writer-contract-20260829`, repo `github.com/jsnomads2026-star/golfriend-admin`.

## Imported files — blob-verified

Every blob below was verified with `git hash-object` against `git rev-parse <commit>:<path>`.
All paths are `Golfriend_Web_Admin/golfriend-admin/functions-course-catalogue/`.

| file | commit | blob | bytes | serves |
|---|---|---|---|---|
| `activationCapability.js` | `ee3961b` | `1a79f37ce1cf375166105e48cd326784e8598bb5` | 1832 | `activateCourseCatalogue` |
| `courseAcquisitionRequest.js` | `9a66695` | `f98d7bd919084430fdb8b31341a35d66f1b82927` | 1248 | `requestGolfApiCourseAcquisition`, `scheduledGolfApiCourseAcquisitionWorker` |
| `launchMarkets.js` | `9a66695` | `66de88b943b1e03a319637be46fb9ee3c9367faa` | 353 | acquisition support |

Source branch for all three: `codex/catalogue-contract-integration`.

Also imported: `activationCapability.test.js` (`ee3961b`), `courseAcquisition.integration.test.js`
and `integrationContract.test.js` (`9a66695`), `courseAcquisitionRuntime.test.js` (`a4421f9`), and
two additive deny-all rules in `enterprise-authority.firestore.rules` (`9a66695`) covering
`course_acquisition_requests` and `course_acquisition_receipts` — the security contract of the
imported callable.

Production identities these correspond to, all GEN_2 / nodejs20 / asia-southeast1 / ACTIVE,
codebase `course-catalogue`:

- `activatecoursecatalogue-00002-how`
- `requestgolfapicourseacquisition-00001-rer`
- `scheduledgolfapicourseacquisitionworker-00003-hoq`

## The wiring is authored, not inherited

The three source commits could not be cherry-picked: `9a66695` conflicts on five files, and
`df9e480` redefines `scheduledCourseCountryIngestionWorker` to `every 7 days` while production runs
it **every 5 minutes**. Both worker redefinitions are excluded per founder ruling; the baseline's
5-minute definition is untouched and asserted by `deploymentSurvival.test.js`.

What was spliced into `index.js`, all additive:

- `COUNTRY_ACQUISITION_REVISION_SERVICES` appended to the const line
- `configuration()` gains exactly one key, `acquisitionRequestsAllowed`; drops none
- `verifyActivation` gains a `services` parameter defaulting to the existing constant
- five new helpers: `activeAdminOrDirector`, `deploymentAccessToken`, `deploymentRead`,
  `loadLiveActivationBindings`, `activateCourseCatalogue`
- `runCourseAcquisitionWorker` (df9e480 version, the later of two)
- three exports

Placement is deliberate. The imported suites slice `index.js` between anchors, so the helper block
sits immediately before `configuration()` and `runCourseAcquisitionWorker` sits after
`reconcileExpiredReservations` — `activationCapability.test.js` asserts that the
`loadLiveActivationBindings..reconcileExpiredReservations` slice makes no `provider(` call.

## TWO LINEAGES ARE LIVE IN THIS CODEBASE AT ONCE

This is the general finding, not a detail about one function.

**A scoped deploy does not reconcile a codebase.** `firebase deploy --only
functions:<codebase>:<name>` updates the named function and leaves every other function in that
codebase exactly as it was — including functions built from source that no longer exists anywhere.
Only a codebase-level deploy reconciles, and reconciling is what deletes.

`course-catalogue` therefore runs functions from two generations simultaneously, proven by
downloading both deployed source archives from `gs://gcf-v2-sources-533338463502-asia-southeast1`:

| deployed | archive | worker cadence | `weeklyRefresh.js` | `countrySchedule` exports |
|---|---|---|---|---|
| **29 Aug** 05:02:10Z (`enableWeeklyCourseRefresh`) | `…#1787979690253689` | **every 7 days** | present | `…HOUR, DAY, WEEK, asMs` |
| **31 Aug** 02:26:42Z (`scheduledCourseCountryIngestionWorker`) | `…#1788143193161249` | **every 5 minutes** ×3 | absent | `…HOUR, DAY` |

The 31 August scoped deploy replaced the worker and left `enableWeeklyCourseRefresh` untouched,
still running its 29 August code. Had it been a codebase deploy, that function would already be gone.

**Corrected history — the seven-day behaviour is real production history, not foreign lineage.**
An earlier report of mine called it "unruled branch lineage". That was wrong. It was deployed to
production on 29 August and superseded on 31 August. The 31 August 5-minute worker remains the
observed production contract; the correction concerns provenance, not the ruling.

## EXCLUDED — function

### `enableWeeklyCourseRefresh` — UNMANAGED-PRESERVE

- **Production identity:** `enableweeklycourserefresh-00001-nit`, codebase `course-catalogue`,
  GEN_2, nodejs20, asia-southeast1, ACTIVE, deployed 29 Aug 2026 05:02:10Z, HTTPS callable with
  `enforceAppCheck`, no scheduler, no secrets, 256Mi/60s.
- **Source IS recoverable, byte-for-byte.** The deployed archive is `df9e480` exactly:
  `index.js` `bdf410f9a500d3f73f7f0fc4a2218f1c2182e364`, `weeklyRefresh.js`
  `304ec5bca8bfcbbc62ba255f579ab66432a7934d`, `countrySchedule.js`
  `c3ed9ae1b28934c9ff5a714983cdb52f71dc0128` — all identical to that commit. The local
  implementation is not a broken approximation of production; it **is** production, and is broken
  only against this baseline, whose `countrySchedule.js` (`f9769145…`) is a different file.
- **Why it is still excluded.** `weeklyRefresh.js` needs `{WEEK, asMs}` from `./countrySchedule`.
  Importing that module at `df9e480` is **not additive**: it adds `WEEK`, changes `nextDueAtMs` to
  `now + Math.max(WEEK, dueDelayMs(…))` — a seven-day floor on every country's next due time — and
  adds a `WEEKLY_REFRESH_CAP` eligibility rule. That module is shared with the **live 5-minute
  worker**, so importing it would silently reintroduce weekly scheduling semantics there.
- **Founder ruling 2026-09-05:** do not import the 29 August `countrySchedule.js` wholesale, and do
  not clean-room the callable by adding only `WEEK` and the missing exports while omitting the floor
  and cap — that recovers a callable which loads but not the semantics its name carried.
- **Owner:** weekly refresh recovery packet (scoped below).
- **Consequence, stated plainly:** a `functions:course-catalogue` codebase deploy from this baseline
  would DELETE this live function. `deploymentSurvival.test.js` records it in `NOT_COVERED` so the
  guard cannot imply the contract holds. Scoped, named deploys only while it is unmanaged.

## NOT SAFE TO REDEPLOY — `activateCourseCatalogue`

**My defect, caught at release-boundary review, and it stays visible until closed.**

The export (101B) and body (2064B) imported at `df773172` are byte-identical to production. Its
dependency is not. Compared against the deployed 29 August archive:

- **production** calls `listDeploymentFunctions(projectId, token)`, which **paginates** — up to ten
  pages of 100 — before validating activation revision bindings
- **the import** (from `ee3961b`) makes a **single unpaginated call** with `pageSize=100`

**The production fleet is 138 functions.** A first-100-only scan cannot see the whole fleet, so
`activationRevisionBindingsMatch` would be evaluated against a truncated list. Unacceptable.

`listDeploymentFunctions` does not exist in this baseline at all; a commit after `ee3961b` added it
and it was not imported.

**Ruling 2026-09-05: `activateCourseCatalogue` must not be redeployed until the imported dependency
preserves production's paginated validation across the full fleet.** The function remains live and
correct in production — this blocks a redeploy *from this baseline*, nothing else. It is listed in
`COVERED` in `deploymentSurvival.test.js` because it is exported and would survive a codebase
deploy; survivability and redeployability are different properties and only the first is asserted
there.

## SCOPED, NOT STARTED — weekly refresh recovery packet

Founder ruling: scope only, do not begin. No scheduling change may be merged or deployed as part of
the catalogue re-baseline.

1. What job does `enableWeeklyCourseRefresh` perform that the 5-minute worker does not?
2. Are the weekly cap and seven-day floor still required product or operational policy?
3. Can the weekly semantics be isolated inside the callable rather than modifying the shared
   `countrySchedule` module the live 5-minute worker uses?
4. What exact production state changes when the weekly callable runs?
5. Is it still invoked or operationally necessary? Measured evidence: exactly **two** successful
   invocations, both 29 Aug 2026 (05:25:21Z and 05:44:38Z), both HTTP 200, both from a Chrome
   browser — a person in the Admin UI — each preceded by a 204 CORS preflight. **Nothing since**, in
   a 30-day window. No errors. `platform/courseCountryRefresh` reads `enabled: true`,
   `golfriend.country-refresh-policy.v1`, last updated 28 Aug 02:36:11Z — *before* both invocations,
   so neither call changed it. Its only UI caller lives in `catalogue-contract-integration`
   (2 source files, 1 built bundle); the canonical baseline has neither function nor caller.
6. If necessary: an implementation preserving weekly semantics **without** altering the live worker.
7. If unnecessary: retirement requires separate founder approval with evidence. Absence of callers
   is not by itself sufficient — the code is unrecoverable once deleted.

## EXCLUDED — tests

Marked `{skip: '<reason>'}` in place. Assertion text is intact; nothing was deleted.

| file | test | missing dependency | owner |
|---|---|---|---|
| `courseAcquisitionRuntime.test.js` | the app can enqueue exactly one missing-course request without calling the provider | asserts `/transaction.create(requestRef/`; `requestRef` has 0 occurrences in this baseline and is not in the imported blobs | course-acquisition recovery packet |
| `courseAcquisitionRuntime.test.js` | a cached canonical provider course produces no targeted provider refetch | asserts `recordCourseAcquisitionResult(claim,{state:'cached'…})`; `recordCourseAcquisitionResult` has 0 occurrences here | course-acquisition recovery packet |
| `courseAcquisitionRuntime.test.js` | the targeted worker calls only the requested club and uses the canonical provider merge with provenance | asserts `/encodeURIComponent(claim.request.providerClubId)/` against acquisition-claim machinery absent here | course-acquisition recovery packet |
| `integrationContract.test.js` | operations projection exposes real receipts queue changes and review exceptions | asserts `/golf_api_record_quarantine/` inside `../functions-course-read/index.js`; that codebase differs between lineages | functions-course-read re-baseline packet |

All four assert on code that was never imported. None indicates a defect in an imported function:
the imported code references none of those symbols, and `node --check` passes.

`weeklyRefresh.test.js` is not listed as skipped because it was not imported at all — its subject
function is excluded above. Its three failing assertions were: the 7-day cadence (twice) and
`/await director(request)/`.

## Test results at commit

| suite | pass | fail | skipped |
|---|---|---|---|
| `activation.test.js` | 4 | 0 | 0 |
| `activationCapability.test.js` | 3 | 0 | 0 |
| `courseAcquisitionRuntime.test.js` | 1 | 0 | 3 |
| `courseAcquisition.integration.test.js` | 3 | 0 | 0 |
| `integrationContract.test.js` | 1 | 0 | 1 |
| `countryCutoverContinuation.test.js` | 4 | 0 | 0 |
| `deploymentSurvival.test.js` | 3 | 0 | 0 |

## Not done here

Not deployed. No backfill. The five functions in undeclared codebases (`golf-api`,
`country-analytics`, `cli-gcloud`) were not touched.
