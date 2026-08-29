#!/usr/bin/env node
// Deferred-manual phase: validates a receipt candidate with GET requests only.
// It cannot create a receipt, alter configuration/checkpoint state, or invoke a Scheduler.
import { createRequire } from 'node:module';

const PROJECT = 'golfriend-v2-production-2ee34';
const REGION = 'asia-southeast1';
const SCHEDULER_MODE = 'deferred_by_design';
const ACTIVATION_FUNCTIONS = [
  'activateCourseCatalogue',
  'pauseCourseCountryIngestion',
  'requestGolfApiCourseAcquisition',
  'resumeCourseCountryIngestion',
  'scheduledCourseCountryIngestionWorker',
  'scheduledGolfApiCourseAcquisitionWorker',
  'startCourseCountryIngestion',
].sort();
const PROVIDER_FUNCTIONS = ['scheduledCourseCountryIngestionWorker', 'scheduledGolfApiCourseAcquisitionWorker'];
const versionArg = process.argv.find((value) => value.startsWith('--secret-version='));
const secretVersion = versionArg?.split('=')[1];
if (!/^\d+$/.test(secretVersion || '')) throw new Error('SECRET_VERSION_METADATA_REQUIRED');
if (process.argv.some((value) => ['--apply-after-claude-pass', '--write-receipt-only', '--bind-receipt-disabled'].includes(value))) throw new Error('DEFERRED_MANUAL_BASELINE_READ_ONLY');

const require = createRequire(import.meta.url);
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

const secret = await read(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/GOLF_API_KEY/versions/${secretVersion}`);
if (secret.state !== 'ENABLED') throw new Error('SECRET_VERSION_NOT_ENABLED');
const functionItems=[];
let pageToken=null;
for (let page=0; page<10; page+=1) {
  const suffix=pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:'';
  const response=await read(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions?pageSize=100${suffix}`);
  functionItems.push(...(response.functions||[]));
  pageToken=response.nextPageToken||null;
  if(!pageToken)break;
}
if(pageToken)throw new Error('FUNCTION_LIST_PAGE_LIMIT_EXCEEDED');
const functions = functionItems
  .filter((item) => item.labels?.['firebase-functions-codebase'] === 'course-catalogue' && ACTIVATION_FUNCTIONS.includes(item.name?.split('/').pop()))
  .map((item) => ({
    id: item.name?.split('/').pop(), state: item.state,
    service: item.serviceConfig?.service?.split('/').pop(),
    secretVersion: (item.serviceConfig?.secretEnvironmentVariables || []).find((value) => value.key === 'GOLF_API_KEY')?.version ?? null,
  }))
  .sort((left, right) => left.id.localeCompare(right.id));
const ids = functions.map((item) => item.id);
const missing = ACTIVATION_FUNCTIONS.filter((name) => !ids.includes(name));
if (missing.length) throw new Error(`CALLABLE_FUNCTION_MISSING:${missing.join(',')}`);
if (functions.some((item) => item.state !== 'ACTIVE')) throw new Error('CATALOGUE_CALLABLE_NOT_ACTIVE');
for (const name of PROVIDER_FUNCTIONS) {
  const fn = functions.find((item) => item.id === name);
  if (fn?.secretVersion !== secretVersion) throw new Error(`FUNCTION_SECRET_BINDING_MISMATCH:${name}`);
}
const revisions = {};
for (const fn of functions) {
  if (!fn.service) throw new Error(`FUNCTION_SERVICE_UNCONFIRMED:${fn.id}`);
  const service = await read(`https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${fn.service}`);
  const revision = service.latestReadyRevision?.split('/').pop();
  if (!revision) throw new Error(`FUNCTION_REVISION_UNCONFIRMED:${fn.id}`);
  revisions[fn.service] = revision;
}
const verifiedAt = new Date().toISOString();
console.log(JSON.stringify({
  projectId: PROJECT, region: REGION, schedulerMode: SCHEDULER_MODE,
  receiptValidation: { state: 'verified_not_written', secretName: 'GOLF_API_KEY', secretVersion, verifiedAt, functionRevisions: revisions },
  activationFunctions: functions, providerSecretBindings: PROVIDER_FUNCTIONS.map((id) => ({ id, version: functions.find((item) => item.id === id)?.secretVersion ?? null })),
  providerRequests: 0, firestoreWrites: 0, configurationWrites: 0, checkpointWrites: 0, schedulerMutations: 0, secretValueAccessed: false,
}, null, 2));
