import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {isActiveStaff} from "./authority.js";

if (!admin.apps.length) admin.initializeApp();
const GOLF_API_KEY = defineSecret("GOLF_API_KEY");
const db = admin.firestore();
const API_BASE = "https://www.golfapi.io/api/v2.3";
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_COURSES_PER_COMMIT = 50;

type Candidate = {
  courseID: string;
  clubID: string | null;
  clubName: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validLatitude(value: number | null): value is number {
  return value !== null && value >= -90 && value <= 90;
}

function validLongitude(value: number | null): value is number {
  return value !== null && value >= -180 && value <= 180;
}

function normaliseCandidates(payload: any): Candidate[] {
  const clubs = Array.isArray(payload?.clubs) ? payload.clubs :
    Array.isArray(payload?.data) ? payload.data : [];
  const byCourseId = new Map<string, Candidate>();

  for (const club of clubs) {
    for (const course of Array.isArray(club?.courses) ? club.courses : []) {
      const courseID = String(course?.courseID || course?.id || "").trim();
      if (!courseID || courseID === "unknown") continue;
      byCourseId.set(courseID, {
        courseID,
        clubID: club?.clubID || club?.id ? String(club.clubID || club.id) : null,
        clubName: String(club?.clubName || club?.name || "Unknown Club"),
        name: String(course?.courseName || course?.name || "Main Course"),
        address: club?.address ? String(club.address) : null,
        city: club?.city ? String(club.city) : null,
        state: club?.state ? String(club.state) : null,
        country: club?.country ? String(club.country) : null,
        latitude: finiteNumber(club?.latitude),
        longitude: finiteNumber(club?.longitude),
      });
    }
  }
  return [...byCourseId.values()];
}

async function requireCoordinator(uid: string): Promise<void> {
  const adminUser = await db.collection("admin_users").doc(uid).get();
  if (!adminUser.exists || !isActiveStaff(adminUser.data())) {
    throw new HttpsError("permission-denied", "Course ingestion requires an authorised coordinator.");
  }
}

async function golfApiGet(path: string, apiKey: string): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {Authorization: `Bearer ${apiKey}`},
  });
  if (response.status === 403 || response.status === 429) {
    throw new HttpsError("resource-exhausted", `Golf API quota rejected the request (${response.status}).`);
  }
  if (!response.ok) {
    throw new HttpsError("unavailable", `Golf API request failed (${response.status}).`);
  }
  return response.json();
}

export const previewCourseRegionImport = onCall({
  secrets: [GOLF_API_KEY],
  memory: "512MiB",
  timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);

  const latitude = finiteNumber(request.data?.latitude);
  const longitude = finiteNumber(request.data?.longitude);
  const radiusKm = Math.min(200, Math.max(1, Math.round(finiteNumber(request.data?.radiusKm) || 50)));
  if (!validLatitude(latitude) || !validLongitude(longitude)) {
    throw new HttpsError("invalid-argument", "Valid latitude and longitude are required.");
  }

  const discovery = await golfApiGet(
    `/clubs?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&radius=${radiusKm}`,
    GOLF_API_KEY.value(),
  );
  const discovered = normaliseCandidates(discovery);
  const refs = discovered.map((course) => db.collection("courses").doc(course.courseID));
  const existingSnapshots = refs.length ? await db.getAll(...refs) : [];
  const existingIds = new Set(existingSnapshots.filter((doc) => doc.exists).map((doc) => doc.id));
  const missing = discovered.filter((course) => !existingIds.has(course.courseID));

  const jobRef = db.collection("course_ingestion_jobs").doc();
  await jobRef.set({
    status: "previewed",
    requestedBy: request.auth.uid,
    region: {latitude, longitude, radiusKm},
    discoveredCount: discovered.length,
    existingCount: existingIds.size,
    missingCount: missing.length,
    candidates: missing.slice(0, MAX_COURSES_PER_COMMIT),
    truncated: missing.length > MAX_COURSES_PER_COMMIT,
    apiCallsUsed: 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + JOB_TTL_MS),
  });

  await db.collection("platform").doc("golfApiUsage").set({
    estimatedCallsUsed: admin.firestore.FieldValue.increment(1),
    lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
    lastPreviewJobId: jobRef.id,
  }, {merge: true});

  return {
    jobId: jobRef.id,
    discovered: discovered.length,
    alreadyInFirebase: existingIds.size,
    newCoursesReady: Math.min(missing.length, MAX_COURSES_PER_COMMIT),
    remainingAfterBatch: Math.max(0, missing.length - MAX_COURSES_PER_COMMIT),
    apiCallsUsed: 1,
    courses: missing.slice(0, MAX_COURSES_PER_COMMIT).map(({courseID, clubName, name, country}) =>
      ({courseID, clubName, name, country})),
  };
});

