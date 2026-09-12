import assert from "node:assert";
import {assertCataloguePreviewFresh, catalogueProviderBatch, decodeCataloguePreviewCursor, encodeCataloguePreviewCursor, MAX_CATALOGUE_PREVIEW_GROUPS, parseCataloguePreviewRequest} from "./courseCataloguePreview.js";

const secret = "test-secret";
const rows = Array.from({length: 53}, (_, index) => ({id: `course-${index}`, providerCourseId: `course-${index}`, providerClubId: `club-${String(index).padStart(2, "0")}`})).reverse();
const first = catalogueProviderBatch(rows, null, MAX_CATALOGUE_PREVIEW_GROUPS);
assert.equal(first.providerClubIds.length, 25); assert.deepEqual(first.providerClubIds, [...first.providerClubIds].sort());
const cursor = {version: 1 as const, afterProviderClubId: first.providerClubIds[first.providerClubIds.length - 1], afterCourseDocumentId: "course-24", sourceWindowHash: first.sourceWindowHash};
const token = encodeCataloguePreviewCursor(cursor, secret); assert.deepEqual(decodeCataloguePreviewCursor(token, secret), cursor); assert.throws(() => decodeCataloguePreviewCursor(`${token}x`, secret), /INVALID_CATALOGUE_PREVIEW_CURSOR/);
const replay = catalogueProviderBatch(rows, null, MAX_CATALOGUE_PREVIEW_GROUPS); assert.deepEqual(replay, first);
const second = catalogueProviderBatch(rows, cursor.afterProviderClubId, MAX_CATALOGUE_PREVIEW_GROUPS); assert.equal(second.providerClubIds.length, 25); assert.equal(second.providerClubIds.some((id) => first.providerClubIds.includes(id)), false);
const third = catalogueProviderBatch(rows, second.providerClubIds[second.providerClubIds.length - 1], MAX_CATALOGUE_PREVIEW_GROUPS); assert.equal(third.providerClubIds.length, 3); assert.equal(third.providerClubIds.some((id) => first.providerClubIds.includes(id) || second.providerClubIds.includes(id)), false);
assert.throws(() => assertCataloguePreviewFresh(cursor, "f".repeat(64)), /STALE_PREVIEW/); assert.doesNotThrow(() => assertCataloguePreviewFresh(cursor, first.sourceWindowHash));
assert.equal(catalogueProviderBatch([{id: "missing"}, {id: "bad", providerClubId: "?"}], null, 25).invalidProviderClubIdRows, 2);
assert.deepEqual(parseCataloguePreviewRequest({providerClubIds: ["club-b", "club-a"]}, secret), {mode: "explicit", providerClubIds: ["club-a", "club-b"]}); assert.equal(parseCataloguePreviewRequest({mode: "catalogue", batchSize: 2}, secret).mode, "catalogue");
console.log("course catalogue preview: deterministic bounded cursor checks passed.");
