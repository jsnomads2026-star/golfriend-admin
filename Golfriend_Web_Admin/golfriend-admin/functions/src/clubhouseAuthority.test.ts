import assert from "node:assert";
import {buildCuratedClubhouseRecord, normalizeCuratedClubhouseAuthorities} from "./clubhouseAuthority.js";
import {normalizeClubhouses} from "./courseGrowth.js";
import {planCourseClubhouseReconciliation} from "./courseClubhouseReconciliation.js";

const hierarchyFreeProvider = normalizeClubhouses({clubs: [{clubID: "provider-umbrella", clubName: "Provider umbrella", latitude: 12.9, longitude: 101.0, courses: [{courseID: "layout-1", courseName: "Layout one", clubID: "provider-umbrella"}]}]});
const hierarchyFreePlan = planCourseClubhouseReconciliation(hierarchyFreeProvider, [{id: "layout-1", providerCourseId: "layout-1"}]);
assert.deepEqual(hierarchyFreePlan.clubhouseUpserts, []); assert.deepEqual(hierarchyFreePlan.coursePatches, []); assert.deepEqual(hierarchyFreePlan.unresolvedProviderClubhouses, [{providerClubId: "provider-umbrella", reason: "PROVIDER_HIERARCHY_ABSENT"}]);

const oldCourse = {clubHouseId: "siam-old-course", clubHouseName: "Siam Country Club Old Course", identityProvenance: "golfriend_founder_ruling", coordinateVerified: true, coordinateProvenance: "venue_official_map_link", latitude: 12.9179814, longitude: 100.9877539, providerClubId: "provider-umbrella", providerRelationship: "unresolved", providerSupplied: false, propertyHoleCount: 18, roundHoleCount: 18} as const;
const plantation = {...oldCourse, clubHouseId: "siam-plantation", clubHouseName: "Siam Country Club Plantation", latitude: 12.9093302, longitude: 101.0085683, propertyHoleCount: 27} as const;
const record = buildCuratedClubhouseRecord(oldCourse); const plantationRecord = buildCuratedClubhouseRecord(plantation);
assert.equal(record.identityProvenance, "golfriend_founder_ruling"); assert.equal(record.providerSupplied, false); assert.equal(record.providerRelationship, "unresolved"); assert.equal(record.coordinateVerified, true); assert.equal(plantationRecord.propertyHoleCount, 27); assert.equal(plantationRecord.roundHoleCount, 18);
const curatedPlan = planCourseClubhouseReconciliation([], [], [], [oldCourse, plantation]);
assert.deepEqual(curatedPlan.clubhouseUpserts.map((item) => item.id), ["siam-old-course", "siam-plantation"]); assert.equal(curatedPlan.coursePatches.length, 0); assert.doesNotMatch(JSON.stringify(curatedPlan), /courseLayoutIds|layout-1/);
assert.throws(() => buildCuratedClubhouseRecord({...oldCourse, providerSupplied: true}), /CURATED_AUTHORITY_CANNOT_CLAIM_PROVIDER_HIERARCHY/);
assert.deepEqual(normalizeCuratedClubhouseAuthorities([oldCourse], 25), [oldCourse]);
assert.throws(() => normalizeCuratedClubhouseAuthorities([{...oldCourse, coordinateVerified: false}], 25), /INVALID_CURATED_CLUBHOUSE_PROVENANCE/);
assert.throws(() => normalizeCuratedClubhouseAuthorities([{...oldCourse, identityProvenance: ""}], 25), /INVALID_CURATED_CLUBHOUSE_AUTHORITY/);
console.log("clubhouse authority: curated provenance and hierarchy-free fail-closed checks passed.");
