// Pure trial presentation, kept out of the component so it is directly testable.
//
// Every value here derives from the STORED trial dates and the STORED cancellation instant.
// Nothing is inferred from local time zones, and no money value is ever computed.

/** Read-only/export window granted after a trial cancellation, per lifecycle authority. */
export const READ_ONLY_DAYS = 30;
/** A trial is shown as "ending soon" inside this many days. */
export const EXPIRING_WITHIN_DAYS = 7;

const DAY_MS = 86400000;

/** Whole days left, rounded up, never negative. */
export function remainingDays(endsAt, nowMs = Date.now()) {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end <= nowMs) return 0;
  return Math.ceil((end - nowMs) / DAY_MS);
}

/**
 * Presentation state for a stored trial.
 *
 * Cancellation wins over every date comparison: a cancelled trial is cancelled even if its
 * end date has not yet passed, and it carries the 30-day read-only/export window measured
 * from the cancellation instant.
 */
export function trialPresentation(trial, nowMs = Date.now()) {
  if (trial && trial.cancelledAt) {
    const cancelled = Date.parse(trial.cancelledAt);
    const readOnlyUntil = Number.isFinite(cancelled) ? new Date(cancelled + READ_ONLY_DAYS * DAY_MS).toISOString() : null;
    return {
      status: 'cancelled',
      remaining: 0,
      readOnly: readOnlyUntil !== null && nowMs < Date.parse(readOnlyUntil),
      readOnlyUntil,
    };
  }
  const remaining = remainingDays(trial ? trial.endsAt : '', nowMs);
  if (remaining === 0) return {status: 'expired', remaining: 0, readOnly: true, readOnlyUntil: null};
  return {
    status: remaining <= EXPIRING_WITHIN_DAYS ? 'expiring' : 'active',
    remaining,
    readOnly: false,
    readOnlyUntil: null,
  };
}
