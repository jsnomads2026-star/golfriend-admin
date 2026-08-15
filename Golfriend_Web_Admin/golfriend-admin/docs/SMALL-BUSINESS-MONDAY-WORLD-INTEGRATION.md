# Small Business Monday Test World

Test-only producer namespace `small_business`. It consumes, never recreates, the 12 identities from Example World commit `ce37bf542d771520198695450b7bab3ac3e78c16` (contract SHA-256 `f453a4d4ec3a6315b320a01ef30eb0964757f286eff9d06e12631e1b0a71d357`).

Commands: set `SMALL_BUSINESS_TEST_MODE=1`, then run `npm.cmd run verify:small-business-monday-world`; use `node scripts/small-business-monday-world.mjs seed|reset|reseed --output=<test-owned-directory>`. Production credentials make every seed/reset command fail closed.

Integration order: verify core Example World; verify this source HEAD and `packageDigest()`; register namespace without copying identities; mount `projections.app` and `projections.portal` through consumer-owned test adapters; run composite determinism and privacy gates. App receives active/trial public profiles only, suspended saved records are tombstones, nearby is unavailable, and all journeys return to `/v2`. JHCC is preparation-only.

Economy uses `enterprise_economy_config/current`; the fixture contains no fee, trial-duration, or Tee-rate value. Payment, messages, visit evidence, provider calls, production writes, commissions, wallet changes, settlement, and recognized revenue are disabled. Remaining production owners: Economy configuration, subscription/payment provider, consented message transport, visit evidence, App discovery, Portal release, and JHCC transmission policy.
