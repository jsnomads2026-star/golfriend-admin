export const ADMIN_BOOKING_RESOLUTION_DISABLED =
  "Admin cannot confirm, reject, or cancel bookings outside the canonical partner-authorized booking contract.";

export function adminBookingResolutionRefusal(_decision: unknown) {
  return Object.freeze({
    code: "failed-precondition" as const,
    message: ADMIN_BOOKING_RESOLUTION_DISABLED,
  });
}
