'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const projection = require('./licensedScorecardProjection');

const card = Array.from({ length: 18 }, (_, index) => ({
  holeNumber: index + 1,
  par: index === 2 ? 3 : 4,
  strokeIndex: index + 1,
}));

test('projects only a complete provider card into the licensed scoring shape', () => {
  const result = projection.project({ holes: card, tees: [{ name: 'Blue', yards: [401] }], ratings: { course: 72.1, slope: 129 } });
  assert.deepEqual(result.holes, card);
  assert.deepEqual(result.tees, [{ name: 'Blue', yards: [401] }]);
  assert.deepEqual(result.ratings, { course: 72.1, slope: 129 });
  assert.equal(Object.isFrozen(result), true);
});

test('top-level legacy fields do not become authority unless they form a complete valid card', () => {
  assert.equal(projection.project({ holes: card.slice(0, 17), tees: [{ name: 'Blue' }], ratings: { slope: 129 } }), null);
  assert.equal(projection.project({ holes: card.map((hole, index) => index === 1 ? { ...hole, holeNumber: 1 } : hole) }), null);
  assert.equal(projection.project({ holes: card.map((hole, index) => index === 1 ? { ...hole, strokeIndex: 1 } : hole) }), null);
  assert.equal(projection.project({ holes: card.map((hole, index) => index === 1 ? { ...hole, par: 6 } : hole) }), null);
});
