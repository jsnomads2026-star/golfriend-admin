import {isValidCoordinate} from "./courseSync.js";

type Row = Record<string, unknown>;
const text = (value: unknown): string => String(value || "").trim();

/** A Golfriend-curated destination authority. It is intentionally independent of provider hierarchy. */
export type CuratedClubhouseAuthority = Readonly<{
  clubHouseId: string; clubHouseName: string;
  identityProvenance: "golfriend_founder_ruling" | "golfriend_operational_verification";
  coordinateProvenance: string; latitude: number; longitude: number;
  providerClubId: string | null; providerRelationship: "unresolved" | "explicit" | null;
  providerSupplied: boolean; propertyHoleCount: number; roundHoleCount: 18;
}>;

export function assertCuratedClubhouseAuthority(value: CuratedClubhouseAuthority): CuratedClubhouseAuthority {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value.clubHouseId) || !text(value.clubHouseName) || !text(value.coordinateProvenance)) throw new Error("INVALID_CURATED_CLUBHOUSE_AUTHORITY");
  if (!isValidCoordinate(value.latitude, value.longitude) || value.roundHoleCount !== 18 || !Number.isInteger(value.propertyHoleCount) || value.propertyHoleCount < 1) throw new Error("INVALID_CURATED_CLUBHOUSE_COORDINATES_OR_HOLES");
  if (value.providerSupplied || value.providerRelationship === "explicit") throw new Error("CURATED_AUTHORITY_CANNOT_CLAIM_PROVIDER_HIERARCHY");
  return Object.freeze({...value});
}

/** Curated identity and coordinates are explicit facts, never inferred from a provider layout name. */
export function buildCuratedClubhouseRecord(value: CuratedClubhouseAuthority): Row {
  const authority = assertCuratedClubhouseAuthority(value);
  return {
    schema: "golfriend.v2.clubhouse.v2", schemaVersion: 2,
    clubhouseId: authority.clubHouseId, displayName: authority.clubHouseName,
    identityProvenance: authority.identityProvenance,
    coordinateVerified: true, coordinateProvenance: authority.coordinateProvenance,
    location: {latitude: authority.latitude, longitude: authority.longitude},
    providerClubId: authority.providerClubId,
    providerRelationship: authority.providerRelationship,
    providerSupplied: authority.providerSupplied,
    propertyHoleCount: authority.propertyHoleCount, roundHoleCount: authority.roundHoleCount,
    bookingCapability: {provider: {status: "unknown", provenance: null}, golfriendOperational: {status: "unverified", provenance: null}},
  };
}
