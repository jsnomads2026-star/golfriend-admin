'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { projectCoverageByCountry } = require('./coverage');
const { normalizedCountry } = require('./coverage');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ACTIVE_ROLES = new Set(['Director', 'Manager', 'Support']);

async function requireStaffOrDirector(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const snapshot = await db.collection('admin_users').doc(request.auth.uid).get();
  const staff = snapshot.data();
  if (!snapshot.exists || typeof staff?.status !== 'string' || staff.status.trim().toLocaleLowerCase() !== 'active' || !ACTIVE_ROLES.has(staff.role)) {
    throw new HttpsError('permission-denied', 'STAFF_OR_DIRECTOR_REQUIRED');
  }
}

exports.getCourseCoverageByCountry = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const courses = await db.collection('courses').get();
  return Object.freeze({
    schema: 'golfriend.course-coverage-by-country.v1',
    countries: projectCoverageByCountry(courses.docs.map((document) => document.data())),
  });
});
exports.planCourseCountryIngestion = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const country = normalizedCountry(request.data?.country);
  if (country === 'UNKNOWN') throw new HttpsError('failed-precondition', 'COUNTRY_UNKNOWN');
  const courses = await db.collection('courses').where('country', '>=', '').get();
  const coverage = projectCoverageByCountry(courses.docs.map((document) => document.data())).find((item) => item.country === country) || null;
  return Object.freeze({ schema: 'golfriend.country-ingestion-plan.v1', country, actionable: coverage !== null, providerCalls: 0, courseWrites: 0, coverage });
});
