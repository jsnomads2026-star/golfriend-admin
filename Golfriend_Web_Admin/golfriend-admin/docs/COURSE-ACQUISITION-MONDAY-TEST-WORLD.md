# Course Acquisition Monday Test World

This package is a deterministic, local-only fixture artifact. It never initializes Firebase, imports a provider transport, or writes outside the explicitly named local output directory. It extends—rather than replaces—the canonical Example World identity graph.

## Pinned identity authority

- Repository: `golfriend-example-world`
- Branch: `codex/example-world-mock-users`
- Commit: `ce37bf542d771520198695450b7bab3ac3e78c16`
- Contract: `test/fixtures/exampleWorldContract.js`
- Contract SHA-256: `f453a4d4ec3a6315b320a01ef30eb0964757f286eff9d06e12631e1b0a71d357`
- Reused namespace: `dev_mock`
- Reused identities: `dev_mock_ew_01` through `dev_mock_ew_12`; the immutable identity-only projection is in `test/fixtures/exampleWorldIdentityProjection.mjs`.

Staff roles are scenario-only attributes attached to those existing personas. They are not a second user store and grant no runtime authority.

## Commands

From the Admin project root:

```powershell
npm.cmd run verify:course-acquisition-monday-world
npm.cmd run seed:course-acquisition-monday-world
npm.cmd run reset:course-acquisition-monday-world
node scripts/course-acquisition-monday-world.mjs seed --test-mode --project demo-golfriend-monday --scenario quota_boundary --output .course-acquisition-monday-world
```

`seed` writes one deterministic `seed.json` below `.course-acquisition-monday-world`. `reset` deletes only that file and its now-empty owned directory. `verify` performs seed → reset → reseed, compares byte-identical artifacts and digests, then removes the output. It fails if the project is not `demo-*`/`test-*`, explicit test mode is absent, the output basename differs, or live Firebase/provider credential indicators are present.

## Consumer ownership and projection map

The generated `seed.json` is an interchange artifact; each surface owner must load it only through a test adapter and validate the named projection. Runtime imports are forbidden.

| Surface owner | Fixture path | Contract boundary | Integration rule |
|---|---|---|---|
| Admin Course Acquisition | `selected.cross_surface.states.adminQuota`, `adminCandidates`, `adminCoverage` | Existing dashboard/queue projections | Test adapter only; candidate IDs remain non-UI keys. |
| Partner Portal | `selected.cross_surface.states.portalCorrection` | `golfriend.course-correction-request.v1` | Request-only. `canonicalMutation` must remain `false`; no correction apply authority exists. |
| V2 App Course Discovery | `selected.cross_surface.states.appDiscovery` | `golfriend.course-discovery.v1` | Validate with the mounted discovery client. Public reference tokens are deterministic test tokens and must be rebound by a controlled test adapter; never use them in production. |
| V2 App enhancements | `appNearby`, `appSaved`, `appRecent` | Nearby/favorites/recents envelopes | Nearby is honestly unavailable without member-location authority. Saved/recent contain canonical public facts only. |
| JHCC | `jhccPreparation` | `golfriend.jhcc-preparation.v1` | Preparation-only; `transmissionCount` must remain zero. |

App fixture rows contain only reviewed canonical V2 course facts, display-safe provenance, freshness, coordinates, unknown availability, and an opaque test reference. They omit provider secrets, raw request IDs, staff data, quota internals, source job IDs, member IDs, signed URLs, and private evidence.

## Lifecycle boundary

The world covers acquisition, review, rejection, approval, publication, replay, stale conflict, and Portal correction submission. Portal correction is deliberately not modeled as canonical correction completion: the commissioned boundary is request-only, so applying a correction remains unavailable until a separate reviewed server authority is approved.

## Integration verification

Each consuming repository should:

1. Pin this package commit and the Example World source SHA/digest above.
2. Copy or read the generated interchange artifact through a test-only adapter.
3. Run its real response validator against its projection; do not loosen a production validator for fixtures.
4. Assert no fixture module is imported by production bundles.
5. Assert canonical IDs are keys only and are not rendered as labels.
6. Keep provider transport, Firebase Admin/client initialization, analytics transmission, and production writes absent.

No deployment, emulator, Secret Manager, provider call, quota consumption, or production-rule evidence is represented by this package.
