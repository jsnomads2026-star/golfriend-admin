'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function activeDirector(value) {
  return value && value.role === 'Director' && value.status === 'Active';
}
async function director(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const record = await db.collection('admin_users').doc(request.auth.uid).get();
  if (!record.exists || !activeDirector(record.data())) throw new HttpsError('permission-denied', 'DIRECTOR_REQUIRED');
}

exports.getCourseAcquisitionDashboard = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await director(request);
  const [courses, quarantine] = await Promise.all([
    db.collection('courses').get(),
    db.collection('course_migration_quarantine').get(),
  ]);
  const countries = new Map(), providerIds = new Map();
  let canonical = 0, missingCoordinates = 0, unknownFreshness = 0;
  for (const document of courses.docs) {
    const course = document.data();
    if (course.schema !== 'golfriend.v2.course.v2' || course.courseID !== document.id) continue;
    canonical += 1;
    const providerId = String(course.providerCourseId || course.courseID);
    providerIds.set(providerId, (providerIds.get(providerId) || 0) + 1);
    if (course.coordinateValidity !== 'valid') missingCoordinates += 1;
    if (course.freshnessState === 'unknown') unknownFreshness += 1;
    const country = String(course.country || 'Unknown');
    const row = countries.get(country) || {country, canonical: 0, active: 0, fresh: 0, missingCoordinates: 0, unknownFreshness: 0, incomplete: 0};
    row.canonical += 1;
    if (course.verified === true && course.needsReview !== true) row.active += 1;
    if (course.freshnessState === 'verified') row.fresh += 1;
    if (course.freshnessState === 'unknown') row.unknownFreshness += 1;
    if (course.migrationState === 'incomplete') row.incomplete += 1;
    if (course.coordinateValidity !== 'valid') row.missingCoordinates += 1;
    countries.set(country, row);
  }
  const duplicates = [...providerIds.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
  return {
    schema: 'golfriend.course-acquisition-dashboard.v1',
    readOnly: true,
    providerRequests: 0,
    totals: {canonical, missingCoordinates, unknownFreshness, quarantine: quarantine.size, duplicates},
    countries: [...countries.values()].sort((a, b) => a.country.localeCompare(b.country)),
    quota: null,
    candidateCounts: {},
    candidates: [],
  };
});
