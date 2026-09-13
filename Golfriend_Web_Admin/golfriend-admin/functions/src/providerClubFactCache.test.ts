import assert from "node:assert";
import {readFileSync} from "node:fs";
import {normalizeClubhouses} from "./courseGrowth.js";
import {PROVIDER_CLUB_FACT_CACHE_SCHEMA, PROVIDER_CLUB_FACT_CACHE_TTL_MS, isFreshProviderClubFact, providerClubFact, providerClubhouseFromFreshFact, providerRateEvidence} from "./providerClubFactCache.js";

const fetchedAt = "2026-09-14T00:00:00.000Z";
const now = Date.parse(fetchedAt) + 60 * 60 * 1000;
const clubhouse = normalizeClubhouses({clubs: [{clubID: "club-1", propertyID: "property-1", clubName: "Provider Club", isBookable: true, updatedAt: "2026-01-01T00:00:00Z", latitude: 12, longitude: 100, bookingUrl: "https://provider.example/book", courses: [{courseID: "course-1", courseName: "One"}]}]})[0];
const fact = providerClubFact(clubhouse, fetchedAt);
assert.equal(fact.schemaVersion, PROVIDER_CLUB_FACT_CACHE_SCHEMA); assert.equal(fact.provider, "golfapi"); assert.equal(fact.providerUpdatedAt, "2026-01-01T00:00:00Z");
assert.equal(Object.prototype.hasOwnProperty.call(fact, "clubHouseId"), false); assert.equal(Object.prototype.hasOwnProperty.call(fact, "bookingAuthority"), false);
assert.equal(isFreshProviderClubFact(fact, now), true); assert.equal(isFreshProviderClubFact(fact, Date.parse(fetchedAt) + PROVIDER_CLUB_FACT_CACHE_TTL_MS + 1), false);
assert.equal(providerClubhouseFromFreshFact(fact, "club-1", now)?.providerPropertyId, "property-1"); assert.equal(providerClubhouseFromFreshFact(fact, "club-1", Date.parse(fetchedAt) + PROVIDER_CLUB_FACT_CACHE_TTL_MS + 1), null);
assert.deepEqual(providerRateEvidence({get: (name: string) => ({"retry-after": "12", "x-ratelimit-limit": "60", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000"}[name.toLowerCase()] || null)}), {retryAfterSeconds: 12, limit: "60", remaining: "0", reset: "1700000000"});
assert.equal(providerRateEvidence({get: () => null}).retryAfterSeconds, null);

const ingestion = readFileSync("src/courseIngestion.ts", "utf8"); const preview = ingestion.slice(ingestion.indexOf("export const previewCourseClubhouseReconciliation"), ingestion.indexOf("export const executeCourseClubhouseReconciliation")); const execute = ingestion.slice(ingestion.indexOf("export const executeCourseClubhouseReconciliation")); const cache = readFileSync("src/providerClubFactCache.ts", "utf8");
assert.match(cache, /export const PROVIDER_CLUB_FACT_CACHE_TTL_MS/); assert.doesNotMatch(cache, /JOB_TTL_MS/);
assert.match(ingestion, /const JOB_TTL_MS/); assert.match(ingestion, /providerClubhouseFromFreshFact/); assert.match(preview, /providerRefetches/); assert.match(preview, /PROVIDER_RATE_LIMITED/);
const reconciliation = ingestion.slice(ingestion.indexOf("async function reconciliationPlanFor"), ingestion.indexOf("type CatalogueCourseRow"));
assert.match(reconciliation, /for \(const \[index, id\] of providerClubIds\.entries\(\)\)/); assert.doesNotMatch(reconciliation, /Promise\.all\(providerClubIds\.map\(async \(id\) => \{[\s\S]*?golfApiGet/);
const detail = ingestion.slice(ingestion.indexOf("async function fetchProviderClubDetail"), ingestion.indexOf("async function reconciliationPlanFor")); assert.doesNotMatch(detail, /withDeterministicRetry/); assert.match(detail, /response\.status === 429/); assert.match(execute, /reconciliationPlanFor\(providerClubIds\)/);
assert.doesNotMatch(preview, /\.set\(|\.create\(|\.update\(|\.batch\(|runTransaction/); assert.match(preview, /productionWrites: 0/);
console.log("provider club fact cache: 24-hour freshness, provenance-only cache, sequential detail fetch, fail-closed 429, and zero-write preview checks passed.");
