import { createHash } from 'node:crypto';

export const BOOKING_OPERATIONS_ADMIN_SCHEMA = 'golfriend.booking-operations-admin.v2';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function correctionRequestId(bookingId: string, commandId: string): string {
  return `bcr_${digest(`${bookingId}|${commandId}`).slice(0, 32)}`;
}

export function normalizeCorrectionRequest(input: unknown): { bookingId: string; reason: string; commandId: string } {
  const value = input as Record<string, unknown> | null;
  const bookingId = typeof value?.bookingId === 'string' ? value.bookingId.trim() : '';
  const reason = typeof value?.reason === 'string' ? value.reason.trim() : '';
  const commandId = typeof value?.commandId === 'string' ? value.commandId.trim() : '';
  if (!bookingId || bookingId.length > 200) throw new TypeError('Booking ID is required.');
  if (reason.length < 8 || reason.length > 1000) throw new TypeError('A correction reason of 8 to 1000 characters is required.');
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(commandId)) throw new TypeError('Command ID is invalid.');
  return { bookingId, reason, commandId };
}

export function linkedRoundSnapshot(booking: Record<string, unknown>) {
  const roundId = typeof booking.roundId === 'string' && booking.roundId.trim() ? booking.roundId : null;
  const lifecycleState = typeof booking.roundLifecycleState === 'string'
    ? booking.roundLifecycleState
    : typeof booking.roundStatus === 'string'
      ? booking.roundStatus
      : null;
  return { roundId, lifecycleState, source: roundId ? 'booking_snapshot' : 'none' };
}

const stringOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const timestampOrNull = (value: unknown) => value ?? null;
const nonNegativeIntegerOrNull = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;

export function bookingTransitionSnapshot(bookingId: string, value: Record<string, unknown>) {
  const alternativeOffer = value.alternativeOffer && typeof value.alternativeOffer === 'object' ? value.alternativeOffer : null;
  return {
    transitionId: stringOrNull(value.transitionId) || stringOrNull(value.receiptId),
    bookingId: stringOrNull(value.bookingId) || bookingId,
    roundId: stringOrNull(value.roundId),
    actor: stringOrNull(value.actor) || stringOrNull(value.actorUid) || stringOrNull(value.byUid),
    actorRole: stringOrNull(value.actorRole) || stringOrNull(value.byRole),
    timestamp: timestampOrNull(value.timestamp) || timestampOrNull(value.createdAt) || timestampOrNull(value.at),
    submissionSnapshotRef: stringOrNull(value.submissionSnapshotRef),
    projectionVersion: nonNegativeIntegerOrNull(value.projectionVersion),
    kind: stringOrNull(value.kind) || stringOrNull(value.action) || 'transition',
    status: stringOrNull(value.status),
    partnerMessage: stringOrNull(value.partnerMessage),
    alternativeOffer,
    partnerVisible: value.partnerVisible === true,
  };
}
