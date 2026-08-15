# Course acquisition production commissioning runbook

This package prepares operator actions; it does not authorize or perform them. Source verification is local-only. Never run the Golf API from a health check.

## Owners and prerequisites

Assign every placeholder in `commissioning/course-acquisition.roles.json`. Security owns the secret and rotation; Backend owns callables; Firestore owns rules integration/release; Admin App owns the mounted workflow; Incident owns disable/rollback. Reviewer and approver must be different people. The acquisition operator and emergency override approver must also be different people.

The canonical rules owner is the separate `golfriend-pl001-integration` repository, file `firestore.rules`, at base `8f90c182c577fc7afb35c448725800d04a2b20e2`. That object is intentionally not copied into this Admin repository. Integrate `firestore.course-acquisition.rules.fragment` there, never deploy the fragment alone, and record the integrated and prior immutable commit, file path, SHA-256, and Firebase config in `course-acquisition.deployment.json`. Production command rendering fails while any owner, SLA, artifact, or rollback placeholder remains.

Use `node scripts/render-course-acquisition-commands.mjs prepare --template` only to inspect the template. For deploy, verification, rotation, reduction, disable, or rollback, remove `--template`; unresolved placeholders fail closed. The PowerShell helper is retained only for compatibility; on Windows its supported template invocation is `powershell -ExecutionPolicy Bypass -File scripts/render-course-acquisition-commands.ps1 -Action prepare -Template`. Production project and artifact values come only from the validated deployment manifest, never command-line substitution.

## First safe activation

1. Keep `enabled=false`.
2. Assign exact roles and confirm every unrelated or malformed role fails closed.
3. Create `GOLF_API_KEY` in Secret Manager without putting its value in a command argument, file, log or ticket.
4. Create the current UTC `golf_api_quota/{YYYY-MM}` from the validated config: schema v2, enabled false, budget 500, pacing, reserve, zero counters, current day/week buckets and version 1.
5. Integrate and deploy rules before Functions. Verify clients cannot access protected collections.
6. Deploy callables in `asia-southeast1`, Node 20, App Check enforced.
7. Run the dashboard health check and dry planner. Both consume zero Golf API calls; the planner must report `providerCalls=0` and `writes=0`.
8. Set `enabled=true` only after evidence is approved. Start with one explicitly approved candidate-only command.

## Candidate-only acquisition

An operator opens an approved plan, supplies one stable command ID and confirms the bounded country/city operation. The quota transaction must reserve first. Provider results create candidates and restricted evidence digests only. They must not write `courses`. Exact terminal replay returns the recorded result without another provider call; changed actor or payload conflicts.

## Review and approval

A reviewer records `confirm_new`, reject, request-evidence or unavailable. Duplicate signals never merge automatically. The separately assigned approver publishes only a reviewed, fresh `confirm_new` candidate whose canonical ID does not already exist. Link/merge publication remains disabled until a field-level target contract is separately approved. Publication creates a versioned canonical record, immutable receipt and before/after digest atomically.

## Quota monitoring and reconciliation

Monitor configured budget, outstanding reservations, actual completed/failed calls, released capacity, current UTC day/week buckets and overrides. Reservations expire after 15 minutes. Reconciliation derives cost from the immutable `course_provider_attempts` record; operators cannot supply cost. Absence or `not_dispatched` releases one unused reservation, while `provider_attempted` or `result_persisted` counts one failed call. Malformed evidence blocks reconciliation. Never reduce counters or delete receipts. Month reset creates a new document; no usage carries forward and prior documents remain immutable evidence.

## Provider outage and partial failure

Disable acquisition while preserving dashboard/planner reads. Missing credentials release an unused reservation. A request that reached the provider records its actual call even if parsing or candidate persistence fails. Reconcile a stranded reservation using its original month and receipt ID, not the current month. Do not retry with a new command ID until the original receipt is terminal.

## Emergency override

Only `course_quota_override_approver` may approve an override, never the acquisition operator. Each approval authorizes one acquisition command whose estimated cost may be at most 10 calls; the approval is consumed by that first command. At most two approvals may be issued per UTC month. Overrides cannot exceed the monthly budget plus the configured emergency reserve, cannot hide previous usage, and are immutable/revocable before use. Record reason, expiry, approver and payload digest without private provider data.

## Key rotation

`GOLF_API_KEY` is a pre-existing shared secret consumed by `acquireCourseCandidates`, `nightlyCourseHealer`, and `syncCoursesFromProvider`. Rotation therefore requires the assigned shared-provider owner and must redeploy and verify all three consumers before disabling the prior version. Set acquisition `enabled=false`, wait for or reconcile every reservation, add the new version from standard input, redeploy all three consumers, execute their zero-provider-call metadata/health checks, then re-enable acquisition. Never print or read back secret values. Roll back by re-enabling the previous version and restoring the recorded prior revisions for every consumer.

## Reducing quota from 500 to 100

Validate the same source config with `configuredBudget=100`. If current reserved plus actual usage exceeds `100 - emergencyReserve`, disable acquisition and wait for reconciliation or the next UTC month; never erase usage. Keep pacing and override bounds internally consistent, create the next month’s document at 100, verify locally, and enable only after approval.

## Disable

Set the current quota document `enabled=false`; revoke the operator and override roles; leave dashboard/planner read-only. This is the acquisition kill switch. It does not delete candidates, receipts, audits or canonical courses and does not claim to undo published facts.

## Rollback

1. Disable acquisition and capture in-flight receipt IDs.
2. Reconcile only with verified provider/candidate evidence.
3. Restore the recorded previous Functions revision.
4. Restore the recorded previous canonical Firestore rules release—not the standalone fragment.
5. Restore the previous Secret Manager version if rotation caused the incident.
6. Verify Auth, App Check, rules denials, dashboard health and zero-write planner.
7. Never delete immutable quota, review, publication or correction receipts. Canonical data correction uses a new reviewed version; it is not a destructive rollback.

## Post-deployment zero-call verification

Use `node scripts/render-course-acquisition-commands.mjs verify`. It renders describe commands for all eight callables, Secret Manager metadata, the integrated rules digest check, disabled quota evidence, and the two permitted authenticated read-only callable checks. It never executes them. Dashboard reads and dry planner calls require explicit production-read approval; neither invokes Golf API. Do not invoke `acquireCourseCandidates` as a smoke test.

Retention/cleanup schedules for candidates, provider evidence and receipts are not invented here. The named Firestore/Legal owners must approve them separately.
