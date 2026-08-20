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
export function parseApplyRequest(data: unknown): { mode: 'apply'; previewId: string } {
  const value = data as { mode?: unknown; previewId?: unknown };
  if (value?.mode !== 'apply' || typeof value.previewId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.previewId)) throw new Error('Apply requires a valid previewId.');
  return { mode: 'apply', previewId: value.previewId };
}
export function nextUsage(month: string, current: { month?: unknown; requestsUsed?: unknown } | null, requestCount: number) {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(requestCount) || requestCount < 1 || requestCount > MAX_MANUAL_RUN) throw new Error('Invalid usage reservation.');
  const used = current?.month === month && Number.isInteger(current.requestsUsed) ? Number(current.requestsUsed) : 0;
  if (used + requestCount > MONTHLY_PROVIDER_REQUEST_BUDGET) throw new Error('Monthly Golf API provider-request budget exceeded.');
  return { month, requestsUsed: used + requestCount, remaining: MONTHLY_PROVIDER_REQUEST_BUDGET - used - requestCount };
}
