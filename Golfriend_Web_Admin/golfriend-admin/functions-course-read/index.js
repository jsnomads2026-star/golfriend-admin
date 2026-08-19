'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
exports.getCourseAcquisitionDashboard = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async () => {
  throw new HttpsError('unavailable', 'FULL_COLLECTION_DASHBOARD_RETIRED_USE_CATALOGUE_STATUS');
});
