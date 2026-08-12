export type BookingReleaseLocale = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';
export type BookingReleaseClassification = 'implemented' | 'fixture_verified' | 'contract_ready' | 'manual_verification_required' | 'blocked_external' | 'unavailable';
export interface BookingReleaseReadinessEntry {
  readonly stableId: string;
  readonly classification: BookingReleaseClassification;
  readonly sourceType: string;
  readonly authorityOwner: string;
  readonly localeCoverage: readonly BookingReleaseLocale[];
  readonly requiredSchemaFields: readonly string[];
  readonly prerequisiteIds: readonly string[];
  readonly prohibitedClaims: readonly string[];
  readonly evidenceType: string;
  readonly manualVerificationRequirements: readonly string[];
}
export interface BookingReleaseReadinessSummary {
  readonly schemaId: typeof BOOKING_RELEASE_READINESS_SCHEMA_ID;
  readonly version: 1;
  readonly totalCapabilities: number;
  readonly completedCapabilities: number;
  readonly externallyBlockedCapabilities: number;
  readonly manualVerificationCapabilities: number;
  readonly counts: Readonly<Record<BookingReleaseClassification, number>>;
  readonly remainingPrerequisiteIds: readonly string[];
}
export const BOOKING_RELEASE_READINESS_SCHEMA_ID: 'golfriend.admin.booking-release-readiness.v1';
export const BOOKING_RELEASE_READINESS_VERSION: 1;
export const BOOKING_RELEASE_PARENT_SHA: '97cbc878406a1e460e95e25b4c2e7dfaa119e65f';
export const BOOKING_RELEASE_LOCALES: readonly BookingReleaseLocale[];
export const BOOKING_RELEASE_CLASSIFICATIONS: readonly BookingReleaseClassification[];
export const BOOKING_RELEASE_READINESS: readonly BookingReleaseReadinessEntry[];
export function summarizeBookingReleaseReadiness(entries?: readonly BookingReleaseReadinessEntry[]): BookingReleaseReadinessSummary;
