# Course-catalogue V2 deployment boundary

The default Firebase alias remains `golfriend-v1` for unrelated Admin work.
Course-catalogue deployment must always name the V2 project explicitly; never
run an unqualified Firebase deploy from this directory.

Before any approved deployment, run the local gates:

```powershell
npm.cmd run test:course-catalogue-deployment-target
npm.cmd run verify:course-catalogue-predeploy
npm.cmd run verify:course-catalogue-admin
```

Read-only V2 control-plane evidence (no provider request, Firebase write, or
secret payload access):

```powershell
npm.cmd run evidence:course-catalogue:v2
```

The only supported catalogue deployment command is:

```powershell
firebase deploy --project golfriend-v2 --only functions:course-catalogue
```

This command is a deployment and requires separate authorization. It does not
authorize a provider call, Scheduler execution, activation, or Firestore write.
