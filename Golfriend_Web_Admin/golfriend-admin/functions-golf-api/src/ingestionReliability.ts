export type ProviderFailure = { kind: 'temporary'; reason: 'rate_limited'|'provider_unavailable'; retryAt: string } | { kind: 'permanent'; reason: 'not_found'|'invalid_response' };
const MAX_DELAY_MS = 60 * 60 * 1000;
export function classifyProviderFailure(status: number, retryAfter: string | null, now: Date, attempt: number, jitter = 0): ProviderFailure {
  if (status === 404) return { kind: 'permanent', reason: 'not_found' };
  if (status !== 429 && (status < 500 || status > 599)) return { kind: 'permanent', reason: 'invalid_response' };
  const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  const delay = retrySeconds === null ? Math.min(MAX_DELAY_MS, 1000 * (2 ** Math.min(attempt, 10)) + Math.max(0, jitter)) : retrySeconds * 1000;
  return { kind: 'temporary', reason: status === 429 ? 'rate_limited' : 'provider_unavailable', retryAt: new Date(now.getTime() + delay).toISOString() };
}
export type IngestionJob = { cursor: number; courseIds: string[]; attempts: Record<string, number>; completed: string[]; nextAttemptAt: string | null };
/** Pure, idempotent progress transition: a completed course is never scheduled again. */
export function advanceIngestion(job: IngestionJob, courseId: string, outcome: 'completed'|'temporary', retryAt: string | null): IngestionJob {
  if (job.completed.includes(courseId)) return job;
  if (outcome === 'completed') return { ...job, cursor: Math.max(job.cursor, job.courseIds.indexOf(courseId) + 1), completed: [...job.completed, courseId], nextAttemptAt: null };
  return { ...job, attempts: { ...job.attempts, [courseId]: (job.attempts[courseId] ?? 0) + 1 }, nextAttemptAt: retryAt };
}
