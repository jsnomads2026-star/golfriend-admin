'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { projectCoverageByCountry } = require('./coverage');
const { normalizedCountry } = require('./coverage');
const { attachCountryCoverage, projectReceiptBoundQueue } = require('./countryIngestionProjection');
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

// Operational status is projected exclusively from the receipt-bound global
// queue.  The retired legacy collection is intentionally not read here.
exports.getCourseCountryIngestionProjection = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const [policy, jobs, receipts, cutovers, courses, clubhouses] = await Promise.all([
    db.collection('platform').doc('courseCountryIngestionCutover').get(),
    db.collection('course_country_ingestion_queue').orderBy('ordinal').get(),
    db.collection('course_country_ingestion_receipts').orderBy('recordedAt', 'desc').limit(50).get(),
    db.collection('course_country_ingestion_cutover_receipts').orderBy('recordedAt', 'desc').limit(5).get(),
    db.collection('courses').get(),
    db.collection('clubhouses').get(),
  ]);
  const queue = jobs.docs.map(document => ({id: document.id, ...document.data()}));
  const immutableReceipts = receipts.docs.map(document => Object.freeze({id: document.id, ...document.data()}));
  const projection = attachCountryCoverage(projectReceiptBoundQueue(queue, immutableReceipts), courses.docs.map(document => document.data() || {}), clubhouses.docs.map(document => document.data() || {}));
  const catalogue = Object.freeze({clubhouseCount: clubhouses.size, courseLayoutCount: courses.size, needsClubhouseIdentityReviewCount: courses.docs.reduce((count, document) => count + (!document.data()?.providerClubId ? 1 : 0), 0)});
  return Object.freeze({
    schema: 'golfriend.receipt-bound-country-queue-projection.v1',
    cutover: policy.exists ? Object.freeze({state: policy.data()?.state || 'unavailable', receiptId: policy.data()?.receiptId || null}) : Object.freeze({state: 'not_started', receiptId: null}),
    jobs: projection.jobs,
    receipts: immutableReceipts,
    cutoverReceipts: cutovers.docs.map(document => Object.freeze({id: document.id, ...document.data()})),
    pipeline: projection.pipeline,
    catalogue,
  });
});

// The Admin member-request queue is deliberately independent of quota diagnostics.
// It is a Firebase-only, staff-gated projection over the durable request records and
// immutable results; no provider capability is present in this codebase.
exports.getCourseOperationsProjection = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async (request) => {
  await requireStaffOrDirector(request);
  const [requests, receipts] = await Promise.all([
    db.collection('course_acquisition_requests').orderBy('requestedAt', 'desc').limit(100).get(),
    db.collection('course_acquisition_receipts').orderBy('recordedAt', 'desc').limit(100).get(),
  ]);
  const receiptByRequest = new Map(receipts.docs.map(document => {
    const value = document.data() || {};
    return [String(value.requestId || document.id), Object.freeze({id: document.id, state: value.state || null, reason: value.reason || null, recordedAt: value.recordedAt || null})];
  }));
  return Object.freeze({
    schema: 'golfriend.course-operations-projection.v1',
    requests: requests.docs.map(document => {
      const value = document.data() || {}, receipt = receiptByRequest.get(document.id) || null;
      return Object.freeze({id: document.id, ...value, receiptId: receipt?.id || null, receiptState: receipt?.state || null, reason: value.reason || value.lastError || receipt?.reason || null});
    }),
  });
});
