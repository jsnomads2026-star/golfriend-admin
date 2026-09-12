import {normalizeClubDetailCandidates, normalizeCourseCandidates, providerClubs, type Candidate} from "./courseGrowth.js";

export const GOLF_API_INSPECTOR_SCHEMA = "golfriend.golf-api-club-inspection/v2";
export const MAX_INSPECTED_CLUBS = 20;
export const MAX_INSPECTED_COURSES = 100;

export type ClubInspectionInput = {latitude: number; longitude: number; radiusKm: number; searchText: string | null};
export type ProviderFetcher = (path: string) => Promise<unknown>;
type ProviderRow = Record<string, unknown>;

const number = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown): string => String(value ?? "").trim().normalize("NFC");
const scalarText = (value: unknown, maxLength = 512): string | null =>
  (typeof value === "string" || typeof value === "number") && text(value).length <= maxLength ? text(value) || null : null;
const firstText = (row: ProviderRow, keys: readonly string[], maxLength = 512): string | null => {
  for (const key of keys) {
    const value = scalarText(row[key], maxLength);
    if (value) return value;
  }
  return null;
};
const firstNumber = (row: ProviderRow, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = number(row[key]);
    if (value !== null) return value;
  }
  return null;
};
const clubId = (club: ProviderRow): string | null => firstText(club, ["clubID", "clubId", "id"], 160);
const clubName = (club: ProviderRow): string => firstText(club, ["clubName", "name"], 512) || "Unnamed club";
const matches = (name: string, search: string | null): boolean => !search || name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
const coordinatePair = (row: ProviderRow, fallback?: Candidate): {latitude: number | null; longitude: number | null} => ({
  latitude: firstNumber(row, ["latitude", "lat"]) ?? fallback?.latitude ?? null,
  longitude: firstNumber(row, ["longitude", "lng", "lon"]) ?? fallback?.longitude ?? null,
});
const validCoordinates = (latitude: number | null, longitude: number | null): latitude is number =>
  latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

