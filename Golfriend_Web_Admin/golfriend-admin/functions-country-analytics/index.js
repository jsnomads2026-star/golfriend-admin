'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {aggregate, VERSION} = require('./projection');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const roles = new Set(['Director', 'Manager', 'Support']);
async function staff(request) { if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED'); const profile = await db.collection('admin_users').doc(request.auth.uid).get(), value = profile.data() || {}; if (!profile.exists || String(value.status || '').toLowerCase() !== 'active' || !roles.has(value.role)) throw new HttpsError('permission-denied', 'STAFF_OR_DIRECTOR_REQUIRED'); }
exports.getCountryOperationsProjection = onCall({region: 'asia-southeast1', enforceAppCheck: true}, async request => {
  await staff(request); const periodDays = request.data?.periodDays === 7 ? 7 : 30;
  const [users, courses, clubhouses, requests] = await Promise.all([db.collection('users').get(), db.collection('courses').get(), db.collection('clubhouses').get(), db.collection('course_acquisition_requests').get()]);
  const projection = aggregate({users: users.docs.map(item => item.data() || {}), courses: courses.docs.map(item => item.data() || {}), clubhouses: clubhouses.docs.map(item => item.data() || {}), requests: requests.docs.map(item => item.data() || {}), periodDays});
  await db.collection('country_operations_projections').doc('current').set({...projection, generatedAt: admin.firestore.Timestamp.now(), sourceCounts: {users: users.size, courses: courses.size, clubhouses: clubhouses.size, requests: requests.size}}, {merge: false});
  return projection;
});
