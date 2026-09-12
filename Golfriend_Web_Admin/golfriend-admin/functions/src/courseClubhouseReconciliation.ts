import {createHash} from "node:crypto";
import {buildClubhouseRecord, classifyClubhouse, type ProviderClubhouse} from "./courseGrowth.js";
import {isValidCoordinate} from "./courseSync.js";

export const COURSE_CLUBHOUSE_RECONCILIATION_SCHEMA = "golfriend.course-clubhouse-reconciliation/v3";
export const MAX_RECONCILIATION_CLUBHOUSES = 25;
export const MAX_RECONCILIATION_WRITES = 200;
type Row = Record<string, unknown>;
type AmbiguousGroup = Readonly<{providerClubId: string; providerPropertyId: string | null; reason: string; providerCourseIds: readonly string[]}>;
export type ReconciliationPlan = Readonly<{schemaVersion: string; targetProviderClubIds: readonly string[]; sourceStateHash: string; planHash: string; clubhouseUpserts: readonly {id: string; patch: Row}[]; coursePatches: readonly {id: string; patch: Row}[]; unchangedCourseLinks: readonly string[]; unmatchedProviderLayouts: readonly {providerClubId: string; providerCourseId: string}[]; ambiguousGroups: readonly AmbiguousGroup[]; invalidGeography: readonly string[]; bookingAuthorityUnavailable: number}>;

function canonical(value: unknown): string { if (value === null) return "null"; if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value); if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null"; if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Row)[key])}`).join(",")}}`; return "null"; }
export function reconciliationHash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
const text = (value: unknown): string => String(value || "").trim();
const finite = (value: unknown): number | null => { const number = typeof value === "number" ? value : Number(value); return Number.isFinite(number) ? number : null; };
const locationOf = (row: Row): Row => row.location && typeof row.location === "object" && !Array.isArray(row.location) ? row.location as Row : {};
function sourceCourse(row: Row): Row { return {id: text(row.id || row.courseID || row.providerCourseId), providerCourseId: text(row.providerCourseId || row.courseID), providerClubId: text(row.providerClubId || row.clubID), clubhouseId: text(row.clubhouseId), latitude: finite(row.latitude ?? row.lat), longitude: finite(row.longitude ?? row.lng)}; }
function sourceClubhouse(row: Row): Row { const location = locationOf(row); return {id: text(row.id || row.clubhouseId), providerClubId: text(row.providerClubId), providerPropertyId: text(row.providerPropertyId), displayName: text(row.displayName), location: {latitude: finite(location.latitude), longitude: finite(location.longitude)}}; }
function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function supplied(value: unknown): unknown { if (value === null || value === undefined) return undefined; if (Array.isArray(value)) return value.map(supplied).filter((item) => item !== undefined); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Row).flatMap(([key, item]) => { const normalized = supplied(item); return normalized === undefined ? [] : [[key, normalized]]; })); return value; }

function clubhousePatch(existing: Row | undefined, provider: ProviderClubhouse): Row {
  const desired = buildClubhouseRecord(provider); const oldLocation = existing ? locationOf(existing) : {};
  const oldLatitude = finite(oldLocation.latitude), oldLongitude = finite(oldLocation.longitude);
  if (isValidCoordinate(oldLatitude, oldLongitude)) desired.location = {...desired.location as Row, latitude: oldLatitude, longitude: oldLongitude, coordinateValidity: "valid"};
  return supplied(desired) as Row;
}

