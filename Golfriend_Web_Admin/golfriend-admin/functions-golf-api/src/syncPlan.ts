import { isValidProviderId } from './courseSyncCore.js';
export const MAX_MANUAL_RUN = 25;
export const MONTHLY_PROVIDER_REQUEST_BUDGET = 100;
export type SyncMode = 'preview' | 'apply';
export function parsePreviewRequest(data: unknown): { mode: 'preview'; courseIds: string[] } {
  const value = data as { mode?: unknown; courseIds?: unknown };
  if (value?.mode !== 'preview' || !Array.isArray(value.courseIds)) throw new Error('Preview requires explicit courseIds.');
  const courseIds = [...new Set(value.courseIds.filter(isValidProviderId))];
  if (!courseIds.length || courseIds.length > MAX_MANUAL_RUN || courseIds.length !== value.courseIds.length) throw new Error('Provide 1 to 25 unique valid provider course ids.');
  return { mode: 'preview', courseIds };
}
export function parseApplyRequest(data: unknown): { mode: 'apply'; courseIds: string[]; requestId: string } {
  const value = data as { mode?: unknown; courseIds?: unknown; requestId?: unknown };
  if (value?.mode !== 'apply' || !Array.isArray(value.courseIds) || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.requestId)) throw new Error('Apply requires explicit courseIds and a valid requestId.');
  const courseIds = [...new Set(value.courseIds.filter(isValidProviderId))];
  if (!courseIds.length || courseIds.length > MAX_MANUAL_RUN || courseIds.length !== value.courseIds.length) throw new Error('Provide 1 to 25 unique valid provider course ids.');
  return { mode: 'apply', courseIds, requestId: value.requestId };
}
export function nextUsage(month: string, current: { month?: unknown; requestsUsed?: unknown; monthlyBudget?: unknown } | null, requestCount: number) {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(requestCount) || requestCount < 1 || requestCount > MAX_MANUAL_RUN) throw new Error('Invalid usage reservation.');
  // `platform/golfApiUsage` is the sole durable usage authority.  A missing or
  // malformed record is not evidence of unused quota, so the worker must stop.
  if (!current || current.monthlyBudget !== MONTHLY_PROVIDER_REQUEST_BUDGET || !Number.isInteger(current.requestsUsed) || typeof current.month !== 'string') throw new Error('Golf API usage state is unavailable or untrusted.');
  const used = current.month === month ? Number(current.requestsUsed) : 0;
  if (used + requestCount > MONTHLY_PROVIDER_REQUEST_BUDGET) throw new Error('Monthly Golf API provider-request budget exceeded.');
  return { month, requestsUsed: used + requestCount, remaining: MONTHLY_PROVIDER_REQUEST_BUDGET - used - requestCount };
}