/** Great-circle distance is calculated locally; provider radius filtering is never proof. */
export function distanceKm(origin: Pick<ClubInspectionInput, "latitude" | "longitude">, latitude: number | null, longitude: number | null): number | null {
  if (latitude === null || longitude === null || !validCoordinates(latitude, longitude)) return null;
  const radians = Math.PI / 180;
  const latDelta = (latitude - origin.latitude) * radians;
  const lonDelta = (longitude - origin.longitude) * radians;
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(origin.latitude * radians) * Math.cos(latitude * radians) * Math.sin(lonDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function normalizeClubInspectionInput(value: unknown): ClubInspectionInput {
  const input = value as Record<string, unknown> | null;
  const latitude = number(input?.latitude), longitude = number(input?.longitude);
  const radius = number(input?.radiusKm);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new TypeError("INVALID_COORDINATES");
  if (radius === null || !Number.isInteger(radius) || radius < 1 || radius > 200) throw new TypeError("INVALID_RADIUS");
  const search = input?.searchText === undefined || input?.searchText === null ? null : text(input.searchText);
  if (search !== null && (search.length < 1 || search.length > 80)) throw new TypeError("INVALID_SEARCH_TEXT");
  return Object.freeze({latitude, longitude, radiusKm: radius, searchText: search || null});
}

function explicitAuthority(row: ProviderRow) {
  return Object.freeze({
    address: firstText(row, ["address", "address1", "streetAddress"]),
    city: firstText(row, ["city", "town"]),
    state: firstText(row, ["state", "province", "region"]),
    country: firstText(row, ["country", "countryName"]),
    countryCode: firstText(row, ["countryCode", "country_code", "isoCountryCode"], 16),
    phone: firstText(row, ["phone", "phoneNumber", "telephone"], 128),
    email: firstText(row, ["email", "contactEmail"], 320),
    website: firstText(row, ["website", "websiteUrl", "url"], 2048),
    bookingUrl: firstText(row, ["bookingUrl", "bookingURL"], 2048),
    reservationUrl: firstText(row, ["reservationUrl", "reservationURL"], 2048),
    reservationPhone: firstText(row, ["reservationPhone", "bookingPhone"], 128),
    reservationEmail: firstText(row, ["reservationEmail", "bookingEmail"], 320),
    contactPhone: firstText(row, ["contactPhone"], 128),
    contactEmail: firstText(row, ["contactEmail"], 320),
    providerParentId: firstText(row, ["parentClubID", "parentClubId", "parentID", "parentId"], 160),
    providerPropertyId: firstText(row, ["propertyID", "propertyId", "propertyIdentifier"], 160),
    providerPropertyType: firstText(row, ["propertyType", "clubType", "type"], 128),
    providerBookable: typeof row.bookable === "boolean" ? row.bookable : typeof row.isBookable === "boolean" ? row.isBookable : null,
  });
}

function rawCourses(row: ProviderRow): ProviderRow[] {
  return Array.isArray(row.courses) ? row.courses.filter((course): course is ProviderRow => !!course && typeof course === "object") : [];
}

function courseFact(candidate: Candidate, rawCourse: ProviderRow | undefined, providerClubId: string | null) {
  const source = rawCourse || {};
  const coordinates = coordinatePair(source, candidate);
  const providerCourseId = firstText(source, ["courseID", "courseId", "id"], 160) || candidate.courseID;
  const relationship = firstText(source, ["clubID", "clubId", "club_id"], 160) || providerClubId;
  return Object.freeze({
    // Existing fields remain for the already-deployed Admin renderer.
    courseID: providerCourseId,
    courseName: firstText(source, ["courseName", "name"]) || candidate.name,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    // Explicit club-house authority facts.
    providerCourseId,
    providerCourseName: firstText(source, ["courseName", "name"]),
    providerClubId: relationship,
    providerParentId: firstText(source, ["parentCourseID", "parentCourseId", "parentClubID", "parentClubId", "parentID", "parentId"], 160),
    coordinatesAvailable: validCoordinates(coordinates.latitude, coordinates.longitude),
    geometryAvailable: source.geometry !== undefined || source.coordinates !== undefined || source.greens !== undefined,
  });
}

function clubFact(input: ClubInspectionInput, shell: ProviderRow, detail: ProviderRow, candidates: Candidate[], listIds: Set<string>, listHadEmbeddedCourses: boolean, providerClubId: string | null) {
  const raw = {...shell, ...detail};
  const coordinates = coordinatePair(raw);
  const localDistanceKm = distanceKm(input, coordinates.latitude, coordinates.longitude);
  const detailCourses = new Map(rawCourses(raw).map((course) => [firstText(course, ["courseID", "courseId", "id"], 160), course] as const));
  const courses = candidates.map((candidate) => courseFact(candidate, detailCourses.get(candidate.courseID), providerClubId));
  const detailAddedCourseIDs = courses.filter((course) => !listIds.has(course.providerCourseId)).map((course) => course.providerCourseId);
  return Object.freeze({
    // Legacy fields remain for the existing no-write Admin control.
    clubID: providerClubId,
    clubName: clubName(raw),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    listHadEmbeddedCourses,
    detailAddedCourseIDs,
    courses,
    // Bounded, allowlisted provider authority facts.
    providerClubId,
    providerClubName: firstText(raw, ["clubName", "name"]),
    ...explicitAuthority(raw),
    distanceKm: localDistanceKm,
    withinRequestedRadius: localDistanceKm !== null && localDistanceKm <= input.radiusKm,
  });
}

/**
 * Pure inspection plan: it has no Firestore dependency and cannot create
 * catalog, quota, receipt, or preview-job records. Provider paths are bounded.
 */
export async function inspectClubRegion(input: ClubInspectionInput, fetchProvider: ProviderFetcher) {
  const listPayload = await fetchProvider(`/clubs?lat=${encodeURIComponent(input.latitude)}&lng=${encodeURIComponent(input.longitude)}&radius=${input.radiusKm}`);
  const listClubs = providerClubs(listPayload).filter((club) => matches(clubName(club), input.searchText)).slice(0, MAX_INSPECTED_CLUBS);
  const clubs: Array<Record<string, unknown>> = [];
  const unresolvedShells: Array<{clubID: string | null; clubName: string}> = [];
  let shellsExpanded = 0;
  let coursesReturned = 0;

  for (const shell of listClubs) {
    const id = clubId(shell);
    const listCandidates = normalizeCourseCandidates({clubs: [shell]});
    const listIds = new Set(listCandidates.map((candidate) => candidate.courseID));
    const listHadEmbeddedCourses = Array.isArray(shell.courses) && shell.courses.length > 0;
    if (!id) {
      unresolvedShells.push({clubID: null, clubName: clubName(shell)});
      const permitted = listCandidates.slice(0, Math.max(0, MAX_INSPECTED_COURSES - coursesReturned));
      clubs.push(clubFact(input, shell, {}, permitted, listIds, listHadEmbeddedCourses, null));
      coursesReturned += permitted.length;
      continue;
    }
    const detailPayload = await fetchProvider(`/clubs/${encodeURIComponent(id)}`);
    const detailRows = providerClubs(detailPayload);
    const detail = detailRows.find((row) => clubId(row) === id) || detailRows[0] || {};
    const detailCandidates = normalizeClubDetailCandidates(shell, detailPayload);
    const permitted = detailCandidates.slice(0, Math.max(0, MAX_INSPECTED_COURSES - coursesReturned));
    coursesReturned += permitted.length;
    shellsExpanded++;
    clubs.push(clubFact(input, shell, detail, permitted, listIds, listHadEmbeddedCourses, id));
  }

  return Object.freeze({schemaVersion: GOLF_API_INSPECTOR_SCHEMA, clubs, summary: Object.freeze({clubsReturned: listClubs.length, shellsExpanded, coursesReturned, unresolvedShells})});
}
