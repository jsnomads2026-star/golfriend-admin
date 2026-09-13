import {createHmac, timingSafeEqual} from "node:crypto";
import {isValidProviderId} from "./courseSync.js";

export const MAX_CATALOGUE_PREVIEW_GROUPS = 25;
export const DEFAULT_CATALOGUE_PREVIEW_GROUPS = 25;
export const MAX_CATALOGUE_PREVIEW_SCAN_ROWS = 500;
type Row = Record<string, unknown>;

export type CataloguePreviewCursor = Readonly<{version: 2; afterProviderClubId: string | null; afterCourseDocumentId: string | null; readTimeSeconds: number; readTimeNanoseconds: number}>;
export type CataloguePreviewRequest = Readonly<{mode: "explicit"; providerClubIds: string[]} | {mode: "catalogue"; batchSize: number; cursor: CataloguePreviewCursor | null}>;

const text = (value: unknown): string => String(value || "").trim();
const base64url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const fromBase64url = (value: string): string => Buffer.from(value, "base64url").toString("utf8");
const signature = (payload: string, secret: string): string => createHmac("sha256", secret).update(payload).digest("base64url");

export function encodeCataloguePreviewCursor(cursor: CataloguePreviewCursor, secret: string): string {
  const payload = base64url(JSON.stringify(cursor));
  return `${payload}.${signature(payload, secret)}`;
}

export function decodeCataloguePreviewCursor(value: unknown, secret: string): CataloguePreviewCursor {
  const token = text(value); const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("INVALID_CATALOGUE_PREVIEW_CURSOR");
  const expected = signature(payload, secret);
  if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) throw new Error("INVALID_CATALOGUE_PREVIEW_CURSOR");
  let parsed: unknown;
  try { parsed = JSON.parse(fromBase64url(payload)); } catch { throw new Error("INVALID_CATALOGUE_PREVIEW_CURSOR"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_CATALOGUE_PREVIEW_CURSOR");
  const row = parsed as Row; const afterProviderClubId = row.afterProviderClubId === null ? null : text(row.afterProviderClubId); const afterCourseDocumentId = row.afterCourseDocumentId === null ? null : text(row.afterCourseDocumentId); const readTimeSeconds = Number(row.readTimeSeconds); const readTimeNanoseconds = Number(row.readTimeNanoseconds);
  // The signed cursor may carry an invalid legacy value solely to advance past it;
  // it is never promoted into a reconciliation target.
  if (row.version !== 2 || (afterProviderClubId !== null && (!afterProviderClubId || afterProviderClubId.length > 256)) || (afterCourseDocumentId !== null && (!afterCourseDocumentId || afterCourseDocumentId.length > 1500)) || !Number.isSafeInteger(readTimeSeconds) || !Number.isInteger(readTimeNanoseconds) || readTimeNanoseconds < 0 || readTimeNanoseconds > 999999999) throw new Error("INVALID_CATALOGUE_PREVIEW_CURSOR");
  return {version: 2, afterProviderClubId, afterCourseDocumentId, readTimeSeconds, readTimeNanoseconds};
}

export function parseCataloguePreviewRequest(value: unknown, secret: string): CataloguePreviewRequest {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  if (row.mode === "catalogue") {
    const requested = row.batchSize === undefined ? DEFAULT_CATALOGUE_PREVIEW_GROUPS : Number(row.batchSize);
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_CATALOGUE_PREVIEW_GROUPS) throw new Error("INVALID_CATALOGUE_PREVIEW_BATCH_SIZE");
    return {mode: "catalogue", batchSize: requested, cursor: row.cursor === undefined || row.cursor === null ? null : decodeCataloguePreviewCursor(row.cursor, secret)};
  }
  if (!Array.isArray(row.providerClubIds) || row.providerClubIds.length < 1 || row.providerClubIds.length > MAX_CATALOGUE_PREVIEW_GROUPS) throw new Error("EXPLICIT_PROVIDER_CLUB_IDS_REQUIRED");
  const providerClubIds = row.providerClubIds.map(text);
  if (new Set(providerClubIds).size !== providerClubIds.length || providerClubIds.some((id) => !isValidProviderId(id))) throw new Error("INVALID_EXPLICIT_PROVIDER_CLUB_IDS");
  return {mode: "explicit", providerClubIds: [...providerClubIds].sort()};
}

export function catalogueProviderBatch(rows: readonly Row[], afterProviderClubId: string | null, batchSize: number): Readonly<{providerClubIds: string[]; invalidProviderClubIdRows: number; lastScannedProviderClubId: string | null}> {
  const seen = new Set<string>(); let invalidProviderClubIdRows = 0;
  for (const row of [...rows].sort((left, right) => text(left.providerClubId ?? left.clubID).localeCompare(text(right.providerClubId ?? right.clubID)) || text(left.id).localeCompare(text(right.id)))) {
    const providerClubId = text(row.providerClubId ?? row.clubID);
    if (!isValidProviderId(providerClubId)) { invalidProviderClubIdRows++; continue; }
    if ((afterProviderClubId === null || providerClubId > afterProviderClubId) && seen.size < batchSize) seen.add(providerClubId);
  }
  const orderedRows = [...rows].sort((left, right) => text(left.providerClubId ?? left.clubID).localeCompare(text(right.providerClubId ?? right.clubID)) || text(left.id).localeCompare(text(right.id)));
  const providerClubIds = [...seen].sort();
  const lastScannedProviderClubId = providerClubIds.length ? providerClubIds[providerClubIds.length - 1] : (orderedRows.length ? text(orderedRows[orderedRows.length - 1].providerClubId ?? orderedRows[orderedRows.length - 1].clubID) || null : null);
  return {providerClubIds, invalidProviderClubIdRows, lastScannedProviderClubId};
}

export function assertProviderGroupWithinLimit(rowCount: number, limit: number): void {
  if (!Number.isInteger(rowCount) || !Number.isInteger(limit) || rowCount < 0 || limit < 1 || rowCount > limit) throw new Error("PROVIDER_GROUP_TOO_LARGE");
}