/** Pure bounded plan. Names, shared coordinates, and a shared provider club ID are never grouping evidence. */
export function planCourseClubhouseReconciliation(providerRows: readonly ProviderClubhouse[], existingCourses: readonly Row[], existingClubhouses: readonly Row[] = []): ReconciliationPlan {
  if (providerRows.length > MAX_RECONCILIATION_CLUBHOUSES) throw new Error("RECONCILIATION_TARGET_LIMIT_EXCEEDED");
  const targetProviderClubIds = [...new Set(providerRows.map((row) => row.providerClubId))].sort();
  const sourceStateHash = reconciliationHash({courses: existingCourses.map(sourceCourse).sort((a, b) => String(a.id).localeCompare(String(b.id))), clubhouses: existingClubhouses.map(sourceClubhouse).sort((a, b) => String(a.id).localeCompare(String(b.id))), targets: targetProviderClubIds});
  const courseByProviderId = new Map(existingCourses.map((course) => [text(course.providerCourseId || course.courseID), course]));
  const clubhouseById = new Map(existingClubhouses.map((clubhouse) => [text(clubhouse.clubhouseId || clubhouse.id), clubhouse]));
  const clubhouseUpserts: Array<{id: string; patch: Row}> = [], coursePatches: Array<{id: string; patch: Row}> = [], unmatchedProviderLayouts: Array<{providerClubId: string; providerCourseId: string}> = [], ambiguousGroups: AmbiguousGroup[] = [], invalidGeography: string[] = [], unchangedCourseLinks: string[] = []; const seenCanonicalIds = new Set<string>();
  for (const provider of [...providerRows].sort((a, b) => a.providerClubId.localeCompare(b.providerClubId))) {
    const classification = classifyClubhouse(provider);
    if (classification.status !== "proven" || !classification.canonicalClubhouseId) { ambiguousGroups.push({providerClubId: provider.providerClubId, providerPropertyId: provider.providerPropertyId, reason: classification.reason, providerCourseIds: provider.layouts.map((layout) => layout.providerCourseId).sort()}); continue; }
    const id = classification.canonicalClubhouseId;
    if (seenCanonicalIds.has(id)) { ambiguousGroups.push({providerClubId: provider.providerClubId, providerPropertyId: provider.providerPropertyId, reason: "duplicate_provider_property_identity", providerCourseIds: provider.layouts.map((layout) => layout.providerCourseId).sort()}); continue; }
    seenCanonicalIds.add(id);
    clubhouseUpserts.push({id, patch: clubhousePatch(clubhouseById.get(id), provider)});
    if (!isValidCoordinate(provider.latitude, provider.longitude)) invalidGeography.push(id);
    for (const layout of provider.layouts) {
      const existing = courseByProviderId.get(layout.providerCourseId);
      if (!existing) { unmatchedProviderLayouts.push({providerClubId: provider.providerClubId, providerCourseId: layout.providerCourseId}); continue; }
      const courseId = text(existing.id || existing.courseID || existing.providerCourseId); if (!courseId) throw new Error("EXISTING_COURSE_ID_MISSING");
      const previous = text(existing.clubhouseId); if ((previous && previous !== id) || existing.manualLock === true || existing.trusted === true) { unchangedCourseLinks.push(courseId); continue; }
      coursePatches.push({id: courseId, patch: {providerCourseId: layout.providerCourseId, providerClubId: provider.providerClubId, clubhouseId: id, clubhouseLinkProvenance: classification.reason}});
    }
  }
  clubhouseUpserts.sort((a, b) => a.id.localeCompare(b.id)); coursePatches.sort((a, b) => a.id.localeCompare(b.id)); unmatchedProviderLayouts.sort((a, b) => a.providerCourseId.localeCompare(b.providerCourseId)); ambiguousGroups.sort((a, b) => a.providerClubId.localeCompare(b.providerClubId)); invalidGeography.sort(); unchangedCourseLinks.sort();
  if (clubhouseUpserts.length + coursePatches.length > MAX_RECONCILIATION_WRITES) throw new Error("RECONCILIATION_WRITE_LIMIT_EXCEEDED");
  const unsigned = {schemaVersion: COURSE_CLUBHOUSE_RECONCILIATION_SCHEMA, targetProviderClubIds, sourceStateHash, clubhouseUpserts, coursePatches, unchangedCourseLinks, unmatchedProviderLayouts, ambiguousGroups, invalidGeography, bookingAuthorityUnavailable: clubhouseUpserts.length};
  return Object.freeze({...unsigned, planHash: reconciliationHash(unsigned)});
}

export function assertExecutablePlan(preview: ReconciliationPlan, approvedPlanHash: unknown, current: ReconciliationPlan): void { if (text(approvedPlanHash) !== preview.planHash) throw new Error("APPROVED_PLAN_HASH_MISMATCH"); if (preview.planHash !== current.planHash || preview.sourceStateHash !== current.sourceStateHash) throw new Error("STALE_RECONCILIATION_PLAN"); if (current.ambiguousGroups.length) throw new Error("AMBIGUOUS_CLUBHOUSE_HIERARCHY"); if (current.clubhouseUpserts.length + current.coursePatches.length > MAX_RECONCILIATION_WRITES) throw new Error("RECONCILIATION_WRITE_LIMIT_EXCEEDED"); }
export function hasEquivalentPatch(existing: Row | undefined, patch: Row): boolean { return !!existing && Object.entries(patch).every(([key, value]) => same(existing[key], value)); }
export function reconciliationReceiptId(planHash: unknown): string { const hash = text(planHash); if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("INVALID_RECONCILIATION_PLAN_HASH"); return `clubhouse-reconciliation-${hash.slice(0, 32)}`; }
export function reconciliationExecutionDisposition(receiptExists: boolean): "replayed" | "execute" { return receiptExists ? "replayed" : "execute"; }
