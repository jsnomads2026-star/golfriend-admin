# Course-catalogue production cutover boundary

The only permitted course-catalogue production target is
`golfriend-v2-production-2ee34`. The default Firebase alias remains
`golfriend-v1` for unrelated Admin work. Never use an unqualified Firebase
command or the former `golfriend-v2` target for catalogue deployment,
evidence, activation, or controlled runs.

Run local guards before an approved deployment:

```powershell
npm.cmd run test:course-catalogue-deployment-target
npm.cmd run verify:course-catalogue-predeploy
npm.cmd run verify:course-catalogue-admin
npm.cmd run preflight:course-catalogue:production
```

Read-only production control-plane evidence (GET metadata only; no provider
request, Secret Manager payload access, Firestore document read, or write):

```powershell
npm.cmd run evidence:course-catalogue:production
```

The only safe first-phase production deployment excludes every `onSchedule`
export and deploys the Firestore controls plus callable catalogue Functions:

```powershell
npm.cmd run deploy:course-catalogue:production:callables
```

Do not use a codebase-wide `functions:course-catalogue` deploy. It would
create missing Scheduler jobs enabled. Scheduler registration is a separate
future step and requires both explicit authorization and verified pre-existing
paused jobs:

```powershell
npm.cmd run register:course-catalogue:production:schedulers -- --execute=SCHEDULER_REGISTRATION_APPROVED --paused-jobs-confirmed=true
```

The first bounded update is Scheduler-owned. Only after target evidence,
disabled-to-enabled activation approval, and scheduler ownership confirmation:

```powershell
npm.cmd run run:course-catalogue:production:controlled-incremental -- --max-provider-requests=10 --max-course-writes=2 --execute=APPROVED_CONTROLLED_INCREMENTAL
```

The runtime accepts only the fixed 8-page/2-detail activation SLO. A cold
incremental run is therefore bounded to at most 10 provider requests and two
canonical course writes; quota, checkpoint, lease, and revision-bound
activation checks remain server authoritative. This command does not modify
those bounds and must not be used to activate the pipeline.
