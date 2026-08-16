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

export function normalizeCourseCandidates(payload: unknown): Candidate[] {
  const value = payload as {clubs?: unknown[]; data?: unknown[]};
  const clubs = Array.isArray(value?.clubs) ? value.clubs : Array.isArray(value?.data) ? value.data : [];
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
