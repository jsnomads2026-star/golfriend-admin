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

export type JobState = 'queued'|'running'|'waiting_retry'|'completed'|'failed_permanent'|'paused'|'quota_exhausted';
export type DurableJob = IngestionJob & { state: JobState; terminalErrors: Record<string,string>; counters: { processed:number; proposed:number; unchanged:number; permanentFailures:number; temporaryFailures:number }; leaseUntil: string|null; runId: string|null };
export function dueForRun(job: DurableJob, now: Date) { return ['queued','waiting_retry'].includes(job.state) && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now.getTime()) && (!job.leaseUntil || Date.parse(job.leaseUntil) <= now.getTime()); }
export function markPermanent(job: DurableJob, courseId: string, reason: string): DurableJob { if(job.completed.includes(courseId)) return job; const completed=[...job.completed,courseId]; const cursor=Math.max(job.cursor,job.courseIds.indexOf(courseId)+1); return {...job,cursor,completed,terminalErrors:{...job.terminalErrors,[courseId]:reason},counters:{...job.counters,processed:job.counters.processed+1,permanentFailures:job.counters.permanentFailures+1},state:completed.length===job.courseIds.length?'failed_permanent':'queued'}; }
