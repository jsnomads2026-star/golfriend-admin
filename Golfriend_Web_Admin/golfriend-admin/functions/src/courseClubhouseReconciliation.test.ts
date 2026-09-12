import assert from "node:assert";
import {normalizeClubhouses} from "./courseGrowth.js";
import {planCourseClubhouseReconciliation} from "./courseClubhouseReconciliation.js";

const clubhouses = normalizeClubhouses({clubs: [{clubID: "club_siam", clubName: "Siam Country Club", latitude: 12.93, longitude: 100.88, phone: "123", bookingUrl: "https://provider.example/book", courses: [{courseID: "layout_old", courseName: "Old Course", clubID: "club_siam"}, {courseID: "layout_water", courseName: "Waterside", clubID: "club_siam"}]}]});
const plan = planCourseClubhouseReconciliation(clubhouses, [{courseID: "layout_old", providerCourseId: "layout_old", latitude: 12.93, longitude: 100.88}]);
assert.equal(plan.clubhouseUpserts.length, 1);
assert.equal(plan.clubhouseUpserts[0].record.displayName, "Siam Country Club");
assert.deepEqual(plan.clubhouseUpserts[0].record.courseLayoutIds, ["layout_old", "layout_water"]);
assert.equal(plan.coursePatches.length, 1);
assert.equal(plan.coursePatches[0].patch.clubhouseId, "club_siam");
assert.deepEqual(plan.unmatchedProviderLayouts, [{providerClubId: "club_siam", providerCourseId: "layout_water"}]);
assert.deepEqual(plan, planCourseClubhouseReconciliation(clubhouses, [{courseID: "layout_old", providerCourseId: "layout_old", latitude: 12.93, longitude: 100.88}]));
assert.doesNotMatch(JSON.stringify(plan), /secret|token|authorization/i);
console.log("course clubhouse reconciliation: 1 check passed.");
