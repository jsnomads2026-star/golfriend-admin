import assert from 'node:assert';
import { nextUsage, parseApplyRequest, parsePreviewRequest } from './syncPlan.js';
assert.deepEqual(parsePreviewRequest({ mode: 'preview', courseIds: ['course_001', 'course_002'] }).courseIds, ['course_001', 'course_002']);
assert.throws(() => parsePreviewRequest({ mode: 'preview', courseIds: Array.from({ length: 26 }, (_, index) => `course_${index}`) }), /1 to 25/);
assert.throws(() => parsePreviewRequest({ mode: 'apply', courseIds: ['course_001'] }), /Preview/);
assert.deepEqual(parseApplyRequest({ mode: 'apply', courseIds: ['course_001'], requestId: 'abcdefghijklmnop' }), { mode: 'apply', courseIds: ['course_001'], requestId: 'abcdefghijklmnop' });
assert.throws(() => parseApplyRequest({ mode: 'apply', courseIds: ['course_001'], requestId: 'short' }), /requestId/);
const usage = { month: '2026-08', requestsUsed: 75, monthlyBudget: 100 };
assert.deepEqual(nextUsage('2026-08', usage, 25), { month: '2026-08', requestsUsed: 100, remaining: 0 });
assert.throws(() => nextUsage('2026-08', { ...usage, requestsUsed: 76 }, 25), /budget/);
assert.throws(() => nextUsage('2026-08', null, 1), /unavailable/);
assert.throws(() => nextUsage('2026-08', { month: '2026-08', requestsUsed: 0, monthlyBudget: 99 }, 1), /unavailable/);
assert.equal(nextUsage('2026-09', { ...usage, requestsUsed: 100 }, 1).requestsUsed, 1);
// Repeated worker reservations can never pass the authoritative 100-request cap.
let repeated = { month: '2026-08', requestsUsed: 98, monthlyBudget: 100 };
repeated = { ...repeated, ...nextUsage('2026-08', repeated, 1) };
repeated = { ...repeated, ...nextUsage('2026-08', repeated, 1) };
assert.throws(() => nextUsage('2026-08', repeated, 1), /budget/);
console.log('golf-api plan: Apply contract plus known-only 100-request quota reservation passed.');
