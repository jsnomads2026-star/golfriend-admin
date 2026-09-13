/**
 * Provider fact freshness is deliberately separate from ingestion-job expiry.
 * `providerUpdatedAt` is retained as provenance only: only this fetch-time TTL
 * decides whether a fact may support a canonical reconciliation write.
 */
export const PROVIDER_FACT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function providerFactFetchedAtMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as {toMillis?: unknown}).toMillis === "function") {
    const millis = (value as {toMillis: () => unknown}).toMillis();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
  }
  if (typeof value === "string") { const millis = Date.parse(value); return Number.isFinite(millis) ? millis : null; }
  return null;
}

export function isProviderFactFresh(fetchedAt: unknown, nowMs: number): boolean {
  const fetchedAtMs = providerFactFetchedAtMs(fetchedAt);
  return fetchedAtMs !== null && Number.isFinite(nowMs) && fetchedAtMs <= nowMs && nowMs - fetchedAtMs <= PROVIDER_FACT_CACHE_TTL_MS;
}

/** Fail closed before any canonical write; providerUpdatedAt is intentionally not an input. */
export function assertFreshProviderFactForCanonicalWrite(fetchedAt: unknown, nowMs: number): void {
  if (!isProviderFactFresh(fetchedAt, nowMs)) throw new Error("STALE_PROVIDER_FACT");
}
