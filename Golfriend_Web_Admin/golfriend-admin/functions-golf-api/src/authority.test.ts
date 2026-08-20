import assert from 'node:assert';
import { isActiveStaffOrDirector } from './authority.js';
assert.equal(isActiveStaffOrDirector({ role: 'Director', status: 'Active' }), true);
assert.equal(isActiveStaffOrDirector({ role: 'Operations', status: 'Active' }), true);
assert.equal(isActiveStaffOrDirector({ role: 'Director', status: 'Suspended' }), false);
assert.equal(isActiveStaffOrDirector({ status: 'Active' }), false);
assert.equal(isActiveStaffOrDirector(null), false);
assert.equal(isActiveStaffOrDirector({ role: '', status: 'Active' }), false);
console.log('golf-api status authority: active staff/Director allowed; suspended, missing and role-less records denied.');
