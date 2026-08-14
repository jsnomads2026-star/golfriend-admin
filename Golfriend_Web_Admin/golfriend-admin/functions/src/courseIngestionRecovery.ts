import {createHash} from "node:crypto";

export const COURSE_INGESTION_RECOVERY_SCHEMA = "golfriend.course-ingestion-recovery/v1";
export const MIN_LEASE_MS = 60_000;
export const MAX_LEASE_MS = 15 * 60_000;
export const MAX_RECOVERY_JOBS = 50;

export type RecoveryConfiguration = {leaseDurationMs?: unknown; maxJobs?: unknown};

export function requireRecoveryConfiguration(value: RecoveryConfiguration | undefined): {leaseDurationMs: number; maxJobs: number} {
  const leaseDurationMs = Number(value?.leaseDurationMs);
  const maxJobs = Number(value?.maxJobs);
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < MIN_LEASE_MS || leaseDurationMs > MAX_LEASE_MS ||
      !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_RECOVERY_JOBS) {
    throw new Error("RECOVERY_UNCONFIGURED");
  }
  return {leaseDurationMs, maxJobs};
}

export function deterministicRecoveryReceiptId(jobId: string, leaseToken: string): string {
  return `recovery_${createHash("sha256").update(`${jobId}:${leaseToken}`).digest("hex").slice(0, 32)}`;
}

export function assertLeaseOwner(job: any, ownerUid: string, leaseToken: string, nowMs: number): void {
  if (job?.status !== "running" || job?.lease?.ownerUid !== ownerUid || job?.lease?.token !== leaseToken) {
    throw new Error("LEASE_OWNERSHIP_LOST");
  }
  const expiresAt = job?.lease?.expiresAt?.toMillis?.() ?? Number(job?.lease?.expiresAtMs);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) throw new Error("LEASE_EXPIRED");
}

export function recoveryReconciliation(job: any): {reservedCalls: number; attemptedCalls: number; releaseCalls: number} {
  const reservedCalls = Math.max(0, Number(job?.quotaReservation?.reservedCalls) || 0);
  const attemptedCalls = Math.max(0, Math.min(reservedCalls, Number(job?.quotaReservation?.attemptedCalls) || 0));
  return {reservedCalls, attemptedCalls, releaseCalls: reservedCalls - attemptedCalls};
}

export function shouldRecoverLease(job: any, observedToken: string, nowMs: number): boolean {
  const expiresAt = job?.lease?.expiresAt?.toMillis?.() ?? Number(job?.lease?.expiresAtMs);
  return job?.status === "running" && Boolean(observedToken) && job?.lease?.token === observedToken &&
    Number.isFinite(expiresAt) && expiresAt <= nowMs;
}
