import {createHash} from "node:crypto";
import {isManualLocked, isValidCoordinate, isValidProviderId} from "./courseSync.js";

export const COURSE_GROWTH_SCHEMA = "golfriend.course-growth/v1";
export const COURSE_SYNC_RECEIPT_SCHEMA = "golfriend.course-sync-receipt/v1";
export const PROVIDER_CALLS_PER_COURSE = 2;
export const RETRY_DELAYS_MS = Object.freeze([250, 1000, 4000]);

export type Candidate = {
  courseID: string; clubID: string | null; clubName: string; name: string;
  address: string | null; city: string | null; state: string | null;
  country: string | null; latitude: number | null; longitude: number | null;
  /** Explicit relationship only; never use a layout name as a clubhouse alias. */
  providerCourseId?: string; providerClubId?: string | null; clubhouseId?: string | null;
};

export type ProviderCourseLayout = Readonly<{
  providerCourseId: string; providerCourseName: string; providerClubId: string;
  providerParentId: string | null; latitude: number | null; longitude: number | null;
}>;

/** Bounded provider authority for one member-facing golf destination. */
export type ProviderClubhouse = Readonly<{
  providerClubId: string; providerClubName: string; providerParentId: string | null;
  providerPropertyId: string | null; providerPropertyType: string | null; providerBookable: boolean | null;
  address: string | null; address2: string | null; city: string | null; state: string | null;
  postalCode: string | null; country: string | null; countryCode: string | null;
  latitude: number | null; longitude: number | null;
  phone: string | null; mobile: string | null; email: string | null; website: string | null;
  contactPhone: string | null; contactEmail: string | null;
  bookingUrl: string | null; reservationUrl: string | null; teeTimeUrl: string | null;
  reservationPhone: string | null; reservationEmail: string | null;
  bookingProviderId: string | null; reservationProviderId: string | null;
  layouts: readonly ProviderCourseLayout[];
}>;

/**
 * A provider club row is not automatically a Golfriend destination.  The
 * provider is allowed to return a brand shell containing several properties;
 * we only promote it when the response explicitly identifies one property or
 * explicitly calls that club bookable.  Everything else is review material.
 */
export type ClubhouseClassification = Readonly<{
  status: "proven" | "ambiguous";
  reason: "explicit_provider_property" | "explicit_provider_bookable_club" | "provider_hierarchy_ambiguous";
  canonicalClubhouseId: string | null;
}>;

export function classifyClubhouse(provider: ProviderClubhouse): ClubhouseClassification {
  if (provider.providerPropertyId) return Object.freeze({status: "proven", reason: "explicit_provider_property", canonicalClubhouseId: `golfapi-property-${provider.providerPropertyId}`});
  if (provider.providerBookable === true) return Object.freeze({status: "proven", reason: "explicit_provider_bookable_club", canonicalClubhouseId: `golfapi-club-${provider.providerClubId}`});
  return Object.freeze({status: "ambiguous", reason: "provider_hierarchy_ambiguous", canonicalClubhouseId: null});
}

export type ClubExpansionPlan = {
  candidates: Candidate[];
  clubhouses: ProviderClubhouse[];
  expandedClubIds: string[];
  unresolvedClubShells: Array<{clubID: string | null; clubName: string}>;
};

const text = (value: unknown, fallback = ""): string =>
  String(value ?? fallback).trim().normalize("NFC");
const finite = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const optionalText = (value: unknown, max = 512): string | null => {
  const normalized = text(value);
  return normalized ? normalized.slice(0, max) : null;
};
const field = (row: Record<string, unknown>, keys: readonly string[], max?: number): string | null => {
  for (const key of keys) {
    const value = optionalText(row[key], max);
    if (value) return value;
  }
  return null;
};

export function requireProviderConfiguration(apiKey: string): string {
  const value = text(apiKey);
  if (!value) throw new Error("PROVIDER_UNCONFIGURED");
  return value;
}

