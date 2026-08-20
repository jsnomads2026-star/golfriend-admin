import assert from 'node:assert';
import { buildGolfApiSyncStatus } from './statusView.js';
const status = buildGolfApiSyncStatus({ usage: { month: '2026-08', requestsUsed: 12, remaining: 88 }, audits: [{ eventType: 'apply', createdAt: '2026-08-20T00:00:00.000Z', results: [{ result: 'updated', provider: { private: true } }, { result: 'error', error: 'provider token leaked' }] }] });
assert.equal(status.requestsRemaining, 88);
assert.deepEqual(status.lastSuccess?.outcome, { updated: 1, error: 1 });
assert.deepEqual(status.safeErrorSummary, { providerRequestFailures: 1, conflicts: 0 });
assert.equal(JSON.stringify(status).includes('private'), false);
assert.equal(JSON.stringify(status).includes('token'), false);
console.log('golf-api status view: aggregate-only status and safe error summary passed.');
