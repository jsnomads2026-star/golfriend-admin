import assert from "node:assert";
import * as admin from "firebase-admin";
import {assertProviderGroupWithinLimit} from "./courseCataloguePreview.js";
import {readCatalogueQuery, readCatalogueSnapshotOrStale} from "./courseIngestion.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("FIRESTORE_EMULATOR_HOST_REQUIRED");
if (!admin.apps.length) admin.initializeApp({projectId: "demo-catalogue-preview-snapshot"});
const db = admin.firestore();
const courses = db.collection("courses");
const pageSize = 500;

async function commitRows(rows: Array<{id: string; value: Record<string, unknown>}>) {
  while (rows.length) {
    const batch = db.batch();
    for (const row of rows.splice(0, 400)) batch.set(courses.doc(row.id), row.value);
    await batch.commit();
  }
}

async function countCourses(): Promise<number> { return (await courses.get()).size; }

async function main() {
  const seeded = Array.from({length: 560}, (_, index) => {
    const providerClubId = `club-${String(Math.floor(index / 20)).padStart(2, "0")}`;
    return {id: `course-${String(index).padStart(4, "0")}`, value: {providerClubId, providerCourseId: `provider-course-${index}`, snapshotValue: "before"}};
  });
  await commitRows(seeded);
  const first = await readCatalogueQuery(courses.orderBy("providerClubId").limit(pageSize), null);
  assert.equal(first.size, pageSize); const readTime = first.readTime;
  const lastProviderClubId = String(first.docs[first.docs.length - 1].get("providerClubId"));
  const inventoryFirst = await readCatalogueQuery(courses.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize), readTime);
  assert.equal(inventoryFirst.size, pageSize);
  const lastInventoryId = inventoryFirst.docs[inventoryFirst.docs.length - 1].id;

  await commitRows([
    {id: "course-0540", value: {providerClubId: "club-27", providerCourseId: "provider-course-540", snapshotValue: "after"}},
    {id: "course-9999", value: {providerClubId: "club-99", providerCourseId: "provider-course-9999", snapshotValue: "after"}},
  ]);
  const expectedCountAfterSetup = 561;
  assert.equal(await countCourses(), expectedCountAfterSetup);

  const later = await readCatalogueQuery(courses.orderBy("providerClubId").startAfter(lastProviderClubId).limit(pageSize), readTime);
  assert.equal(later.docs.some((doc) => doc.id === "course-9999"), false);
  assert.equal(later.docs.find((doc) => doc.id === "course-0540")?.get("snapshotValue"), "before");
  assert.deepEqual(later.docs.map((doc) => doc.id), (await readCatalogueQuery(courses.orderBy("providerClubId").startAfter(lastProviderClubId).limit(pageSize), readTime)).docs.map((doc) => doc.id));

  const inventoryLater = await readCatalogueQuery(courses.orderBy(admin.firestore.FieldPath.documentId()).startAfter(lastInventoryId).limit(pageSize), readTime);
  assert.equal(inventoryLater.docs.some((doc) => doc.id === "course-9999"), false);
  assert.equal(inventoryLater.docs.find((doc) => doc.id === "course-0540")?.get("snapshotValue"), "before");

  const providerGroup = await readCatalogueQuery(courses.where("providerClubId", "==", "club-27").limit(201), readTime);
  assert.equal(providerGroup.size, 20); assert.equal(providerGroup.docs.every((doc) => doc.get("snapshotValue") === "before"), true);

  await commitRows(Array.from({length: 201}, (_, index) => ({id: `oversize-${String(index).padStart(3, "0")}`, value: {providerClubId: "oversize", providerCourseId: `oversize-course-${index}`}})));
  const oversized = await readCatalogueQuery(courses.where("providerClubId", "==", "oversize").limit(201), null);
  assert.equal(oversized.size, 201); assert.throws(() => assertProviderGroupWithinLimit(oversized.size, 200), /PROVIDER_GROUP_TOO_LARGE/);
  await assert.rejects(() => readCatalogueSnapshotOrStale(courses.limit(1), new admin.firestore.Timestamp(0, 0)), (error: unknown) => error instanceof Error && error.message === "STALE_PREVIEW");
  assert.equal(await countCourses(), expectedCountAfterSetup + 201);
  console.log("course catalogue snapshot emulator: fixed readTime is immutable, deterministic, and write-free.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
