import * as assert from "node:assert/strict";
import { quoteRate, validateIdempotencyKey, validateRateCard } from "./economyLogic.js";

const rates = validateRateCard([
  { id: "chat.summary", section: "Chat", label: "Thread summary", mode: "fixed", tees: 3, directCostUsd: 0.04, rewardTees: 0, active: true },
  { id: "lounge.navigation", section: "Lounge", label: "Navigation", mode: "free", tees: 0, directCostUsd: 0, rewardTees: 0, active: true },
]);

const paid = quoteRate(rates[0], "v1", 0.10);
assert.deepEqual(paid, {
  actionId: "chat.summary",
  rateVersion: "v1",
  debitTees: 3,
  rewardTees: 0,
  netTees: -3,
  revenueUsd: 0.30000000000000004,
  directCostUsd: 0.04,
  marginUsd: 0.26000000000000006,
});

assert.equal(quoteRate(rates[1], "v1", 0.10).debitTees, 0);
assert.equal(validateIdempotencyKey("round_20260815_001"), "round_20260815_001");
assert.throws(() => validateIdempotencyKey("../unsafe"), /INVALID_IDEMPOTENCY_KEY/);
assert.throws(() => validateRateCard([rates[0], rates[0]]), /DUPLICATE_RATE_ID/);
assert.throws(() => validateRateCard([{ ...rates[0], mode: "free", tees: 1 }]), /FREE_RATE_MUST_COST_ZERO/);
assert.throws(() => quoteRate({ ...rates[0], active: false }, "v1", 0.10), /RATE_INACTIVE/);

console.log("economyLogic: all assertions passed");
