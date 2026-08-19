'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');

// Fail-closed compatibility endpoint. Secret inspection and provider access are
// exclusively owned by the course-catalogue rotation gate.
exports.verifyGolfApiSecretBinding = onCall({
  region: 'asia-southeast1',
  enforceAppCheck: true,
}, async () => {
  throw new HttpsError('unavailable', 'PROVIDER_CONTROL_PATH_RETIRED');
});
