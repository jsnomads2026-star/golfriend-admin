export const READ_ONLY_DAYS: number;
export const EXPIRING_WITHIN_DAYS: number;
export function remainingDays(endsAt: string, nowMs?: number): number;
export function trialPresentation(
  trial: { startsAt?: string; endsAt: string; cancelledAt: string | null } | null,
  nowMs?: number
): { status: 'active' | 'expiring' | 'expired' | 'cancelled'; remaining: number; readOnly: boolean; readOnlyUntil: string | null };
