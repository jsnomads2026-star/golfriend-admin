import assert from 'node:assert';
import { isActiveDirector } from './authority.js';
assert.equal(isActiveDirector({ role: 'Director', status: 'Active' }), true);
assert.equal(isActiveDirector({ role: 'Manager', status: 'Active' }), false);
assert.equal(isActiveDirector({ role: 'Director', status: 'Suspended' }), false);
assert.equal(isActiveDirector(null), false);
console.log('economy authority: 4 checks passed.');
