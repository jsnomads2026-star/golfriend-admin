import assert from "node:assert/strict";
import {
  BookingScopeInput,
  BookingScopeError,
  derivePartnerBookingScope,
} from "./partnerBookingScope.js";

let count = 0;
const test = (name: string, run: () => void) => {
  run();
  console.log(`ok ${++count} - ${name}`);
};
const base = (role = "manager"): BookingScopeInput => ({
  callerUid: "user_1",
  binding: { organizationId: "org_1", verifiedAuthUid: "user_1" },
  membership: {
    organizationId: "org_1",
    uid: "user_1",
    role,
    status: "active",
    version: 2,
  },
  organization: {
    organizationId: "org_1",
    status: "active",
    authorizedCourseIds: ["course_a", "course_b", "course_foreign"],
    version: 4,
  },
  operators: [
    { courseId: "course_a", organizationId: "org_1", status: "active", version: 3 },
    { courseId: "course_b", organizationId: "org_1", status: "suspended", version: 2 },
    { courseId: "course_foreign", organizationId: "org_2", status: "active", version: 1 },
  ],
  courses: [
    { courseId: "course_a", propertyId: "property_real", version: 7 },
    { courseId: "course_b", propertyId: "property_suspended", version: 1 },
    { courseId: "course_foreign", propertyId: "property_foreign", version: 1 },
  ],
  generatedAtMs: Date.parse("2026-08-15T00:00:00.000Z"),
});
const code = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return (error as BookingScopeError).code;
  }
  return "";
};

test("manager receives only approved active owned courses", () => {
  const scope = derivePartnerBookingScope(base());
  assert.deepEqual(scope.courseIds, ["course_a"]);
  assert.deepEqual(scope.propertyIds, ["property_real"]);
  assert.equal(scope.delegatedCourseIds, undefined);
});
test("course staff grant is explicit and intersected", () => {
  const input = base("course_staff");
  input.membership = { ...input.membership, courseIds: ["course_a", "course_foreign"] };
  const scope = derivePartnerBookingScope(input);
  assert.deepEqual(scope.courseIds, ["course_a"]);
  assert.deepEqual(scope.delegatedCourseIds, ["course_a"]);
});
test("course staff missing grant fails closed", () => {
  assert.equal(code(() => derivePartnerBookingScope(base("course_staff"))), "COURSE_GRANT_REQUIRED");
});
test("suspended membership is rejected", () => {
  const input = base();
  input.membership = { ...input.membership, status: "suspended" };
  assert.equal(code(() => derivePartnerBookingScope(input)), "MEMBERSHIP_INACTIVE");
});
test("suspended organization is rejected", () => {
  const input = base();
  input.organization = { ...input.organization, status: "suspended" };
  assert.equal(code(() => derivePartnerBookingScope(input)), "ORGANIZATION_INACTIVE");
});
test("revoked operator removes course", () => {
  const input = base();
  input.operators = input.operators.map((operator) => ({ ...operator, status: "suspended" }));
  assert.deepEqual(derivePartnerBookingScope(input).courseIds, []);
});
test("cross organization binding is rejected", () => {
  const input = base();
  input.membership = { ...input.membership, organizationId: "org_2" };
  assert.equal(code(() => derivePartnerBookingScope(input)), "AUTHORITY_MISMATCH");
});
test("support and analyst are read only", () => {
  assert.equal(derivePartnerBookingScope(base("support")).canMutate, false);
  assert.equal(derivePartnerBookingScope(base("analyst")).canMutate, false);
});
test("property is never accepted from membership", () => {
  const input = base();
  input.membership = { ...input.membership, propertyIds: ["forged"] };
  assert.deepEqual(derivePartnerBookingScope(input).propertyIds, ["property_real"]);
});
test("freshness and source version are stable", () => {
  const first = derivePartnerBookingScope(base());
  const second = derivePartnerBookingScope(base());
  assert.equal(first.sourceVersion, second.sourceVersion);
  assert.equal(first.expiresAt, "2026-08-15T00:05:00.000Z");
});
console.log(`partner booking scope: ${count} checks passed.`);
