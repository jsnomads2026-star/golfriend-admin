import {buildClubhouseRecord, type ProviderClubhouse} from "./courseGrowth.js";

export const COURSE_CLUBHOUSE_RECONCILIATION_SCHEMA = "golfriend.course-clubhouse-reconciliation/v1";

type ExistingCourse = Record<string, unknown>;

/**
 * Pure, non-writing reconciliation plan. It is intentionally not exported as a callable:
 * an operator must separately approve the later bounded execution boundary.
 */
export function planCourseClubhouseReconciliation(clubhouses: readonly ProviderClubhouse[], existingCourses: readonly ExistingCourse[]) {
  const courseByProviderId = new Map(existingCourses.map((course) => [String(course.providerCourseId || course.courseID || "").trim(), course]));
  const clubhouseUpserts = clubhouses.map((clubhouse) => ({id: clubhouse.providerClubId, record: buildClubhouseRecord(clubhouse)}));
  const coursePatches: Array<{id: string; patch: Record<string, unknown>}> = [];
  for (const clubhouse of clubhouses) for (const layout of clubhouse.layouts) {
    const existing = courseByProviderId.get(layout.providerCourseId);
    if (!existing) continue; // Never synthesize a layout from a reconciliation plan.
    const id = String(existing.courseID || existing.providerCourseId || layout.providerCourseId);
    coursePatches.push({id, patch: {providerCourseId: layout.providerCourseId, providerClubId: clubhouse.providerClubId, clubhouseId: clubhouse.providerClubId, clubID: clubhouse.providerClubId, clubName: clubhouse.providerClubName, name: layout.providerCourseName, providerParentId: layout.providerParentId}});
  }
  coursePatches.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({schemaVersion: COURSE_CLUBHOUSE_RECONCILIATION_SCHEMA, clubhouseUpserts: Object.freeze(clubhouseUpserts), coursePatches: Object.freeze(coursePatches), unmatchedProviderLayouts: Object.freeze(clubhouses.flatMap((clubhouse) => clubhouse.layouts.filter((layout) => !courseByProviderId.has(layout.providerCourseId)).map((layout) => ({providerClubId: clubhouse.providerClubId, providerCourseId: layout.providerCourseId}))) )});
}
