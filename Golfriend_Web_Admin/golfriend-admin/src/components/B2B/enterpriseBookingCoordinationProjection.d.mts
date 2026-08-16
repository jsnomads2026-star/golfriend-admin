export type EnterpriseBookingCoordinationProjection = Readonly<Record<string, any> & {bookings: readonly Readonly<Record<string, any>>[]}>;
export function parseEnterpriseBookingCoordinationProjection(raw: unknown, now?: number): EnterpriseBookingCoordinationProjection;
export function parseEnterpriseBookingActionPreview(raw: unknown, expected: Readonly<{bookingId:string;action:string;version:number}>): Readonly<Record<string, any>>;
export function parseEnterpriseBookingTokenRecovery(raw: unknown, expected: Readonly<{bookingId:string;operationId:string;operationDigest:string}>): Readonly<Record<string, any>>;
export function parseEnterpriseBookingActionResult(raw: unknown, expected: Readonly<{bookingId:string;action:string;version:number}>): Readonly<Record<string, any>>;
