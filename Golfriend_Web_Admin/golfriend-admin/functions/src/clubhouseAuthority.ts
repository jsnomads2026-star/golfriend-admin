import {isValidCoordinate, isValidProviderId} from "./courseSync.js";

type Row = Record<string, unknown>;
const text = (value: unknown): string => String(value || "").trim();

/** A Golfriend-curated destination authority. It is intentionally independent of provider hierarchy. */
export type CuratedClubhouseAuthority = Readonly<{
  clubHouseId: string; clubHouseName: string;
  identityProvenance: "golfriend_founder_ruling" | "golfriend_operational_verification";
  coordinateVerified: true; coordinateProvenance: string; latitude: number; longitude: number;
  providerClubId: string | null; providerRelationship: "unresolved" | "explicit" | null;
  providerSupplied: boolean; propertyHoleCount: number; roundHoleCount: 18;
}>;

export function assertCuratedClubhouseAuthority(value: CuratedClubhouseAuthority): CuratedClubhouseAuthority {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value.clubHouseId) || !text(value.clubHouseName) || !text(value.coordinateProvenance) || !["golfriend_founder_ruling", "golfriend_operational_verification"].includes(value.identityProvenance)) throw new Error("INVALID_CURATED_CLUBHOUSE_AUTHORITY");
  if (value.coordinateVerified !== true || !isValidCoordinate(value.latitude, value.longitude) || value.roundHoleCount !== 18 || !Number.isInteger(value.propertyHoleCount) || value.propertyHoleCount < 1) throw new Error("INVALID_CURATED_CLUBHOUSE_COORDINATES_OR_HOLES");
  if (value.providerClubId !== null && !isValidProviderId(value.providerClubId)) throw new Error("INVALID_CURATED_PROVIDER_CLUB_ID");
  if (value.providerSupplied || value.providerRelationship === "explicit") throw new Error("CURATED_AUTHORITY_CANNOT_CLAIM_PROVIDER_HIERARCHY");
  return Object.freeze({...value});
}

/** External callable input is whitelisted before it becomes part of a reviewed plan or receipt. */
export function normalizeCuratedClubhouseAuthorities(value: unknown, maximum: number): readonly CuratedClubhouseAuthority[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) throw new Error("INVALID_CURATED_CLUBHOUSE_SET");
  const authorities = value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("INVALID_CURATED_CLUBHOUSE_AUTHORITY");
    const row = candidate as Row;
    if (row.coordinateVerified !== true || typeof row.providerSupplied !== "boolean") throw new Error("INVALID_CURATED_CLUBHOUSE_PROVENANCE");
    const authority: CuratedClubhouseAuthority = {
      clubHouseId: text(row.clubHouseId), clubHouseName: text(row.clubHouseName),
      identityProvenance: row.identityProvenance as CuratedClubhouseAuthority["identityProvenance"],
      coordinateVerified: true, coordinateProvenance: text(row.coordinateProvenance),
      latitude: Number(row.latitude), longitude: Number(row.longitude),
      providerClubId: text(row.providerClubId) || null,
      providerRelationship: (row.providerRelationship ?? null) as CuratedClubhouseAuthority["providerRelationship"],
      providerSupplied: row.providerSupplied, propertyHoleCount: Number(row.propertyHoleCount), roundHoleCount: Number(row.roundHoleCount) as 18,
    };
    return assertCuratedClubhouseAuthority(authority);
  });
  if (new Set(authorities.map((authority) => authority.clubHouseId)).size !== authorities.length) throw new Error("INVALID_OR_DUPLICATE_CURATED_CLUBHOUSE");
  return Object.freeze(authorities);
}

/** Curated identity and coordinates are explicit facts, never inferred from a provider layout name. */
export function buildCuratedClubhouseRecord(value: CuratedClubhouseAuthority): Row {
  const authority = assertCuratedClubhouseAuthority(value);
  return {
    schema: "golfriend.v2.clubhouse.v2", schemaVersion: 2,
    clubhouseId: authority.clubHouseId, displayName: authority.clubHouseName,
    identityProvenance: authority.identityProvenance,
    coordinateVerified: authority.coordinateVerified, coordinateProvenance: authority.coordinateProvenance,
    location: {latitude: authority.latitude, longitude: authority.longitude},
    providerClubId: authority.providerClubId,
    providerRelationship: authority.providerRelationship,
    providerSupplied: authority.providerSupplied,
    propertyHoleCount: authority.propertyHoleCount, roundHoleCount: authority.roundHoleCount,
    bookingCapability: {provider: {status: "unknown", provenance: null}, golfriendOperational: {status: "unverified", provenance: null}},
  };
}
