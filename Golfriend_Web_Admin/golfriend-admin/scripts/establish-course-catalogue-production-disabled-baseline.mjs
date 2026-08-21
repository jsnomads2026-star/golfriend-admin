#!/usr/bin/env node
// Creates only the initial disabled production baseline. It never invokes a
// Function, calls the provider, touches a Scheduler, or writes course records.
import { createRequire } from 'node:module';

const TARGET_PROJECT = 'golfriend-v2-production-2ee34';
const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith('--') && value.includes('=')).map((value) => {
  const [key, ...rest] = value.slice(2).split('=');
  return [key, rest.join('=')];
}));
if (args.project !== TARGET_PROJECT) throw new Error('PROJECT_TARGET_REJECTED');
if (args.execute !== 'CREATE_DISABLED_BASELINE') throw new Error('DISABLED_BASELINE_EXECUTION_APPROVAL_REQUIRED');

const require = createRequire(import.meta.url);
const month = new Date().toISOString().slice(0, 7);
const root = `https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)/documents`;
const paths = ['platform/golfApiCatalogueConfig', 'course_acquisition_checkpoints/golf-api', `golf_api_quota/${month}`];
const auth = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
const scopes = Array.isArray(account.tokens.scopes) ? account.tokens.scopes : String(account.tokens.scope || '').split(/\s+/).filter(Boolean);
const credential = await auth.getAccessToken(account.tokens.refresh_token, scopes);

const encode = (value) => value === null ? { nullValue: null } : typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : (() => { throw new Error('BASELINE_VALUE_INVALID'); })();
async function request(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`GOOGLE_${response.status}:${body.slice(0, 160)}`);
  return body ? JSON.parse(body) : {};
}
async function exists(path) {
  const response = await fetch(`${root}/${path}`, { headers: { Authorization: `Bearer ${credential.access_token}` } });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`BASELINE_READ_${response.status}`);
  return true;
}

const existing = (await Promise.all(paths.map(async (path) => [path, await exists(path)]))).filter(([, present]) => present).map(([path]) => path);
if (existing.length) throw new Error(`BASELINE_DOCUMENT_ALREADY_EXISTS:${existing.join(',')}`);
const createdAt = new Date().toISOString();
const documents = [
  ['platform/golfApiCatalogueConfig', {
    schema: 'golfriend.golf-api-catalogue-config.v3', projectId: TARGET_PROJECT,
    enabled: false, providerRequestsAllowed: false, canaryRequestsAllowed: false, calibrationRequestsAllowed: false,
    requiredSecretVersion: '2', blockedReason: 'INITIAL_DISABLED_BASELINE', createdAt,
  }],
  ['course_acquisition_checkpoints/golf-api', {
    schema: 'golfriend.course-acquisition-checkpoint.v3', projectId: TARGET_PROJECT,
    state: 'blocked', stopReason: 'INITIAL_DISABLED_BASELINE', providerRequestsAllowed: false,
    leaseToken: null, leaseExpiresAtMs: 0, recoveryCount: 0, createdAt,
  }],
  [`golf_api_quota/${month}`, {
    schema: 'golfriend.golf-api-quota-ledger.v3', projectId: TARGET_PROJECT, month,
    configuredBudget: 500, emergencyReserve: 100, weightedCompleted: 0, weightedFailed: 0,
    weightedReserved: 0, weightedReleased: 0, providerReportedRemaining: null, providerEvidenceAt: null, createdAt,
  }],
];
const writes = documents.map(([path, value]) => ({
  update: { name: `projects/${TARGET_PROJECT}/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) },
  currentDocument: { exists: false },
}));
await request(`${root}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
const verified = await Promise.all(paths.map(async (path) => [path, await exists(path)]));
if (verified.some(([, present]) => !present)) throw new Error('BASELINE_POST_WRITE_VERIFICATION_FAILED');
console.log(JSON.stringify({ projectId: TARGET_PROJECT, month, created: paths, firestoreWrites: 3, providerRequests: 0, functionInvocations: 0, schedulerMutations: 0, courseWrites: 0 }, null, 2));
