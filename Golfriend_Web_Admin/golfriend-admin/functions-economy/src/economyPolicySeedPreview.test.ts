import assert from 'node:assert';
import { V2_ECONOMY_POLICY_SEED_PREVIEW } from './economyPolicySeedPreview.js';

assert.equal(V2_ECONOMY_POLICY_SEED_PREVIEW.approvalState, 'director_approval_required');
assert.equal(V2_ECONOMY_POLICY_SEED_PREVIEW.asset.unitPriceUsd, 0.10);
assert.deepEqual(V2_ECONOMY_POLICY_SEED_PREVIEW.teePacks.map((pack) => [pack.teeCount, pack.priceUsd]), [[100, 10], [250, 25], [500, 50]]);
assert.equal(V2_ECONOMY_POLICY_SEED_PREVIEW.actions.length, 33);
assert.equal(V2_ECONOMY_POLICY_SEED_PREVIEW.actions.filter((item) => item.direction === 'reserve').length, 3);
assert.equal(V2_ECONOMY_POLICY_SEED_PREVIEW.policyDigestSha256, '1bf64f47f69bf2a90f3409c347594bae6725b104f6849a74f66c8cab81cb9a16');
console.log('economy policy seed preview: canonical prices, action inventory, digest, and approval gate passed.');
