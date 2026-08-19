# Golf API calibration deployment evidence

This directory records the sanitized deployment and disabled activation binding for calibration capability commit `f8d394c1f824daa9384271f74091ede97ae87499` in Firebase project `golfriend-v2`.

The packet contains only Secret Manager metadata, Firestore operational metadata, Cloud Functions/Run revision identities, and Cloud Scheduler states. It contains no secret value, access token, provider response body, user data, calibration call, canary call, or provider request.

Verify from the repository root:

```powershell
node audit/golf-api-calibration/rotation-2-966a351cee0f7ed4/verify.mjs
node --test audit/golf-api-calibration/rotation-2-966a351cee0f7ed4/verify.test.mjs
```

`calibrationRequestsAllowed` was absent in the pre-existing configuration document and therefore remains effectively false; it was not added because the authorized binding operation was restricted to `bindingReceiptId`, `requiredSecretVersion`, and `updatedAt`.
