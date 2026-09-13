import {normalizeClubhouses, type ProviderClubhouse} from "./courseGrowth.js";

/** Provider-detail cache policy. This is deliberately independent of ingestion job expiry. */
export const PROVIDER_CLUB_FACT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PROVIDER_CLUB_FACT_CACHE_SCHEMA = "golfriend.provider-club-fact/v1";

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => { const result = String(value ?? "").trim(); return result || null; };
const milliseconds = (value: unknown): number | null => {
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  if (value && typeof value === "object" && typeof (value as {toMillis?: unknown}).toMillis === "function") { const parsed = (value as {toMillis: () => unknown}).toMillis(); return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null; }
  return null;
};

/** Cache rows are provider observations only. They intentionally contain no canonical ID or booking-authority claim. */
export function providerClubFact(clubhouse: ProviderClubhouse, fetchedAt: string): Row {
  return {schemaVersion: PROVIDER_CLUB_FACT_CACHE_SCHEMA, provider: "golfapi", providerClubId: clubhouse.providerClubId, providerPropertyId: clubhouse.providerPropertyId, providerClubName: clubhouse.providerClubName, providerBookable: clubhouse.providerBookable, providerParentId: clubhouse.providerParentId, providerPropertyType: clubhouse.providerPropertyType, address: clubhouse.address, address2: clubhouse.address2, city: clubhouse.city, state: clubhouse.state, postalCode: clubhouse.postalCode, country: clubhouse.country, countryCode: clubhouse.countryCode, latitude: clubhouse.latitude, longitude: clubhouse.longitude, phone: clubhouse.phone, mobile: clubhouse.mobile, email: clubhouse.email, website: clubhouse.website, contactPhone: clubhouse.contactPhone, contactEmail: clubhouse.contactEmail, bookingUrl: clubhouse.bookingUrl, reservationUrl: clubhouse.reservationUrl, teeTimeUrl: clubhouse.teeTimeUrl, reservationPhone: clubhouse.reservationPhone, reservationEmail: clubhouse.reservationEmail, bookingProviderId: clubhouse.bookingProviderId, reservationProviderId: clubhouse.reservationProviderId, layouts: clubhouse.layouts.map((layout) => ({...layout})), fetchedAt, providerUpdatedAt: clubhouse.providerUpdatedAt, source: "golfapi-club-detail"};
}

export function isFreshProviderClubFact(value: unknown, nowMs: number): boolean {
  const row = value as Row;
  const fetchedAtMs = milliseconds(row?.fetchedAt);
  return row?.schemaVersion === PROVIDER_CLUB_FACT_CACHE_SCHEMA && row?.provider === "golfapi" && fetchedAtMs !== null && fetchedAtMs <= nowMs && nowMs - fetchedAtMs <= PROVIDER_CLUB_FACT_CACHE_TTL_MS;
}

export function providerClubhouseFromFreshFact(value: unknown, expectedProviderClubId: string, nowMs: number): ProviderClubhouse | null {
  const row = value as Row;
  if (!isFreshProviderClubFact(row, nowMs) || row.providerClubId !== expectedProviderClubId) return null;
  const normalized = normalizeClubhouses({clubs: [{clubID: row.providerClubId, clubName: row.providerClubName, propertyID: row.providerPropertyId, propertyType: row.providerPropertyType, bookable: row.providerBookable, parentClubID: row.providerParentId, address: row.address, address2: row.address2, city: row.city, state: row.state, postalCode: row.postalCode, country: row.country, countryCode: row.countryCode, latitude: row.latitude, longitude: row.longitude, phone: row.phone, mobile: row.mobile, email: row.email, website: row.website, contactPhone: row.contactPhone, contactEmail: row.contactEmail, bookingUrl: row.bookingUrl, reservationUrl: row.reservationUrl, teeTimeUrl: row.teeTimeUrl, reservationPhone: row.reservationPhone, reservationEmail: row.reservationEmail, bookingProviderID: row.bookingProviderId, reservationProviderID: row.reservationProviderId, providerUpdatedAt: row.providerUpdatedAt, courses: Array.isArray(row.layouts) ? row.layouts.map((layout) => ({...(layout as Row), courseID: (layout as Row).providerCourseId, courseName: (layout as Row).providerCourseName, clubID: (layout as Row).providerClubId})) : []}]});
  return normalized.find((clubhouse) => clubhouse.providerClubId === expectedProviderClubId) || null;
}

export function providerRateEvidence(headers: {get(name: string): string | null}): Readonly<{retryAfterSeconds: number | null; limit: string | null; remaining: string | null; reset: string | null}> {
  const raw = text(headers.get("retry-after")); const numeric = raw ? Number(raw) : NaN;
  return Object.freeze({retryAfterSeconds: Number.isFinite(numeric) && numeric >= 0 ? Math.min(86400, Math.floor(numeric)) : null, limit: text(headers.get("x-ratelimit-limit")), remaining: text(headers.get("x-ratelimit-remaining")), reset: text(headers.get("x-ratelimit-reset"))});
}
