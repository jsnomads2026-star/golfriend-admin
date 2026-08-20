import assert from "node:assert/strict";
import { BOOKING_COMMUNICATIONS_FUNCTIONS, MODULE_LOAD_BOUNDARY } from "./index.js";
import { BOOKING_COMMUNICATIONS_OPTIONS, BOOKING_COMMUNICATIONS_REGION } from "./runtime.js";
import { adminPermission, messageRequest, resolutionRequest, transition } from "./domain.js";

assert.equal(BOOKING_COMMUNICATIONS_REGION, "asia-southeast1");
assert.equal(BOOKING_COMMUNICATIONS_OPTIONS.region, "asia-southeast1");
assert.equal(BOOKING_COMMUNICATIONS_OPTIONS.enforceAppCheck, true);
assert.deepEqual(BOOKING_COMMUNICATIONS_FUNCTIONS, ["getAdminBookingStreamV2", "adminResolveBooking", "sendBookingMessage"]);
assert.equal(MODULE_LOAD_BOUNDARY.some((entry) => /stripe|vision|provider|economy|golf|portal|hosting/i.test(entry)), false);
assert.equal(adminPermission("Director", "resolve"), true);
assert.equal(adminPermission("Staff", "resolve"), false);
assert.deepEqual(transition("pending", "reject"), { status: "rejected", releaseSeat: true });
assert.deepEqual(messageRequest({ bookingId: "booking_123", locale: "en", message: "Update", idempotencyKey: "message_123" }).locale, "en");
assert.deepEqual(resolutionRequest({ bookingId: "booking_123", resolution: "cancel", idempotencyKey: "resolve_123" }).resolution, "cancel");
console.log("booking communications deployment readiness tests passed");
