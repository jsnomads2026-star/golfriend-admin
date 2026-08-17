'use strict';
const {createHash} = require('node:crypto');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const golfApiKey = defineSecret('GOLF_API_KEY');

exports.verifyGolfApiSecretBinding = onCall({region: 'asia-southeast1', enforceAppCheck: true, secrets: [golfApiKey]}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'AUTH_REQUIRED');
  const actor = await db.collection('admin_users').doc(request.auth.uid).get();
  if (!actor.exists || actor.data()?.role !== 'Director' || actor.data()?.status !== 'Active') throw new HttpsError('permission-denied', 'DIRECTOR_REQUIRED');
  const value = golfApiKey.value();
  if (!value || value.includes('\r') || value.includes('\n')) throw new HttpsError('failed-precondition', 'SECRET_BINDING_INVALID');
  return {schema: 'golfriend.provider-secret-binding-check.v1', configured: true, fingerprint: createHash('sha256').update(value).digest('hex'), providerRequests: 0};
});
