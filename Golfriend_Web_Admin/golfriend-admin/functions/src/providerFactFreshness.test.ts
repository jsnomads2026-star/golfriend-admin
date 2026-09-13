import assert from "node:assert";
import {readFileSync} from "node:fs";
import {PROVIDER_FACT_CACHE_TTL_MS, assertFreshProviderFactForCanonicalWrite, isProviderFactFresh} from "./providerFactFreshness.js";

const now = Date.parse("2026-09-14T00:00:00.000Z");
assert.equal(PROVIDER_FACT_CACHE_TTL_MS, 24 * 60 * 60 * 1000);
assert.equal(isProviderFactFresh(now - PROVIDER_FACT_CACHE_TTL_MS, now), true);
assert.equal(isProviderFactFresh(now - PROVIDER_FACT_CACHE_TTL_MS - 1, now), false);
assert.equal(isProviderFactFresh(now + 1, now), false);
assert.equal(isProviderFactFresh(now - PROVIDER_FACT_CACHE_TTL_MS - 1, now), false, "providerUpdatedAt cannot make an old fetchedAt fresh");
assert.throws(() => assertFreshProviderFactForCanonicalWrite(now - PROVIDER_FACT_CACHE_TTL_MS - 1, now), /STALE_PROVIDER_FACT/);
assert.doesNotThrow(() => assertFreshProviderFactForCanonicalWrite(now - PROVIDER_FACT_CACHE_TTL_MS, now));

const ingestion = readFileSync("src/courseIngestion.ts", "utf8");
const freshness = readFileSync("src/providerFactFreshness.ts", "utf8");
const execute = ingestion.slice(ingestion.indexOf("export const executeCourseClubhouseReconciliation"), ingestion.indexOf("export const commitCourseRegionImport"));
assert.match(ingestion, /export const COURSE_INGESTION_JOB_EXPIRY_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
assert.match(freshness, /export const PROVIDER_FACT_CACHE_TTL_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
assert.doesNotMatch(ingestion, /PROVIDER_FACT_CACHE_TTL_MS/, "ingestion expiry must not import or share the provider-fact freshness constant");
assert.match(execute, /assertFreshProviderFactForCanonicalWrite/);
assert.match(execute, /STALE_PROVIDER_FACT/);

const growth = readFileSync("src/courseGrowth.ts", "utf8");
assert.match(growth, /bookingCapability/);
assert.match(growth, /golfriendOperational: \{status: "unverified"/);
assert.match(growth, /Contact and reservation channels are evidence of channels only/);
console.log("provider fact freshness: distinct TTL, stale-write refusal, and booking-capability provenance checks passed.");
