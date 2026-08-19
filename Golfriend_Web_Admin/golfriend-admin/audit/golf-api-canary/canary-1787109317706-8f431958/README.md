# Golf API canary operational evidence

This directory contains a sanitized, non-secret snapshot of the successful page-only canary `canary-1787109317706-8f431958` in Firebase project `golfriend-v2`.

The packet includes only Firestore operational evidence and deployed function/scheduler metadata. It excludes secret values, access tokens, provider credentials, provider response bodies, and user data. `export-readonly.mjs` performs GET requests only and prints a fresh source snapshot to stdout; it never writes Firebase state or calls Golf API.

The reservation ID supplied for export, `20291da5-20291da5-c734-41ed-9d62-cc6600a69466`, does not exist because its prefix is duplicated. The packet records that exact failed lookup and separately includes the completed reservation `20291da5-c734-41ed-9d62-cc6600a69466` referenced by the immutable quota-evidence document.

Verify the committed packet from the repository root:

```powershell
node audit/golf-api-canary/canary-1787109317706-8f431958/verify.mjs
```

Run the positive and tamper behavioral tests:

```powershell
node --test audit/golf-api-canary/canary-1787109317706-8f431958/verify.test.mjs
```

The verifier uses the shared `functions-course-catalogue/domain.js` canonical digest implementation. It recomputes the packet, activation, canary, and derived quota-evidence digests; validates record linkage and completed settlement; verifies the request/page/detail/count contract; checks unchanged course/retry/quarantine counts; binds deployed revisions to the activation receipt; and requires all final safety gates to remain closed.
