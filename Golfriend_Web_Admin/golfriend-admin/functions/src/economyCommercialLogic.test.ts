import * as assert from "node:assert/strict";
import { calculateCourseCommission, validateCommissionBps, validateTeePurchase } from "./economyCommercialLogic.js";

assert.deepEqual(calculateCourseCommission(10000, 300), {
  grossMinor: 10000,
  commissionBps: 300,
  commissionMinor: 300,
  courseNetMinor: 9700,
});
assert.equal(validateCommissionBps(500), 500);
assert.throws(() => validateCommissionBps(1001), /INVALID_COMMISSION_BPS/);
assert.deepEqual(validateTeePurchase(1000, 100), { grossMinor: 1000, tees: 100, minimumMinor: 1000 });
assert.throws(() => validateTeePurchase(999, 100), /PURCHASE_UNDERFUNDED/);
assert.throws(() => calculateCourseCommission(0, 300), /INVALID_BOOKING_GROSS/);

console.log("economyCommercialLogic: all assertions passed");
