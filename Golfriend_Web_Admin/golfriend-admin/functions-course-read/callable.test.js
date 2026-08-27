'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadCallable({ staff, courses = [] } = {}) {
  let handler; let options; const reads = [];
  const firestore = { collection(name) { return {
    doc(id) { return { get: async () => { reads.push([name, id]); return { exists: Boolean(staff), data: () => staff }; } }; },
    get: async () => { reads.push([name]); return { docs: courses.map((data) => ({ data: () => data })) }; },
  }; } };
  const original = Module._load;
  Module._load = (id, parent, isMain) => {
    if (id === 'firebase-functions/v2/https') return { onCall: (value, fn) => { options = value; handler = fn; return fn; }, HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } };
    if (id === 'firebase-admin') return { apps: [], initializeApp() {}, firestore: () => firestore };
    return original(id, parent, isMain);
  };
  delete require.cache[require.resolve('./index.js')];
  require('./index.js');
  Module._load = original;
  return { handler, options, reads };
}

test('coverage callable enforces App Check, active staff authority, and read-only aggregation', async () => {
  const callable = loadCallable({ staff: { status: 'Active', role: 'Manager' }, courses: [{ country: 'TH', provider: 'golf-api' }] });
  assert.deepEqual(callable.options, { region: 'asia-southeast1', enforceAppCheck: true });
  const result = await callable.handler({ auth: { uid: 'staff-1' }, app: { appId: 'verified' } });
  assert.equal(result.countries[0].country, 'TH');
  assert.deepEqual(callable.reads, [['admin_users', 'staff-1'], ['courses']]);
});

test('coverage callable fails closed for missing or inactive staff authority', async () => {
  for (const staff of [null, { status: 'Suspended', role: 'Director' }, { status: 'Active', role: 'Untrusted' }]) {
    const callable = loadCallable({ staff });
    await assert.rejects(() => callable.handler({ auth: { uid: 'staff-1' }, app: { appId: 'verified' } }), (error) => error.code === 'permission-denied');
  }
});
