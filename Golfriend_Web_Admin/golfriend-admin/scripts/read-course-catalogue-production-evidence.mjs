#!/usr/bin/env node
// Read-only production control-plane evidence. It performs GET requests only;
// no Function invocation, provider request, secret payload access, or write.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT = 'golfriend-v2-production-2ee34';
const REGION = 'asia-southeast1';
const CALLABLE_FUNCTIONS = [
  'armGolfApiCalibrationCanary', 'getGolfApiCatalogueStatus',
  'reconcileGolfApiPendingSettlements', 'runGolfApiCalibrationCanary',
  'searchGolfApiCatalogue',
].sort();
const PROVIDER_CALLABLES = ['runGolfApiCalibrationCanary'];
const DEFERRED_SCHEDULED_EXPORTS = [
  'scheduledGolfApiCatalogueCanary', 'scheduledGolfApiCatalogueCountReceipt',
  'scheduledGolfApiCatalogueIncremental', 'scheduledGolfApiCatalogueRetries',
].sort();
const LEGACY_SCHEDULER = 'firebase-schedule-runGolfApiIngestion-asia-southeast1';
const MONTH = new Date().toISOString().slice(0, 7);
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const auth = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
const scopes = Array.isArray(account.tokens.scopes) ? account.tokens.scopes : String(account.tokens.scope || '').split(/\s+/).filter(Boolean);
const credential = await auth.getAccessToken(account.tokens.refresh_token, scopes);

