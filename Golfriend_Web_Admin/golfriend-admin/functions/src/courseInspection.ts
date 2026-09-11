import {normalizeClubDetailCandidates, normalizeCourseCandidates, providerClubs, type Candidate} from "./courseGrowth.js";

export const GOLF_API_INSPECTOR_SCHEMA = "golfriend.golf-api-club-inspection/v1";
export const MAX_INSPECTED_CLUBS = 20;
export const MAX_INSPECTED_COURSES = 100;

export type ClubInspectionInput = {latitude: number; longitude: number; radiusKm: number; searchText: string | null};
export type ProviderFetcher = (path: string) => Promise<unknown>;

const number = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown): string => String(value ?? "").trim().normalize("NFC");
const clubId = (club: Record<string, unknown>): string | null => text(club.clubID ?? club.id) || null;
const clubName = (club: Record<string, unknown>): string => text(club.clubName ?? club.name) || "Unnamed club";
const matches = (name: string, search: string | null): boolean => !search || name.toLocaleLowerCase().includes(search.toLocaleLowerCase());

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

function courseFact(candidate: Candidate) {
  return Object.freeze({courseID: candidate.courseID, courseName: candidate.name, latitude: candidate.latitude, longitude: candidate.longitude});
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
      clubs.push(Object.freeze({clubID: null, clubName: clubName(shell), latitude: number(shell.latitude), longitude: number(shell.longitude), listHadEmbeddedCourses, detailAddedCourseIDs: [], courses: permitted.map(courseFact)}));
      coursesReturned += permitted.length;
      continue;
    }
    const detailPayload = await fetchProvider(`/clubs/${encodeURIComponent(id)}`);
    const detailCandidates = normalizeClubDetailCandidates(shell, detailPayload);
    const permitted = detailCandidates.slice(0, Math.max(0, MAX_INSPECTED_COURSES - coursesReturned));
    const added = permitted.filter((candidate) => !listIds.has(candidate.courseID));
    coursesReturned += permitted.length;
    shellsExpanded++;
    clubs.push(Object.freeze({clubID: id, clubName: clubName(shell), latitude: number(shell.latitude), longitude: number(shell.longitude), listHadEmbeddedCourses, detailAddedCourseIDs: added.map((candidate) => candidate.courseID), courses: permitted.map(courseFact)}));
  }

  return Object.freeze({schemaVersion: GOLF_API_INSPECTOR_SCHEMA, clubs, summary: Object.freeze({clubsReturned: listClubs.length, shellsExpanded, coursesReturned, unresolvedShells})});
}
