import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  PARTNER_PORTAL_REGION,
  PartnerIdentityBinding,
  PartnerMembership,
  PartnerOrganization,
  resolvePartnerPortalContext,
} from "./partnerPortalAuthorityDomain";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function denialError(code: string): HttpsError {
  switch (code) {
    case "PARTNER_CONTEXT_UNLINKED":
      return new HttpsError("permission-denied", "Partner organization link required.", {code});
    case "PARTNER_CONTEXT_PENDING":
      return new HttpsError("failed-precondition", "Partner access is not approved yet.", {code});
    case "PARTNER_CONTEXT_INACTIVE":
      return new HttpsError("failed-precondition", "Partner organization is not active.", {code});
    default:
      return new HttpsError("permission-denied", "Partner access is not authorized.", {code});
  }
}

export const getPartnerPortalContext = onCall(
  {region: PARTNER_PORTAL_REGION},
  async (request) => {
    const uid = request.auth?.uid;
    if (uid === undefined) {
      throw new HttpsError("unauthenticated", "Firebase authentication is required.");
    }

    const bindingSnapshot = await db.collection("partner_identity_bindings").doc(uid).get();
    const binding = bindingSnapshot.exists ?
      recordOrNull(bindingSnapshot.data()) as PartnerIdentityBinding | null : null;

    const bindingOrganizationId = binding?.organizationId;
    if (typeof bindingOrganizationId !== "string" || bindingOrganizationId.length === 0) {
      const resolution = resolvePartnerPortalContext({
        uid,
        binding,
        membership: null,
        organization: null,
      });
      if (resolution.kind === "denied") {
        throw denialError(resolution.code);
      }
      throw new HttpsError("internal", "Partner context could not be resolved.");
    }

    const [membershipSnapshot, organizationSnapshot] = await Promise.all([
      db.collection("partner_memberships").doc(`${bindingOrganizationId}_${uid}`).get(),
      db.collection("partner_organizations").doc(bindingOrganizationId).get(),
    ]);

    const resolution = resolvePartnerPortalContext({
      uid,
      binding,
      membership: membershipSnapshot.exists ?
        recordOrNull(membershipSnapshot.data()) as PartnerMembership | null : null,
      organization: organizationSnapshot.exists ?
        recordOrNull(organizationSnapshot.data()) as PartnerOrganization | null : null,
    });

    if (resolution.kind === "denied") {
      throw denialError(resolution.code);
    }

    return resolution.context;
  },
);
