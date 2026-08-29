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
  const [courses, jobs] = await Promise.all([db.collection('courses').get(), db.collection('course_country_ingestion_jobs').get()]);
  const jobsByCountry = new Map(jobs.docs.map((document) => {
    const value = document.data() || {};
    return [normalizedCountry(value.country), Object.freeze({ state: value.state || 'unavailable', cycle: Number(value.cycle || 0), nextDueAtMs: Number(value.nextDueAtMs || 0) || null, retryAtMs: Number(value.retryAtMs || 0) || null, pauseReason: value.pauseReason || null })];
  }));
  return Object.freeze({
    schema: 'golfriend.course-coverage-by-country.v2',
    countries: projectCoverageByCountry(courses.docs.map((document) => document.data())).map((coverage) => Object.freeze({ ...coverage, job: jobsByCountry.get(coverage.country) || null })),
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

exports.getCourseCountryIngestionProjection = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const [jobs, receipts, quota] = await Promise.all([
    db.collection('course_country_ingestion_jobs').get(),
    db.collection('course_country_ingestion_receipts').orderBy('recordedAt', 'desc').limit(50).get(),
    db.collection('golf_api_quota').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(1).get(),
  ]);
  const quotaValue = quota.empty ? null : quota.docs[0].data() || {};
  const quotaProjection = quotaValue && Number.isFinite(Number(quotaValue.configuredBudget)) ? Object.freeze({
    state: 'available', configuredBudget: Number(quotaValue.configuredBudget), emergencyReserve: Number(quotaValue.emergencyReserve || 0), weightedCompleted: Number(quotaValue.weightedCompleted || 0), weightedFailed: Number(quotaValue.weightedFailed || 0), weightedReserved: Number(quotaValue.weightedReserved || 0), providerReportedRemaining: Number.isFinite(Number(quotaValue.providerReportedRemaining)) ? Number(quotaValue.providerReportedRemaining) : null,
  }) : Object.freeze({state: 'unavailable'});
  return Object.freeze({
    schema: 'golfriend.course-country-ingestion-projection.v1',
    jobs: jobs.docs.map((document) => Object.freeze({id: document.id, ...document.data()})),
    receipts: receipts.docs.map((document) => Object.freeze({id: document.id, ...document.data()})),
    quota: quotaProjection,
  });
});

// Operational status is projected exclusively from the receipt-bound global
// queue.  The retired legacy collection is intentionally not read here.
exports.getCourseCountryIngestionProjection = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const [policy, jobs, receipts, cutovers, quota] = await Promise.all([
    db.collection('platform').doc('courseCountryIngestionCutover').get(),
    db.collection('course_country_ingestion_queue').orderBy('ordinal').get(),
    db.collection('course_country_ingestion_receipts').orderBy('recordedAt', 'desc').limit(50).get(),
    db.collection('course_country_ingestion_cutover_receipts').orderBy('recordedAt', 'desc').limit(5).get(),
    db.collection('golf_api_quota').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(1).get(),
  ]);
  const value = quota.empty ? {} : quota.docs[0].data() || {};
  return Object.freeze({
    schema: 'golfriend.receipt-bound-country-queue-projection.v1',
    cutover: policy.exists ? Object.freeze({state: policy.data()?.state || 'unavailable', receiptId: policy.data()?.receiptId || null}) : Object.freeze({state: 'not_started', receiptId: null}),
    jobs: jobs.docs.map(document => Object.freeze({id: document.id, ...document.data()})),
    receipts: receipts.docs.map(document => Object.freeze({id: document.id, ...document.data()})),
    cutoverReceipts: cutovers.docs.map(document => Object.freeze({id: document.id, ...document.data()})),
    quota: Object.freeze({state: Number.isFinite(Number(value.configuredBudget)) ? 'available' : 'unavailable', configuredBudget: Number(value.configuredBudget || 0), emergencyReserve: Number(value.emergencyReserve || 0), weightedCompleted: Number(value.weightedCompleted || 0), weightedFailed: Number(value.weightedFailed || 0), weightedReserved: Number(value.weightedReserved || 0), providerReportedRemaining: Number.isFinite(Number(value.providerReportedRemaining)) ? Number(value.providerReportedRemaining) : null}),
  });
});
