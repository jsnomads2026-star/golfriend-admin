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

## EXCLUDED — function

### `enableWeeklyCourseRefresh`

- **Production identity:** `enableweeklycourserefresh-00001-nit`, codebase `course-catalogue`, ACTIVE.
- **Missing dependency:** `weeklyRefresh.js` (blob `304ec5bca8bfcbbc62ba255f579ab66432a7934d`,
  `df9e480`) does `const {WEEK, asMs} = require('./countrySchedule')`. This baseline's
  `countrySchedule.js` **defines `asMs` but does not export it**, and has **no `WEEK` at all**.
  `weeklyJob()` throws `asMs is not a function`.
- **Why lineage, not defect:** the source lineage exports `{...,WEEK,asMs}`. Importing the function
  would require editing `countrySchedule.js`, a diverged file outside the four ruled for import.
- **Owner:** countrySchedule recovery packet.
- **Consequence, stated plainly:** a `functions:course-catalogue` codebase deploy from this baseline
  would DELETE this live function. `deploymentSurvival.test.js` records it in `NOT_COVERED` so the
  guard cannot imply the contract holds.

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