export function providerClubs(payload: unknown): Record<string, unknown>[] {
  const value = payload as {clubs?: unknown[]; club?: unknown; data?: unknown};
  const data = value?.data as {clubs?: unknown[]; club?: unknown} | undefined;
  const rows = Array.isArray(value?.clubs) ? value.clubs :
    Array.isArray(value?.data) ? value.data :
      Array.isArray(data?.clubs) ? data.clubs :
        value?.club ? [value.club] : data?.club ? [data.club] :
          data && typeof data === "object" ? [data] :
            value && typeof value === "object" ? [value] : [];
  return rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

export function normalizeClubhouses(payload: unknown): ProviderClubhouse[] {
  const unique = new Map<string, ProviderClubhouse>();
  for (const rawClub of providerClubs(payload)) {
    const providerClubId = field(rawClub, ["clubID", "clubId", "id"], 160);
    const providerPropertyId = field(rawClub, ["propertyID", "propertyId", "propertyIdentifier"], 160);
    const providerIdentity = `${providerClubId || ""}:${providerPropertyId || "club"}`;
    if (!providerClubId || !isValidProviderId(providerClubId) || unique.has(providerIdentity)) continue;
    const layouts = (Array.isArray(rawClub.courses) ? rawClub.courses : [])
      .filter((course): course is Record<string, unknown> => !!course && typeof course === "object")
      .map((course) => {
        const providerCourseId = field(course, ["courseID", "courseId", "id"], 160);
        if (!providerCourseId || !isValidProviderId(providerCourseId)) return null;
        return Object.freeze({providerCourseId, providerCourseName: field(course, ["courseName", "name"]) || "Unnamed course", providerClubId: field(course, ["clubID", "clubId", "club_id"], 160) || providerClubId, providerParentId: field(course, ["parentCourseID", "parentCourseId", "parentClubID", "parentClubId", "parentID", "parentId"], 160), latitude: finite(course.latitude), longitude: finite(course.longitude)});
      }).filter((layout): layout is ProviderCourseLayout => !!layout)
      .sort((a, b) => a.providerCourseId.localeCompare(b.providerCourseId));
    unique.set(providerIdentity, Object.freeze({
      providerClubId, providerClubName: field(rawClub, ["clubName", "name"]) || "Unnamed club",
      providerParentId: field(rawClub, ["parentClubID", "parentClubId", "parentID", "parentId"], 160), providerPropertyId, providerPropertyType: field(rawClub, ["propertyType", "clubType", "type"], 128), providerBookable: typeof rawClub.bookable === "boolean" ? rawClub.bookable : typeof rawClub.isBookable === "boolean" ? rawClub.isBookable : null,
      address: field(rawClub, ["address"]), address2: field(rawClub, ["address2"]), city: field(rawClub, ["city"]), state: field(rawClub, ["state", "province"]), postalCode: field(rawClub, ["postalCode", "postal_code"]), country: field(rawClub, ["country"]), countryCode: field(rawClub, ["countryCode", "country_code"], 16), latitude: finite(rawClub.latitude), longitude: finite(rawClub.longitude),
      phone: field(rawClub, ["phone", "telephone"], 128), mobile: field(rawClub, ["mobile", "mobilePhone", "cellPhone"], 128), email: field(rawClub, ["email"], 320), website: field(rawClub, ["website", "url"], 2048), contactPhone: field(rawClub, ["contactPhone"], 128), contactEmail: field(rawClub, ["contactEmail"], 320), bookingUrl: field(rawClub, ["bookingUrl"], 2048), reservationUrl: field(rawClub, ["reservationUrl"], 2048), teeTimeUrl: field(rawClub, ["teeTimeUrl"], 2048), reservationPhone: field(rawClub, ["reservationPhone", "bookingPhone"], 128), reservationEmail: field(rawClub, ["reservationEmail", "bookingEmail"], 320), bookingProviderId: field(rawClub, ["bookingProviderID", "bookingProviderId", "bookingID", "bookingId"], 160), reservationProviderId: field(rawClub, ["reservationProviderID", "reservationProviderId", "reservationID", "reservationId"], 160), layouts: Object.freeze(layouts),
    }));
  }
  return [...unique.values()].sort((a, b) => a.providerClubId.localeCompare(b.providerClubId) || String(a.providerPropertyId || "").localeCompare(String(b.providerPropertyId || "")));
}

export function courseCandidatesFromClubhouses(clubhouses: readonly ProviderClubhouse[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const clubhouse of clubhouses) for (const layout of clubhouse.layouts) if (!unique.has(layout.providerCourseId)) {
    const classification = classifyClubhouse(clubhouse);
    unique.set(layout.providerCourseId, {
    courseID: layout.providerCourseId, providerCourseId: layout.providerCourseId, clubID: clubhouse.providerClubId, providerClubId: clubhouse.providerClubId, clubhouseId: classification.canonicalClubhouseId, clubName: clubhouse.providerClubName, name: layout.providerCourseName, address: clubhouse.address, city: clubhouse.city, state: clubhouse.state, country: clubhouse.country, latitude: clubhouse.latitude, longitude: clubhouse.longitude,
  });
  }
  return [...unique.values()].sort((a, b) => a.courseID.localeCompare(b.courseID));
}

/** Compatibility projection for course-only callers. Canonical callers use normalizeClubhouses. */
export function normalizeCourseCandidates(payload: unknown): Candidate[] {
  const canonical = courseCandidatesFromClubhouses(normalizeClubhouses(payload));
  // A provider row without a club id cannot become a clubhouse. Preserve its existing
  // course-only behavior for review/quarantine rather than fabricating a destination.
  const legacy = providerClubs(payload).flatMap((club) => {
    if (field(club, ["clubID", "clubId", "id"], 160)) return [];
    return (Array.isArray(club.courses) ? club.courses : []).flatMap((rawCourse) => {
      if (!rawCourse || typeof rawCourse !== "object") return [];
      const course = rawCourse as Record<string, unknown>;
      const courseID = field(course, ["courseID", "courseId", "id"], 160);
      return courseID && isValidProviderId(courseID) ? [{courseID, providerCourseId: courseID, clubID: null, providerClubId: null, clubhouseId: null, clubName: field(club, ["clubName", "name"]) || "Unnamed club", name: field(course, ["courseName", "name"]) || "Unnamed course", address: field(club, ["address"]), city: field(club, ["city"]), state: field(club, ["state", "province"]), country: field(club, ["country"]), latitude: finite(club.latitude), longitude: finite(club.longitude)}] : [];
    });
  });
  const unique = new Map<string, Candidate>();
  for (const candidate of [...canonical, ...legacy].sort((a, b) => a.courseID.localeCompare(b.courseID))) if (!unique.has(candidate.courseID)) unique.set(candidate.courseID, candidate);
  return [...unique.values()];
}

/** A list row is complete only with explicit provider evidence, never merely because it has one course. */
export function hasCompleteEmbeddedCourses(club: Record<string, unknown>): boolean {
  const courseIds = Array.isArray(club.courses) ? club.courses
    .map((course) => text((course as Record<string, unknown>)?.courseID || (course as Record<string, unknown>)?.id))
    .filter(isValidProviderId) : [];
  if (!courseIds.length) return false;
  if (club.coursesComplete === true || club.isComplete === true) return true;
  const declared = finite(club.courseCount ?? club.totalCourses ?? club.course_count);
  return declared !== null && Number.isInteger(declared) && declared > 0 && declared === new Set(courseIds).size;
}

function withShellContext(detail: Record<string, unknown>, shell: Record<string, unknown>): Record<string, unknown> {
  return {
    ...shell, ...detail,
    clubID: detail.clubID ?? detail.id ?? shell.clubID ?? shell.id,
    clubName: detail.clubName ?? detail.name ?? shell.clubName ?? shell.name,
    courses: Array.isArray(detail.courses) ? detail.courses : [],
  };
}

/** Normalizes a club-detail response with the list row retained as fallback context. */
export function normalizeClubDetailCandidates(shell: Record<string, unknown>, detailPayload: unknown): Candidate[] {
  return courseCandidatesFromClubhouses(normalizeClubDetailClubhouses(shell, detailPayload));
}

export function normalizeClubDetailClubhouses(shell: Record<string, unknown>, detailPayload: unknown): ProviderClubhouse[] { return normalizeClubhouses({clubs: providerClubs(detailPayload).map((detail) => withShellContext(detail, shell))}); }

/** Resolve incomplete list rows through the existing provider club-detail endpoint before write planning. */
export async function expandClubShells(listPayload: unknown, fetchClubDetail: (clubID: string) => Promise<unknown>): Promise<ClubExpansionPlan> {
  const clubhouses: ProviderClubhouse[] = [];
  const expandedClubIds: string[] = [];
  const unresolvedClubShells: Array<{clubID: string | null; clubName: string}> = [];
  for (const club of providerClubs(listPayload)) {
    if (hasCompleteEmbeddedCourses(club)) {
      clubhouses.push(...normalizeClubhouses({clubs: [club]}));
      continue;
    }
    const clubID = text(club.clubID || club.id) || null;
    const clubName = text(club.clubName || club.name, "Unnamed club");
    if (!clubID) { unresolvedClubShells.push({clubID, clubName}); continue; }
    const detailPayload = await fetchClubDetail(clubID);
    const detailClubs = providerClubs(detailPayload);
    if (!detailClubs.length) { unresolvedClubShells.push({clubID, clubName}); continue; }
    expandedClubIds.push(clubID);
    clubhouses.push(...normalizeClubDetailClubhouses(club, detailPayload));
  }
  const uniqueClubhouses = new Map<string, ProviderClubhouse>();
  for (const clubhouse of clubhouses) { const key = `${clubhouse.providerClubId}:${clubhouse.providerPropertyId || "club"}`; if (!uniqueClubhouses.has(key)) uniqueClubhouses.set(key, clubhouse); }
  const canonicalClubhouses = [...uniqueClubhouses.values()].sort((a, b) => a.providerClubId.localeCompare(b.providerClubId) || String(a.providerPropertyId || "").localeCompare(String(b.providerPropertyId || "")));
  return {candidates: courseCandidatesFromClubhouses(canonicalClubhouses), clubhouses: canonicalClubhouses, expandedClubIds, unresolvedClubShells};
}

export function previewProviderAttemptReservation(clubShellCount: number): number {
  if (!Number.isInteger(clubShellCount) || clubShellCount < 0) throw new Error("INVALID_CLUB_SHELL_COUNT");
  return (1 + clubShellCount) * (RETRY_DELAYS_MS.length + 1);
}

export function planCourseUpserts(candidates: readonly Candidate[], existingIds: ReadonlySet<string>): {create: Candidate[]; skippedExisting: string[]} {
  const create: Candidate[] = [], skippedExisting: string[] = [];
  for (const candidate of candidates) {
    if (existingIds.has(candidate.courseID)) skippedExisting.push(candidate.courseID);
    else create.push(candidate);
  }
  return {create, skippedExisting};
}

export function assertQuotaAvailable(usage: unknown, requestedCalls: number): {limit: number; used: number; remainingAfter: number} {
  const value = usage as {monthlyLimit?: unknown; estimatedCallsUsed?: unknown};
  const limit = Number(value?.monthlyLimit), used = Number(value?.estimatedCallsUsed || 0);
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isFinite(used) || used < 0) throw new Error("QUOTA_UNCONFIGURED");
  if (!Number.isInteger(requestedCalls) || requestedCalls < 0 || used + requestedCalls > limit) throw new Error("QUOTA_EXHAUSTED");
  return {limit, used, remainingAfter: limit - used - requestedCalls};
}

