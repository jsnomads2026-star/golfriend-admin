// ==========================================
// FILE: functions/src/bookingLogic.ts
// Pure, side-effect-free rules for the NON-FINANCIAL booking lifecycle.
// Extracted so the lifecycle can be unit-tested without Firebase, and so the
// "no money in booking" invariant is enforced in one auditable place.
// ==========================================

export type BookingAction = 'request' | 'confirm' | 'reject' | 'cancel';
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

// Fields that would make a booking financial. Booking documents/payloads MUST
// contain none of these — the Director gate forbids any money in booking.
export const FINANCIAL_BOOKING_FIELDS = [
  'priceChips', 'price', 'amount', 'chips', 'hold', 'holdRef', 'escrow',
  'settlement', 'payout', 'refund', 'fiatAmountUsd', 'wallet',
] as const;

/** True when a tee-time slot can accept a new booking (capacity only). */
export function isSlotBookable(status: unknown, bookedCount: unknown, capacity: unknown): boolean {
  if (status !== 'open') return false;
  const booked = Number(bookedCount || 0);
  const cap = Number(capacity || 0);
  if (!Number.isFinite(booked) || !Number.isFinite(cap)) return false;
  return booked < cap;
}

/** Seat counter delta for an action: request reserves one, reject/cancel release one. */
export function seatDeltaFor(action: BookingAction): number {
  switch (action) {
    case 'request': return +1;
    case 'reject':
    case 'cancel': return -1;
    case 'confirm': return 0;
  }
}

/** Resulting booking status after an action. */
export function statusAfter(action: BookingAction): BookingStatus {
  switch (action) {
    case 'request': return 'pending';
    case 'confirm': return 'confirmed';
    case 'reject': return 'rejected';
    case 'cancel': return 'cancelled';
  }
}

/** Localization key the client renders for a status. */
export function userStatusKeyFor(status: BookingStatus): string {
  return `booking_${status}`;
}

/** Whether an action is allowed from the current booking status. */
export function isTransitionAllowed(current: BookingStatus | 'none', action: BookingAction): boolean {
  switch (action) {
    case 'request': return current === 'none';
    case 'confirm': return current === 'pending';
    case 'reject': return current === 'pending';
    case 'cancel': return current === 'pending' || current === 'confirmed';
  }
}

/** Never-floor-below-zero seat count after applying a delta. */
export function applySeatDelta(bookedCount: unknown, delta: number): number {
  return Math.max(0, Number(bookedCount || 0) + delta);
}

/** Guard: returns the financial field names present in an object (empty = clean). */
export function financialFieldsIn(obj: Record<string, unknown> | null | undefined): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  return FINANCIAL_BOOKING_FIELDS.filter((f) => keys.includes(f.toLowerCase()));
}

/** True when a booking document/payload carries no financial fields. */
export function isNonFinancialBooking(obj: Record<string, unknown> | null | undefined): boolean {
  return financialFieldsIn(obj).length === 0;
}
