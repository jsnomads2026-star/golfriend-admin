import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_BOOKING_RESOLUTION_DISABLED, adminBookingResolutionRefusal } from "./adminBookingResolutionRefusal.js";

let checks = 0;
for (const action of ["confirm", "reject", "cancel"]) {
  const refusal = adminBookingResolutionRefusal(action);
  assert.equal(refusal.code, "failed-precondition");
  assert.equal(refusal.message, ADMIN_BOOKING_RESOLUTION_DISABLED);
  checks += 1;
}

const callableSource = readFileSync(path.join(process.cwd(), "src", "index.ts"), "utf8");
const callableStart = callableSource.indexOf("export const adminResolveBooking");
const callableEnd = callableSource.indexOf("\n});", callableStart);
assert.ok(callableStart >= 0 && callableEnd > callableStart, "retained callable must exist");
const callableBody = callableSource.slice(callableStart, callableEnd);
assert.ok(!/runTransaction|writeBatch|bookingRef|slotRef|stampBookingAudit|\.set\s*\(|\.update\s*\(|\.delete\s*\(/.test(callableBody), "callable refusal must contain zero booking-write paths");
assert.ok(!/db\.collection\(['\"](?:bookings|tee_time_slots|booking_audit)['\"]\)/.test(callableBody), "callable refusal must not access booking record collections");
checks += 1;
console.log(`admin booking resolution refusal: ${checks} checks passed; confirm/reject/cancel refuse and the callable has zero booking-write paths.`);
