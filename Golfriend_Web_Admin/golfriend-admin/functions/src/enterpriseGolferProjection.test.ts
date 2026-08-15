import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {
  GOLFER_LINK_DATA_CATEGORIES,
  minimumGolferLink,
  rejectGolferAuthorityFields,
} from "./enterpriseOperationsDomain.js";

test("golfer projection strips staff and private data", () => {
  const value: any = minimumGolferLink({
    linkId: "link-1", organizationId: "org-1", propertyId: "prop-1", courseId: "course-1",
    organizationDisplayName: "Same Name", propertyDisplayName: "Property", courseDisplayName: "Course",
    memberReference: "member-1", state: "invited", consentVersion: 1,
    staffEmail: "private@example.com", bookings: [1], locationHistory: [1], friends: [1],
  });
  assert.deepEqual(value.requestedDataCategories, [...GOLFER_LINK_DATA_CATEGORIES]);
  assert.equal(value.organization.id, "org-1");
  for (const field of ["staffEmail", "bookings", "locationHistory", "friends", "targetGolferUid"])
    assert.equal(field in value, false);
});

test("golfer commands reject forged authority and undeclared fields", () => {
  assert.doesNotThrow(() => rejectGolferAuthorityFields({commandId: "cmd", linkId: "link", consentVersion: 1}));
  for (const field of ["golferId", "targetGolferUid", "organizationId", "propertyId", "courseId", "status", "state", "expiresAt", "receiptId", "role", "membershipId", "deviceId"])
    assert.throws(() => rejectGolferAuthorityFields({commandId: "cmd", linkId: "link", consentVersion: 1, [field]: "forged"}), /CLIENT_AUTHORITY_FIELD_DENIED/);
});

test("display names never replace immutable authority IDs", () => {
  const a: any = minimumGolferLink({linkId:"one", organizationId:"org-a", propertyId:"prop-a", courseId:"course-a", organizationDisplayName:"Same", propertyDisplayName:"Same", courseDisplayName:"Same", memberReference:"member-a", state:"invited", consentVersion:1});
  const b: any = minimumGolferLink({linkId:"two", organizationId:"org-b", propertyId:"prop-b", courseId:"course-b", organizationDisplayName:"Same", propertyDisplayName:"Same", courseDisplayName:"Same", memberReference:"member-b", state:"invited", consentVersion:1});
  assert.notEqual(a.organization.id, b.organization.id);
  assert.notEqual(a.course.id, b.course.id);
});

test("golfer read callable derives identity, requires App Check, and is exported", () => {
  const runtime = readFileSync(join(process.cwd(), "src", "enterpriseOperationsRuntime.ts"), "utf8");
  const index = readFileSync(join(process.cwd(), "src", "index.ts"), "utf8");
  assert.match(runtime, /getEnterpriseMemberLinkInvitationsForGolferV1=onCall\(\{enforceAppCheck:true\}/);
  assert.match(runtime, /where\("targetGolferUid","==",golfer\)/);
  assert.match(runtime, /Object\.keys\(r\.data\)\.length/);
  assert.match(runtime, /Verified active member required/);
  assert.match(runtime, /Cross-scope consent receipt rejected/);
  assert.match(index, /getEnterpriseMemberLinkInvitationsForGolferV1/);
});

test("expired acceptance is auditable but explicitly unsuccessful", () => {
  const runtime = readFileSync(join(process.cwd(), "src", "enterpriseOperationsRuntime.ts"), "utf8");
  assert.match(runtime, /status:"rejected"/);
  assert.match(runtime, /return\{success:false,receiptId:rid,state:"expired"/);
  assert.match(runtime, /consentVersion:next,linkId:id,receiptId:rid/);
});
