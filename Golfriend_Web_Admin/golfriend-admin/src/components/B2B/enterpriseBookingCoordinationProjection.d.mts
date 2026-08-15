export type EnterpriseBookingCoordinationProjection = Readonly<Record<string, any> & {bookings: readonly Readonly<Record<string, any>>[]}>;
export function parseEnterpriseBookingCoordinationProjection(raw: unknown, now?: number): EnterpriseBookingCoordinationProjection;
