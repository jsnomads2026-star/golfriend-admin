// @ts-nocheck -- Executed directly by Node's type-stripper; excluded from application semantics.
import assert from "node:assert/strict";
import test from "node:test";
import {
  canGrantRole, canOperateCourse, emptyUnavailableProjection, invitationIsUsable,
  isEnterpriseAuthorityProjection, selectOrganization,
  type EnterpriseAuthorityProjection, type StaffMembershipProjection,
} from "./organizationAuthorityModel.ts";

const course = {courseId: "course_a", propertyId: "property_a", organizationId: "org_a", displayName: "Same Name", status: "active" as const};
const member = (role: StaffMembershipProjection["role"], organizationId = "org_a", courseId = "course_a"): StaffMembershipProjection => ({
  membershipId: `membership_${organizationId}_${role}`, verifiedStaffId: "verified_1", organizationId, role, status: "active", version: 1,
  scope: role === "organization_owner" || role === "organization_admin"
    ? {kind: "organization", organizationId}
    : {kind: "course", organizationId, propertyId: "property_a", courseId},
});

test("display-name similarity never grants cross-organization or cross-course access", () => {
  assert.equal(canOperateCourse(member("booking_staff", "org_b"), course, "booking"), false);
  assert.equal(canOperateCourse(member("booking_staff", "org_a", "course_b"), course, "booking"), false);
  assert.equal(canOperateCourse(member("booking_staff"), course, "booking"), true);
});

test("organization roles have no implicit operational course capabilities", () => {
  assert.equal(canOperateCourse(member("organization_owner"), course, "booking"), false);
  assert.equal(canOperateCourse(member("organization_admin"), course, "analytics"), false);
});

test("granting is lower-rank, same-organization and scope constrained", () => {
  const owner = member("organization_owner");
  const manager = member("course_manager");
  assert.equal(canGrantRole(owner, "organization_admin", {kind: "organization", organizationId: "org_a"}), true);
  assert.equal(canGrantRole(owner, "organization_owner", {kind: "organization", organizationId: "org_a"}), false);
  assert.equal(canGrantRole(manager, "course_manager", manager.scope), false);
  assert.equal(canGrantRole(manager, "booking_staff", manager.scope), true);
  assert.equal(canGrantRole(manager, "booking_staff", {kind: "course", organizationId: "org_a", propertyId: "property_a", courseId: "course_b"}), false);
  assert.equal(canGrantRole(owner, "analyst_viewer", {kind: "course", organizationId: "org_b", propertyId: "property_b", courseId: "course_b"}), false);
});

test("suspension immediately removes operational and delegation authority", () => {
  assert.equal(canOperateCourse({...member("booking_staff"), status: "suspended"}, course, "booking"), false);
  assert.equal(canOperateCourse(member("booking_staff"), {...course, status: "suspended"}, "booking"), false);
  assert.equal(canGrantRole({...member("course_manager"), status: "suspended"}, "analyst_viewer", member("course_manager").scope), false);
});

test("invitations are usable only while pending and before their authoritative expiry", () => {
  const invitation = {invitationId: "invite_1", organizationId: "org_a", role: "booking_staff" as const, scope: member("booking_staff").scope, status: "pending" as const, version: 1, expiresAt: "2026-08-22T00:00:00.000Z", retryable: true};
  assert.equal(invitationIsUsable(invitation, new Date("2026-08-21T23:59:59.000Z")), true);
  assert.equal(invitationIsUsable(invitation, new Date("2026-08-22T00:00:00.000Z")), false);
  assert.equal(invitationIsUsable({...invitation, status: "revoked"}, new Date("2026-08-20T00:00:00.000Z")), false);
});

test("multi-organization selection requires an active membership and stable ID", () => {
  const projection: EnterpriseAuthorityProjection = {...emptyUnavailableProjection(), producerStatus: "available", organizations: [
    {organizationId: "org_a", displayName: "Same Name", status: "active", version: 1, properties: []},
    {organizationId: "org_b", displayName: "Same Name", status: "active", version: 1, properties: []},
  ], memberships: [member("organization_owner", "org_a")], actorMembershipIds: ["membership_org_a_organization_owner"]};
  assert.equal(selectOrganization(projection, "org_a").selectedOrganizationId, "org_a");
  assert.equal(selectOrganization(projection, "org_b").selectedOrganizationId, null);
});

test("projection validator requires producer schema and immutable receipts", () => {
  assert.equal(isEnterpriseAuthorityProjection(emptyUnavailableProjection()), false);
  const valid = {...emptyUnavailableProjection(), producerStatus: "available" as const};
  assert.equal(isEnterpriseAuthorityProjection(valid), true);
  assert.equal(isEnterpriseAuthorityProjection({...valid, receipts: [{receiptId: "receipt_1", immutable: false}]}), false);
  const transfer = {transferId: "transfer_1", organizationId: "org_a", actorApproval: "incoming_owner" as const, status: "pending_incoming" as const, version: 2};
  assert.equal(isEnterpriseAuthorityProjection({...valid, ownershipTransfers: [transfer]}), true);
  assert.equal(isEnterpriseAuthorityProjection({...valid, ownershipTransfers: [{...transfer, actorApproval: "organization_name_match"}]}), false);
});
