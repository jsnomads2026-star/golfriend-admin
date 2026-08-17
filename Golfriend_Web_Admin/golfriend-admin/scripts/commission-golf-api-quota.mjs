#!/usr/bin/env node
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT = 'golfriend-v2';
const PERIOD = '2026-08';
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function token() {
  const auth = require(process.env.FIREBASE_TOOLS_AUTH_MODULE || 'C:/Users/Windows/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('AUTHORIZED_FIREBASE_CLI_ACCOUNT_REQUIRED');
  const scopes = Array.isArray(account.tokens.scopes) ? account.tokens.scopes : String(account.tokens.scope || '').split(/\s+/).filter(Boolean);
  const credential = await auth.getAccessToken(account.tokens.refresh_token, scopes);
  if (!credential?.access_token) throw new Error('ACCESS_TOKEN_UNAVAILABLE');
  return credential.access_token;
}

const encode = (value) => {
  if (value === null) return {nullValue: null};
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
  throw new Error('UNSUPPORTED_FIELD');
};

async function write(access, collection, id, value) {
  const response = await fetch(`${ROOT}/${collection}/${id}`, {
    method: 'PATCH',
    headers: {Authorization: `Bearer ${access}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({fields: Object.fromEntries(Object.entries(value).map(([key, field]) => [key, encode(field)]))}),
  });
  if (!response.ok) throw new Error(`FIRESTORE_${response.status}`);
}

const access = await token();
await write(access, 'golf_api_quota', PERIOD, {
  schema: 'golfriend.golf-api-quota.v1', month: PERIOD, configuredBudget: 500,
  emergencyReserve: 100, reserved: 0, completed: 0, failed: 0, released: 0,
  dailyLimit: 5, weeklyLimit: 25, version: 1,
  periodStartedAt: '2026-08-05T00:00:00Z', resetsAt: '2026-09-05T00:00:00Z',
  usageEvidence: 'v1-retained-logs-2026-08-05-through-2026-08-17',
  state: 'disabled_pending_provider_contract', providerRequestsAllowed: false,
});
await write(access, 'course_acquisition_checkpoints', 'golf-api', {
  schema: 'golfriend.course-acquisition-checkpoint.v1', projectId: PROJECT,
  state: 'disabled_pending_provider_contract', canonicalBaseline: 3265,
  providerRequestsThisPeriod: 0, newCoursesAdded: 0, concurrency: 1,
  nextAction: 'confirm_endpoint_cost_rate_limit_and_csv_entitlement',
  updatedAt: new Date().toISOString(),
});
console.log(JSON.stringify({projectId: PROJECT, period: PERIOD, allowance: 500, used: 0, remaining: 500, reserve: 100, callableLimit: 400, providerRequests: 0, state: 'disabled_pending_provider_contract'}));
