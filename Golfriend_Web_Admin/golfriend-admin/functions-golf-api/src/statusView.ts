type AuditRow = { eventType?: unknown; fetchedAt?: unknown; createdAt?: unknown; results?: unknown[]; rows?: unknown[] };
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const iso = (value: unknown) => {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : text(value);
};
const outcomeSummary = (items: unknown[]) => items.reduce((summary: Record<string, number>, item) => { const result = text((item as Record<string, unknown>)?.result) ?? 'unknown'; summary[result] = (summary[result] ?? 0) + 1; return summary; }, {});
const safeError = (items: unknown[]) => {
  const failed = items.filter((item) => (item as Record<string, unknown>)?.result === 'error').length;
  const conflicted = items.filter((item) => (item as Record<string, unknown>)?.result === 'conflict').length;
  return failed || conflicted ? { providerRequestFailures: failed, conflicts: conflicted } : null;
};

/** Projects aggregate operational facts only; never returns audit rows or provider payloads. */
export function buildGolfApiSyncStatus(input: { usage: Record<string, unknown> | null; audits: AuditRow[] }) {
  const usage = input.usage ?? {};
  const preview = input.audits.find((item) => item.eventType === 'preview');
  const apply = input.audits.find((item) => item.eventType === 'apply');
  const latest = apply ?? preview;
  const results = Array.isArray(latest?.results) ? latest.results : Array.isArray(preview?.rows) ? preview.rows : [];
  const applyResults = Array.isArray(apply?.results) ? apply.results : [];
  return {
    schema: 'golfriend.golf-api-sync-status.v1',
    currentMonth: text(usage.month),
    requestsUsed: Number.isInteger(usage.requestsUsed) ? Number(usage.requestsUsed) : 0,
    requestsRemaining: Number.isInteger(usage.remaining) ? Number(usage.remaining) : null,
    lastSuccess: apply ? { at: iso(apply.createdAt) ?? iso(apply.fetchedAt), outcome: outcomeSummary(applyResults) } : null,
    recentOutcome: latest ? { type: text(latest.eventType), at: iso(latest.createdAt) ?? iso(latest.fetchedAt), outcome: outcomeSummary(results) } : null,
    safeErrorSummary: safeError(results),
  };
}
