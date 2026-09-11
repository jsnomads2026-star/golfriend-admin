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
};

export type ClubExpansionPlan = {
  candidates: Candidate[];
  expandedClubIds: string[];
  unresolvedClubShells: Array<{clubID: string | null; clubName: string}>;
};

const text = (value: unknown, fallback = ""): string =>
  String(value ?? fallback).trim().normalize("NFC");
const finite = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export function normalizeCourseCandidates(payload: unknown): Candidate[] {
  const clubs = providerClubs(payload);
  const candidates: Candidate[] = [];
  for (const rawClub of clubs) {
    const club = rawClub as Record<string, unknown>;
    const courses = Array.isArray(club.courses) ? club.courses : [];
    for (const rawCourse of courses) {
      const course = rawCourse as Record<string, unknown>;
      const courseID = text(course.courseID || course.id);
      if (!isValidProviderId(courseID)) continue;
      candidates.push({
        courseID,
        clubID: text(club.clubID || club.id) || null,
        clubName: text(club.clubName || club.name, "Unnamed club"),
        name: text(course.courseName || course.name, "Unnamed course"),
        address: text(club.address) || null, city: text(club.city) || null,
        state: text(club.state) || null, country: text(club.country) || null,
        latitude: finite(club.latitude), longitude: finite(club.longitude),
      });
    }
  }
  candidates.sort((a, b) => a.courseID.localeCompare(b.courseID) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) if (!unique.has(candidate.courseID)) unique.set(candidate.courseID, candidate);
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

/** Resolve incomplete list rows through the existing provider club-detail endpoint before write planning. */
export async function expandClubShells(listPayload: unknown, fetchClubDetail: (clubID: string) => Promise<unknown>): Promise<ClubExpansionPlan> {
  const candidates: Candidate[] = [];
  const expandedClubIds: string[] = [];
  const unresolvedClubShells: Array<{clubID: string | null; clubName: string}> = [];
  for (const club of providerClubs(listPayload)) {
    if (hasCompleteEmbeddedCourses(club)) {
      candidates.push(...normalizeCourseCandidates({clubs: [club]}));
      continue;
    }
    const clubID = text(club.clubID || club.id) || null;
    const clubName = text(club.clubName || club.name, "Unnamed club");
    if (!clubID) { unresolvedClubShells.push({clubID, clubName}); continue; }
    const detailClubs = providerClubs(await fetchClubDetail(clubID));
    if (!detailClubs.length) { unresolvedClubShells.push({clubID, clubName}); continue; }
    expandedClubIds.push(clubID);
    for (const detail of detailClubs) candidates.push(...normalizeCourseCandidates({clubs: [withShellContext(detail, club)]}));
  }
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates.sort((a, b) => a.courseID.localeCompare(b.courseID))) if (!unique.has(candidate.courseID)) unique.set(candidate.courseID, candidate);
  return {candidates: [...unique.values()], expandedClubIds, unresolvedClubShells};
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
    ...candidate, latitude, longitude, lat: latitude, lng: longitude,
    holes: Array.isArray(details.holes) ? details.holes : [],
    greenCoordinates: Array.isArray(coordinates.greens) ? coordinates.greens : [],
    bunkerCoordinates: Array.isArray(coordinates.bunkers) ? coordinates.bunkers : [],
    waterCoordinates: Array.isArray(coordinates.water) ? coordinates.water : [],
    localization: {defaultLocale: "und", names: {und: candidate.name}, clubNames: {und: candidate.clubName}},
    schemaVersion: COURSE_GROWTH_SCHEMA, source: "golfapi", apiImported: true,
    requiresCoordinatorReview, isActive: !requiresCoordinatorReview,
  };
}

export function deterministicReceiptId(jobId: string): string {
  return `course_sync_${createHash("sha256").update(`${COURSE_SYNC_RECEIPT_SCHEMA}:${jobId}`).digest("hex").slice(0, 24)}`;
}