export async function withDeterministicRetry<T>(operation: () => Promise<T>, wait: (delayMs: number) => Promise<void>, shouldRetry: (error: unknown) => boolean = () => true): Promise<{value: T; attempts: number}> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try { return {value: await operation(), attempts: attempt + 1}; } catch (error) {
      last = error;
      if (attempt === RETRY_DELAYS_MS.length || !shouldRetry(error)) break;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw last;
}

export function buildCourseGrowthRecord(candidate: Candidate, details: Record<string, unknown>, coordinates: Record<string, unknown>, existing?: Record<string, unknown>): Record<string, unknown> {
  const detailLat = finite(details.latitude) ?? candidate.latitude;
  const detailLng = finite(details.longitude) ?? candidate.longitude;
  const firstGreen = Array.isArray(coordinates.greens) ? coordinates.greens[0] as Record<string, unknown> | undefined : undefined;
  const providerLat = isValidCoordinate(detailLat, detailLng) ? detailLat : finite(firstGreen?.latitude);
  const providerLng = isValidCoordinate(detailLat, detailLng) ? detailLng : finite(firstGreen?.longitude);
  const preserve = existing && isManualLocked(existing);
  const existingLat = finite(existing?.latitude ?? existing?.lat);
  const existingLng = finite(existing?.longitude ?? existing?.lng);
  const latitude = preserve && isValidCoordinate(existingLat, existingLng) ? existingLat : isValidCoordinate(providerLat, providerLng) ? providerLat : null;
  const longitude = preserve && isValidCoordinate(existingLat, existingLng) ? existingLng : isValidCoordinate(providerLat, providerLng) ? providerLng : null;
  const requiresCoordinatorReview = !isValidCoordinate(latitude, longitude);
  return {
    ...candidate, providerCourseId: candidate.providerCourseId || candidate.courseID, providerClubId: candidate.providerClubId || candidate.clubID, clubhouseId: candidate.clubhouseId || null, latitude, longitude, lat: latitude, lng: longitude,
    holes: Array.isArray(details.holes) ? details.holes : [],
    greenCoordinates: Array.isArray(coordinates.greens) ? coordinates.greens : [],
    bunkerCoordinates: Array.isArray(coordinates.bunkers) ? coordinates.bunkers : [],
    waterCoordinates: Array.isArray(coordinates.water) ? coordinates.water : [],
    localization: {defaultLocale: "und", names: {und: candidate.name}, clubNames: {und: candidate.clubName}},
    schemaVersion: COURSE_GROWTH_SCHEMA, source: "golfapi", apiImported: true,
    requiresCoordinatorReview, isActive: !requiresCoordinatorReview,
  };
}