async function read(url, missingCode = null) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${credential.access_token}` } });
  const body = await response.text();
  if (response.status === 404 && missingCode) throw new Error(missingCode);
  if (!response.ok) throw new Error(`READ_${response.status}:${body.slice(0, 160)}`);
  return body ? JSON.parse(body) : {};
}

function decode(value) {
  return value?.stringValue ?? value?.booleanValue ?? value?.timestampValue ??
    (value?.integerValue !== undefined ? Number(value.integerValue) : value?.doubleValue ??
      (value?.nullValue === null ? null : value?.mapValue ? Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)])) :
        value?.arrayValue ? (value.arrayValue.values || []).map(decode) : undefined));
}

async function document(path, missingCode) {
  const item = await read(`${ROOT}/${path}`, missingCode);
  return Object.fromEntries(Object.entries(item.fields || {}).map(([key, value]) => [key, decode(value)]));
}

const [functionPage, schedulerPage, secret, rulesRelease, config, checkpoint, quota, coursesIndexes, failuresIndexes, reservationsIndexes] = await Promise.all([
  read(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100`),
  read(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/jobs?pageSize=500`),
  read(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GOLF_API_KEY/versions/2`),
  read(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, 'FIRESTORE_RULES_RELEASE_MISSING'),
  document('platform/golfApiCatalogueConfig', 'CATALOGUE_CONFIG_MISSING'),
  document('course_acquisition_checkpoints/golf-api', 'CATALOGUE_CHECKPOINT_MISSING'),
  document(`golf_api_quota/${MONTH}`, 'CATALOGUE_QUOTA_BASELINE_MISSING'),
  read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/courses/indexes`),
  read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/course_catalogue_failures/indexes`),
  read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/golf_api_quota_reservations/indexes`),
]);

if (secret.state !== 'ENABLED') throw new Error('SECRET_VERSION_2_NOT_ENABLED');
if (!rulesRelease.rulesetName) throw new Error('FIRESTORE_RULES_RELEASE_INVALID');

const functions = (functionPage.functions || [])
  .filter((item) => item.labels?.['firebase-functions-codebase'] === 'course-catalogue')
  .map((item) => ({
    id: item.name?.split('/').pop(), state: item.state, runtime: item.buildConfig?.runtime,
    service: item.serviceConfig?.service?.split('/').pop(), revision: item.serviceConfig?.revision,
    secretVersion: (item.serviceConfig?.secretEnvironmentVariables || []).find((value) => value.key === 'GOLF_API_KEY')?.version ?? null,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const deployed = functions.map((item) => item.id);
const missingFunctions = CALLABLE_FUNCTIONS.filter((name) => !deployed.includes(name));
const unexpectedFunctions = deployed.filter((name) => !CALLABLE_FUNCTIONS.includes(name));
if (missingFunctions.length) throw new Error(`CALLABLE_FUNCTION_MISSING:${missingFunctions.join(',')}`);
if (unexpectedFunctions.length) throw new Error(`UNEXPECTED_CATALOGUE_FUNCTION:${unexpectedFunctions.join(',')}`);
if (functions.some((item) => item.state !== 'ACTIVE')) throw new Error('CATALOGUE_CALLABLE_NOT_ACTIVE');
for (const name of PROVIDER_CALLABLES) {
  const fn = functions.find((item) => item.id === name);
  if (fn?.secretVersion !== '2') throw new Error(`FUNCTION_SECRET_VERSION_MISMATCH:${name}`);
}

const jobs = schedulerPage.jobs || [];
const legacyScheduler = jobs.find((item) => item.name?.split('/').pop() === LEGACY_SCHEDULER);
if (!legacyScheduler || legacyScheduler.state !== 'PAUSED') throw new Error('LEGACY_RUN_GOLF_API_INGESTION_NOT_PAUSED');
const catalogueSchedulerJobs = jobs.filter((item) => DEFERRED_SCHEDULED_EXPORTS.some((name) => item.name?.toLowerCase().includes(name.toLowerCase())));
if (catalogueSchedulerJobs.length) throw new Error(`DEFERRED_CATALOGUE_SCHEDULER_PRESENT:${catalogueSchedulerJobs.map((item) => item.name).join(',')}`);

const indexes = [
  ['courses', 'country', 'displayName', coursesIndexes.indexes || []],
  ['courses', 'freshnessState', 'coordinateValidity', coursesIndexes.indexes || []],
  ['courses', 'migrationState', 'country', coursesIndexes.indexes || []],
  ['course_catalogue_failures', 'retryState', 'nextRetryAt', failuresIndexes.indexes || []],
  ['golf_api_quota_reservations', 'status', 'expiresAt', reservationsIndexes.indexes || []],
].map(([collectionGroup, first, second, candidates]) => {
  const match = candidates.find((item) => item.fields?.[0]?.fieldPath === first && item.fields?.[1]?.fieldPath === second);
  if (!match || match.state !== 'READY') throw new Error(`INDEX_NOT_READY:${collectionGroup}:${first}:${second}`);
  return { collectionGroup, fields: [first, second], state: match.state, id: match.name };
});

if (config.enabled !== false || config.providerRequestsAllowed !== false) throw new Error('CATALOGUE_CONFIGURATION_NOT_DISABLED');
if (checkpoint.state !== 'blocked' || checkpoint.providerRequestsAllowed !== false || checkpoint.leaseToken !== null || Number(checkpoint.leaseExpiresAtMs) !== 0) throw new Error('CATALOGUE_CHECKPOINT_NOT_BLOCKED');
const quotaBaseline = {
  month: MONTH,
  configuredBudget: Number(quota.configuredBudget ?? 0),
  emergencyReserve: Number(quota.emergencyReserve ?? 0),
  weightedCompleted: Number(quota.weightedCompleted ?? 0),
  weightedFailed: Number(quota.weightedFailed ?? 0),
  weightedReserved: Number(quota.weightedReserved ?? 0),
  weightedReleased: Number(quota.weightedReleased ?? 0),
};
if (quotaBaseline.weightedCompleted !== 0 || quotaBaseline.weightedFailed !== 0 || quotaBaseline.weightedReserved !== 0 || quotaBaseline.weightedReleased !== 0) throw new Error('CATALOGUE_QUOTA_BASELINE_NOT_EMPTY');

console.log(JSON.stringify({
  project: PROJECT, region: REGION, readOnly: true, providerRequests: 0, firestoreWrites: 0,
  secret: { name: 'GOLF_API_KEY', version: '2', state: secret.state, nameMetadata: secret.name },
  functions, providerSecretBindings: PROVIDER_CALLABLES.map((name) => ({ id: name, version: functions.find((item) => item.id === name)?.secretVersion ?? null })),
  legacyScheduler: { id: legacyScheduler.name, state: legacyScheduler.state },
  deferredSchedulers: { state: 'deferred/not created by design', exports: DEFERRED_SCHEDULED_EXPORTS, jobs: [] },
  firestoreRules: { release: rulesRelease.name, rulesetName: rulesRelease.rulesetName }, indexes,
  configuration: { enabled: config.enabled, providerRequestsAllowed: config.providerRequestsAllowed, blockedReason: config.blockedReason ?? config.disabledReason ?? null },
  checkpoint: { state: checkpoint.state, providerRequestsAllowed: checkpoint.providerRequestsAllowed, leaseToken: checkpoint.leaseToken, leaseExpiresAtMs: checkpoint.leaseExpiresAtMs },
  quotaBaseline,
}, null, 2));