export const commitCourseRegionImport = onCall({
  secrets: [GOLF_API_KEY],
  memory: "1GiB",
  timeoutSeconds: 540,
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to Admin first.");
  await requireCoordinator(request.auth.uid);
  const jobId = String(request.data?.jobId || "").trim();
  if (!jobId) throw new HttpsError("invalid-argument", "A preview job ID is required.");

  const jobRef = db.collection("course_ingestion_jobs").doc(jobId);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const job = snapshot.data();
    if (!snapshot.exists || !job) throw new HttpsError("not-found", "Preview job not found.");
    if (job.requestedBy !== request.auth?.uid) throw new HttpsError("permission-denied", "This preview belongs to another coordinator.");
    if (job.status !== "previewed") throw new HttpsError("failed-precondition", "Preview was already committed or cancelled.");
    if (job.expiresAt?.toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Preview expired; run it again.");
    transaction.update(jobRef, {status: "running", startedAt: admin.firestore.FieldValue.serverTimestamp()});
    return job;
  });

  const candidates = (Array.isArray(claimed.candidates) ? claimed.candidates : []).slice(0, MAX_COURSES_PER_COMMIT) as Candidate[];
  let added = 0;
  let skippedExisting = 0;
  let reviewRequired = 0;
  let failed = 0;
  let apiCallsUsed = 0;
  const errors: Array<{courseID: string; message: string}> = [];

  for (const candidate of candidates) {
    const courseRef = db.collection("courses").doc(candidate.courseID);
    if ((await courseRef.get()).exists) {
      skippedExisting++;
      continue;
    }
    try {
      const courseResponse = await golfApiGet(`/courses/${encodeURIComponent(candidate.courseID)}`, GOLF_API_KEY.value());
      apiCallsUsed++;
      const course = courseResponse?.data || courseResponse || {};
      let latitude = finiteNumber(course.latitude) ?? candidate.latitude;
      let longitude = finiteNumber(course.longitude) ?? candidate.longitude;
      const coordinateResponse = await golfApiGet(`/coordinates/${encodeURIComponent(candidate.courseID)}`, GOLF_API_KEY.value());
      apiCallsUsed++;
      const coordinates: any = coordinateResponse?.data || coordinateResponse || {};

      if (!validLatitude(latitude) || !validLongitude(longitude)) {
        const firstGreen = Array.isArray(coordinates.greens) ? coordinates.greens[0] : null;
        latitude = finiteNumber(firstGreen?.latitude);
        longitude = finiteNumber(firstGreen?.longitude);
      }

      const requiresCoordinatorReview = !validLatitude(latitude) || !validLongitude(longitude);
      const record = {
        ...candidate,
        latitude: validLatitude(latitude) ? latitude : null,
        longitude: validLongitude(longitude) ? longitude : null,
        lat: validLatitude(latitude) ? latitude : null,
        lng: validLongitude(longitude) ? longitude : null,
        holes: Array.isArray(course.holes) ? course.holes : [],
        greenCoordinates: Array.isArray(coordinates.greens) ? coordinates.greens : [],
        bunkerCoordinates: Array.isArray(coordinates.bunkers) ? coordinates.bunkers : [],
        waterCoordinates: Array.isArray(coordinates.water) ? coordinates.water : [],
        apiImported: true,
        source: "golfapi",
        sourceJobId: jobId,
        requiresCoordinatorReview,
        isActive: !requiresCoordinatorReview,
        cachedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      };

      const created = await db.runTransaction(async (transaction) => {
        const latest = await transaction.get(courseRef);
        if (latest.exists) return false;
        transaction.create(courseRef, record);
        return true;
      });
      if (created) {
        added++;
        if (requiresCoordinatorReview) reviewRequired++;
      } else {
        skippedExisting++;
      }
    } catch (error: any) {
      failed++;
      errors.push({courseID: candidate.courseID, message: error?.message || "Unknown ingestion error"});
      if (error instanceof HttpsError && error.code === "resource-exhausted") break;
      logger.error("Course ingestion failed", {jobId, courseID: candidate.courseID, error});
    }
  }

  const result = {added, skippedExisting, reviewRequired, failed, apiCallsUsed, errors: errors.slice(0, 20)};
  await jobRef.set({
    status: failed > 0 ? "completed_with_errors" : "completed",
    result,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  await db.collection("platform").doc("golfApiUsage").set({
    estimatedCallsUsed: admin.firestore.FieldValue.increment(apiCallsUsed),
    lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
    lastCommitJobId: jobId,
    lastCommitResult: result,
  }, {merge: true});

  return result;
});