/** Canonical member-facing destination; layouts are deliberately not copied into its display identity. */
export function buildClubhouseRecord(clubhouse: ProviderClubhouse): Record<string, unknown> {
  const classification = classifyClubhouse(clubhouse);
  if (classification.status !== "proven" || !classification.canonicalClubhouseId) throw new Error("AMBIGUOUS_CLUBHOUSE_HIERARCHY");
  const coordinatesValid = isValidCoordinate(clubhouse.latitude, clubhouse.longitude);
  const location = {address: clubhouse.address, address2: clubhouse.address2, city: clubhouse.city, state: clubhouse.state, postalCode: clubhouse.postalCode, country: clubhouse.country, countryCode: clubhouse.countryCode, latitude: coordinatesValid ? clubhouse.latitude : null, longitude: coordinatesValid ? clubhouse.longitude : null, coordinateValidity: coordinatesValid ? "valid" : "invalid_or_missing"};
  return {schema: "golfriend.v2.clubhouse.v3", schemaVersion: 3, clubhouseId: classification.canonicalClubhouseId, provider: "golf-api", providerClubId: clubhouse.providerClubId, providerPropertyId: clubhouse.providerPropertyId, providerParentId: clubhouse.providerParentId, providerPropertyType: clubhouse.providerPropertyType, displayName: clubhouse.providerClubName, country: clubhouse.country, countryCode: clubhouse.countryCode, location, classification, contactFacts: {phone: clubhouse.phone, mobile: clubhouse.mobile, email: clubhouse.email, website: clubhouse.website, contactPhone: clubhouse.contactPhone, contactEmail: clubhouse.contactEmail}, reservationFacts: {bookingUrl: clubhouse.bookingUrl, reservationUrl: clubhouse.reservationUrl, teeTimeUrl: clubhouse.teeTimeUrl, reservationPhone: clubhouse.reservationPhone, reservationEmail: clubhouse.reservationEmail, bookingProviderId: clubhouse.bookingProviderId, reservationProviderId: clubhouse.reservationProviderId}, bookingAuthority: {status: "unavailable", channelType: null, authorityId: null, verificationSource: null, verifiedAt: null}, sourceProvenance: {identity: classification.reason, contactReservationFacts: "golf_api_provider_fact", bookingAuthority: "not_verified"}, childCourseIds: clubhouse.layouts.map((layout) => layout.providerCourseId), childCourseCount: clubhouse.layouts.length};
}

export function deterministicReceiptId(jobId: string): string {
  return `course_sync_${createHash("sha256").update(`${COURSE_SYNC_RECEIPT_SCHEMA}:${jobId}`).digest("hex").slice(0, 24)}`;
}
