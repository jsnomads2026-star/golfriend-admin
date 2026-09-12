import assert from "node:assert";
import {readFileSync} from "node:fs";
import {buildClubhouseRecord, classifyClubhouse, normalizeClubhouses} from "./courseGrowth.js";
import {assertExecutablePlan, hasEquivalentPatch, planCourseClubhouseReconciliation, reconciliationExecutionDisposition, reconciliationReceiptId} from "./courseClubhouseReconciliation.js";

const proven = normalizeClubhouses({clubs: [{clubID: "brand_siam", propertyID: "old-course-property", clubName: "Siam Country Club Old Course", latitude: 12.93, longitude: 100.88, phone: "123", bookingUrl: "https://provider.example/book", courses: [{courseID: "layout_old", courseName: "Old Course"}, {courseID: "layout_water", courseName: "Waterside"}]}]});
const courses = [{id: "layout_old", courseID: "layout_old", providerCourseId: "layout_old", latitude: 12.93, longitude: 100.88}];
const plan = planCourseClubhouseReconciliation(proven, courses);
assert.equal(plan.clubhouseUpserts.length, 1); assert.equal(plan.clubhouseUpserts[0].id, "golfapi-property-old-course-property"); assert.equal(plan.clubhouseUpserts[0].patch.displayName, "Siam Country Club Old Course"); assert.equal(plan.clubhouseUpserts[0].patch.bookingAuthority && (plan.clubhouseUpserts[0].patch.bookingAuthority as any).status, "unavailable"); assert.equal(plan.coursePatches[0].patch.clubhouseId, "golfapi-property-old-course-property"); assert.deepEqual(plan.unmatchedProviderLayouts, [{providerClubId: "brand_siam", providerCourseId: "layout_water"}]);
assert.equal((plan.clubhouseUpserts[0].patch as any).childCourseIds.includes("layout_old"), true); assert.doesNotMatch(JSON.stringify(plan), /secret|token|authorization/i);
const repeat = planCourseClubhouseReconciliation(proven, courses); assert.equal(plan.planHash, repeat.planHash); assert.doesNotThrow(() => assertExecutablePlan(plan, plan.planHash, repeat)); assert.throws(() => assertExecutablePlan(plan, "wrong", repeat), /APPROVED_PLAN_HASH_MISMATCH/); assert.equal(reconciliationReceiptId(plan.planHash), reconciliationReceiptId(repeat.planHash)); assert.equal(reconciliationExecutionDisposition(false), "execute"); assert.equal(reconciliationExecutionDisposition(true), "replayed"); assert.equal(hasEquivalentPatch({...plan.coursePatches[0].patch}, plan.coursePatches[0].patch), true);

// A shared brand ID, a course name, and matching coordinates do not prove a member-facing property.
const ambiguous = normalizeClubhouses({clubs: [{clubID: "brand_siam", clubName: "Siam Country Club", latitude: 12.93, longitude: 100.88, courses: [{courseID: "sugar", courseName: "Sugar Cane"}, {courseID: "tapioca", courseName: "Tapioca"}, {courseID: "pineapple", courseName: "Pineapple"}]}]});
const ambiguousPlan = planCourseClubhouseReconciliation(ambiguous, [{id: "sugar", providerCourseId: "sugar"}]);
assert.equal(classifyClubhouse(ambiguous[0]).status, "ambiguous"); assert.equal(ambiguousPlan.clubhouseUpserts.length, 0); assert.equal(ambiguousPlan.coursePatches.length, 0); assert.equal(ambiguousPlan.ambiguousGroups.length, 1); assert.throws(() => assertExecutablePlan(ambiguousPlan, ambiguousPlan.planHash, ambiguousPlan), /AMBIGUOUS_CLUBHOUSE_HIERARCHY/);

const separateProperties = normalizeClubhouses({clubs: [{clubID: "brand_siam", propertyID: "plantation", clubName: "Siam Country Club Plantation", latitude: 12.9, longitude: 101, courses: [{courseID: "sugar", courseName: "Sugar Cane"}]}, {clubID: "brand_siam", propertyID: "waterside", clubName: "Siam Country Club Waterside", latitude: 12.91, longitude: 101.01, courses: [{courseID: "water", courseName: "Waterside"}]}]});
const separatePlan = planCourseClubhouseReconciliation(separateProperties, [{id: "sugar", providerCourseId: "sugar"}, {id: "water", providerCourseId: "water"}]); assert.equal(separatePlan.clubhouseUpserts.length, 2); assert.notEqual(separatePlan.coursePatches[0].patch.clubhouseId, separatePlan.coursePatches[1].patch.clubhouseId);

// A previous canonical/trusted link is never silently repointed.
const protectedPlan = planCourseClubhouseReconciliation(proven, [{id: "layout_old", providerCourseId: "layout_old", clubhouseId: "verified-other-property"}]);
assert.equal(protectedPlan.coursePatches.length, 0); assert.deepEqual(protectedPlan.unchangedCourseLinks, ["layout_old"]);

const invalid = normalizeClubhouses({clubs: [{clubID: "invalid", propertyID: "invalid-property", clubName: "Invalid", latitude: 0, longitude: 0, courses: []}]});
const record = buildClubhouseRecord(invalid[0]); assert.equal((record.location as any).coordinateValidity, "invalid_or_missing");

const source = readFileSync("src/courseIngestion.ts", "utf8"); const preview = source.slice(source.indexOf("export const previewCourseClubhouseReconciliation"), source.indexOf("export const executeCourseClubhouseReconciliation")); const execute = source.slice(source.indexOf("export const executeCourseClubhouseReconciliation"), source.indexOf("export const commitCourseRegionImport"));
for (const body of [preview, execute]) { assert.match(body, /enforceAppCheck:\s*true/); assert.match(body, /requireCoordinator\(request\.auth\.uid\)/); assert.match(body, /secrets:\s*\[GOLF_API_KEY\]/); }
assert.doesNotMatch(preview, /\.set\(|\.create\(|\.update\(|\.batch\(|runTransaction/); assert.match(preview, /productionWrites: 0/); for (const marker of ["approvedPlanHash", "sourceStateHash", "STALE_RECONCILIATION_PLAN", "course_clubhouse_backfill_receipts", "AMBIGUOUS_CLUBHOUSE_HIERARCHY", "deletes: 0", "creates: 0"]) assert.match(execute, new RegExp(marker));
console.log("course clubhouse reconciliation: deterministic, fail-closed authority checks passed.");
