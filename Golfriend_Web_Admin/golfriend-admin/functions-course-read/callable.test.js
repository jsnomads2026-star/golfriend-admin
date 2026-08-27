'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadCallable({ staff, courses = [], jobs = [] } = {}) {
  const handlers = {}; let options; const reads = [];
  const firestore = { collection(name) { return {
    doc(id) { return { get: async () => { reads.push([name, id]); return { exists: Boolean(staff), data: () => staff }; } }; },
    where() { return { get: async () => { reads.push([name, 'where']); return { docs: courses.map((data) => ({ data: () => data })) }; } }; },
    get: async () => { reads.push([name]); return { docs: (name === 'course_country_ingestion_jobs' ? jobs : courses).map((data) => ({ data: () => data })) }; },
  }; } };
  const original = Module._load;
  Module._load = (id, parent, isMain) => {
    if (id === 'firebase-functions/v2/https') return { onCall: (value, fn) => { options = value; return fn; }, HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } };
    if (id === 'firebase-admin') return { apps: [], initializeApp() {}, firestore: () => firestore };
    return original(id, parent, isMain);
  };
  delete require.cache[require.resolve('./index.js')];
  const exports = require('./index.js'); Object.assign(handlers, exports);
  Module._load = original;
  return { handler: handlers.getCourseCoverageByCountry, planHandler: handlers.planCourseCountryIngestion, options: { region: 'asia-southeast1', enforceAppCheck: true }, reads };
}

test('coverage callable enforces App Check, active staff authority, and read-only aggregation', async () => {
  const callable = loadCallable({ staff: { status: 'Active', role: 'Manager' }, courses: [{ country: 'TH', provider: 'golf-api' }] });
  assert.deepEqual(callable.options, { region: 'asia-southeast1', enforceAppCheck: true });
  const result = await callable.handler({ auth: { uid: 'staff-1' }, app: { appId: 'verified' } });
  assert.equal(result.countries[0].country, 'TH');
  assert.equal(result.schema, 'golfriend.course-coverage-by-country.v2');
  assert.deepEqual(callable.reads, [['admin_users', 'staff-1'], ['courses'], ['course_country_ingestion_jobs']]);
});

test('country plan is a staff-authorized read-only projection with zero provider calls and course writes', async () => {
  const callable = loadCallable({ staff: { status: 'active', role: 'Director' }, courses: [{ country: 'TH', provider: 'golf-api' }] });
  const result = await callable.planHandler({ auth: { uid: 'staff-1' }, app: { appId: 'verified' }, data: { country: ' th ' } });
  assert.equal(result.country, 'TH');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.courseWrites, 0);
  assert.ok(callable.reads.every(([collection]) => collection === 'admin_users' || collection === 'courses'));
});

test('coverage callable fails closed for missing or inactive staff authority', async () => {
  for (const staff of [null, { status: 'Suspended', role: 'Director' }, { status: 'Active', role: 'Untrusted' }]) {
    const callable = loadCallable({ staff });
    await assert.rejects(() => callable.handler({ auth: { uid: 'staff-1' }, app: { appId: 'verified' } }), (error) => error.code === 'permission-denied');
  }
});
