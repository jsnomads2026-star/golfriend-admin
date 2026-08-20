import assert from "node:assert/strict";
import test from "node:test";
import {resolvePartnerPortalContext} from "./partnerPortalAuthorityDomain";

const uid = "partner-user-1";
const organizationId = "partner-org-1";

function activeAuthority(role = "manager") {
  return {
    uid,
    binding: {organizationId, verifiedAuthUid: uid},
    membership: {organizationId, uid, role, status: "active"},
    organization: {organizationId, status: "active"},
  };
}

test("approved active member receives only server-derived portal context", () => {
  const resolution = resolvePartnerPortalContext(activeAuthority("primary_owner"));

  assert.equal(resolution.kind, "approved");
  if (resolution.kind === "approved") {
    assert.deepEqual(resolution.context, {
      organizationId,
      membershipRole: "primary_owner",
      approvalState: "approved",
      capabilities: [
        "partner_portal.context.read",
        "partner_organization.read",
        "partner_organization.manage",
        "partner_onboarding.read",
        "partner_support.read",
        "partner_support.write",
      ],
    });
  }
});

test("pending member is denied without a portal context", () => {
  const authority = activeAuthority();
  authority.membership.status = "pending";

  assert.deepEqual(resolvePartnerPortalContext(authority), {
    kind: "denied",
    code: "PARTNER_CONTEXT_PENDING",
  });
});

test("unlinked authenticated user is denied truthfully", () => {
  assert.deepEqual(resolvePartnerPortalContext({
    uid,
    binding: null,
    membership: null,
    organization: null,
  }), {
    kind: "denied",
    code: "PARTNER_CONTEXT_UNLINKED",
  });
});

test("inactive partner organization is denied without an approved status", () => {
  const authority = activeAuthority();
  authority.organization.status = "suspended";

  assert.deepEqual(resolvePartnerPortalContext(authority), {
    kind: "denied",
    code: "PARTNER_CONTEXT_INACTIVE",
  });
});

test("mismatched identity binding is denied as unauthorized", () => {
  const authority = activeAuthority();
  authority.binding.verifiedAuthUid = "different-user";

  assert.deepEqual(resolvePartnerPortalContext(authority), {
    kind: "denied",
    code: "PARTNER_CONTEXT_UNAUTHORIZED",
  });
});
