#!/usr/bin/env node
// Read-only V2 control-plane evidence. It intentionally performs GET requests
// only and never reads a Secret Manager payload or any Firestore document.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT='golfriend-v2';
const REGION='asia-southeast1';
const EXPECTED_FUNCTIONS=[
  'armGolfApiCalibrationCanary', 'getGolfApiCatalogueStatus',
  'reconcileGolfApiPendingSettlements', 'runGolfApiCalibrationCanary',
  'scheduledGolfApiCatalogueCanary', 'scheduledGolfApiCatalogueCountReceipt',
  'scheduledGolfApiCatalogueIncremental', 'scheduledGolfApiCatalogueRetries',
  'searchGolfApiCatalogue',
].sort();
const SCHEDULED=EXPECTED_FUNCTIONS.filter((name) => name.startsWith('scheduledGolfApiCatalogue'));
const auth = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
const scopes = Array.isArray(account.tokens.scopes) ? account.tokens.scopes : String(account.tokens.scope || '').split(/\s+/).filter(Boolean);
const credential = await auth.getAccessToken(account.tokens.refresh_token, scopes);

async function read(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${credential.access_token}` } });
  const body = await response.text();
  if (!response.ok) throw new Error(`READ_${response.status}:${body.slice(0, 160)}`);
  return body ? JSON.parse(body) : {};
}

const [functionPage, schedulerPage, secret, failuresIndexes, reservationsIndexes] = await Promise.all([
  read(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100`),
  read(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs?pageSize=500`),
  read(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GOLF_API_KEY/versions/2`),
  read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/course_catalogue_failures/indexes`),
  read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/golf_api_quota_reservations/indexes`),
]);

const functions = (functionPage.functions || [])
  .filter((item) => item.labels?.['firebase-functions-codebase'] === 'course-catalogue')
  .map((item) => ({
    id: item.name?.split('/').pop(), state: item.state, runtime: item.buildConfig?.runtime,
    service: item.serviceConfig?.service?.split('/').pop(), revision: item.serviceConfig?.revision,
    secretVersion: (item.serviceConfig?.secretEnvironmentVariables || []).find((value) => value.key === 'GOLF_API_KEY')?.version ?? null,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const deployed = functions.map((item) => item.id);
const missingFunctions = EXPECTED_FUNCTIONS.filter((name) => !deployed.includes(name));
const unexpectedFunctions = deployed.filter((name) => !EXPECTED_FUNCTIONS.includes(name));
const jobs = SCHEDULED.map((name) => {
  const matches = (schedulerPage.jobs || []).filter((job) => job.name?.toLowerCase().includes(name.toLowerCase()));
  return { function: name, matches: matches.map((job) => ({ id: job.name, state: job.state, schedule: job.schedule, timeZone: job.timeZone })) };
});
const indexes = [
  ['course_catalogue_failures', 'retryState', 'nextRetryAt', failuresIndexes.indexes || []],
  ['golf_api_quota_reservations', 'status', 'expiresAt', reservationsIndexes.indexes || []],
].map(([collectionGroup, first, second, candidates]) => {
  const match = candidates.find((item) => item.fields?.[0]?.fieldPath === first && item.fields?.[1]?.fieldPath === second);
  return { collectionGroup, fields: [first, second], state: match?.state ?? 'MISSING', id: match?.name ?? null };
});

console.log(JSON.stringify({
  project: PROJECT,
  region: REGION,
  readOnly: true,
  providerRequests: 0,
  firestoreWrites: 0,
  secret: { name: 'GOLF_API_KEY', version: '2', state: secret.state, nameMetadata: secret.name },
  functions, missingFunctions, unexpectedFunctions, jobs, indexes,
}, null, 2));
