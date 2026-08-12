export type CanonicalLocale = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';
export type ReadinessState = 'unavailable' | 'fixture_verified' | 'contract_ready' | 'commissioned' | 'degraded';
export interface NormalizedBooking { id: string; status: string; createdAt: string | null; courseId?: string; courseName?: string; locale?: CanonicalLocale; }
export interface StreamObserver { next(records: readonly NormalizedBooking[]): void; error(error: Error & { code?: string }): void; }
export interface BookingAdapter { readonly schemaId: string; readonly version: number; readonly mode: 'unavailable' | 'fixture'; readonly readOnly: true; subscribe(stream: string, observer: StreamObserver): () => void; getBookingDetail(id: string): Promise<NormalizedBooking | null>; lookupCourseProvider(courseId: string): Promise<unknown>; }
export interface FixtureBookingAdapter extends BookingAdapter { retry(stream: string, observer: StreamObserver): () => void; diagnostics(): Readonly<{ subscriptionCount: number; activeCount: number }>; }
export interface AdminResolveBookingRequest { bookingId: string; resolution: 'confirm' | 'reject' | 'cancel'; idempotencyKey: string; }
export interface SendBookingMessageRequest { bookingId: string; locale: CanonicalLocale; message: string; idempotencyKey: string; }
export interface BookingCallableResponse { accepted: boolean; bookingId: string; auditEventId: string; }
export interface BookingCallableAdapter {
  adminResolveBooking(request: AdminResolveBookingRequest): Promise<BookingCallableResponse>;
  sendBookingMessage(request: SendBookingMessageRequest): Promise<BookingCallableResponse>;
}
export interface BookingReportBoundary {
  readonly schemaId: typeof BOOKING_REPORT_SCHEMA_ID; readonly version: 1; readonly reportId: string;
  readonly generationWindow: Readonly<{ start: string; end: string }>;
  readonly sourceBuildId: string; readonly sourceContractVersion: 1;
  readonly reconciliation: Readonly<{ ok: boolean; sourceTotal: number; reconciledTotal: number }>;
  readonly missingTimestampCount: number; readonly unknownStatusCount: number;
  readonly statusTotals: Readonly<Record<'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'unknown', number>>;
  readonly exceptionTotals: Readonly<{ missingTimestamp: number; unknownStatus: number }>;
  readonly exports: Readonly<{ csv: Readonly<{ mediaType: 'text/csv'; generated: false }>; txt: Readonly<{ mediaType: 'text/plain'; generated: false }> }>;
  readonly exclusions: readonly string[];
}
export interface ReadinessEntry { capabilityId: string; currentState: ReadinessState; evidence: string; prerequisites: readonly string[]; allowedActions: readonly string[]; blockedActions: readonly string[]; authorityOwner: string; userFacingExplanation: string; }
export const BOOKING_DATA_SCHEMA_ID: 'golfriend.admin.booking-data.v1';
export const BOOKING_CALLABLE_SCHEMA_ID: 'golfriend.admin.booking-callables.v1';
export const BOOKING_REPORT_SCHEMA_ID: 'golfriend.admin.booking-report.v1';
export const BOOKING_READINESS_SCHEMA_ID: 'golfriend.admin.booking-readiness.v1';
export const CONTRACT_VERSION: 1;
export const C3A_BASE_BUILD_ID: string;
export const CANONICAL_LOCALES: readonly CanonicalLocale[];
export const READINESS_STATES: readonly ReadinessState[];
export const BOOKING_DATA_CONTRACT: Readonly<Record<string, unknown>>;
export const CALLABLE_CONTRACTS: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export const BOOKING_REPORT_CONTRACT: Readonly<Record<string, unknown>>;
export const REPORT_EXCLUSIONS: readonly string[];
export const FIXTURE_BOOKINGS: readonly NormalizedBooking[];
export const BOOKING_READINESS_REGISTRY: readonly ReadinessEntry[];
export function createUnavailableBookingAdapter(): BookingAdapter;
export function createFixtureBookingAdapter(): FixtureBookingAdapter;
export function validateCallableRequest(callableName: 'adminResolveBooking', request: Partial<AdminResolveBookingRequest>): { ok: boolean; errors: string[] };
export function validateCallableRequest(callableName: 'sendBookingMessage', request: Partial<SendBookingMessageRequest>): { ok: boolean; errors: string[] };
export function produceBookingReportBoundary(input: { bookings: readonly NormalizedBooking[]; windowStart: string; windowEnd: string; sourceBuildId?: string }): BookingReportBoundary;
