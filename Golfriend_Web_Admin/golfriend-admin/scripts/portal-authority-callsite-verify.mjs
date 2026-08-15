// ==========================================
// FILE: scripts/portal-authority-callsite-verify.mjs
// Run: node scripts/portal-authority-callsite-verify.mjs
//
// BEHAVIOURAL verification of the shared staff predicate at the Partner Portal's ACTUAL
// call sites. Not a substring scan, not a source-presence check: this loads each compiled
// runtime with stubbed Firebase infrastructure, INVOKES the real exported callable, and
// asserts what it does when the caller's admin_users document carries each status in the
// matrix.
//
// The distinction matters because every previous "the guard is present" check in this lane
// passed while the guard it named was inert. A call site is only protected if calling it
// is refused.
//
// The stubs replace `firebase-admin` and `firebase-functions/v2/https` in the require cache
// BEFORE the runtime is loaded, so the runtime under test is the real compiled artifact —
// only its I/O is substituted. No emulator, no network, no credentials, no production.
// ==========================================
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions');
const require = createRequire(resolve(FUNCTIONS, 'lib/index.js'));

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

// Compile first: the artifact under test must be current, not whatever was left on disk.
const tsc = [resolve(FUNCTIONS, 'node_modules/typescript/bin/tsc'), resolve(ROOT, 'node_modules/typescript/bin/tsc')]
  .find((candidate) => existsSync(candidate));
assert.ok(tsc, 'no local typescript compiler found for functions/');
execFileSync(process.execPath, [tsc, '-p', FUNCTIONS], { stdio: 'pipe' });

// ------------------------------------------------------------------ infrastructure ----
class StubHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Documents the fake store will serve. Reset per scenario. */
let DOCS = new Map();

const makeSnap = (path) => ({
  exists: DOCS.has(path),
  id: path.split('/').pop(),
  data: () => DOCS.get(path),
});

const makeQuery = (collectionPath) => ({
  where: () => makeQuery(collectionPath),
  orderBy: () => makeQuery(collectionPath),
  limit: () => makeQuery(collectionPath),
  get: async () => ({ docs: [], empty: true, size: 0, forEach: () => undefined }),
});

const makeCollection = (name) => ({
  doc: (id) => ({
    id,
    path: `${name}/${id}`,
    get: async () => makeSnap(`${name}/${id}`),
    set: async () => undefined,
    update: async () => undefined,
    create: async () => undefined,
    delete: async () => undefined,
    collection: (sub) => makeCollection(`${name}/${id}/${sub}`),
  }),
  where: () => makeQuery(name),
  orderBy: () => makeQuery(name),
  limit: () => makeQuery(name),
  get: async () => ({ docs: [], empty: true, size: 0, forEach: () => undefined }),
  add: async () => ({ id: 'generated' }),
});

const fakeDb = {
  collection: makeCollection,
  runTransaction: async (fn) => fn({
    get: async (ref) => (ref && ref.path ? makeSnap(ref.path) : { exists: false, data: () => undefined }),
    set: () => undefined, update: () => undefined, create: () => undefined, delete: () => undefined,
  }),
  batch: () => ({ set: () => undefined, update: () => undefined, commit: async () => undefined }),
};

const FieldValue = {
  serverTimestamp: () => 'STUB_TS',
  increment: (n) => ({ __increment: n }),
  arrayUnion: (...v) => ({ __arrayUnion: v }),
  delete: () => ({ __delete: true }),
};

const adminStub = {
  apps: [{}],
  initializeApp: () => undefined,
  credential: { applicationDefault: () => ({}) },
  firestore: Object.assign(() => fakeDb, { FieldValue, Timestamp: { now: () => 'STUB_TS' } }),
  auth: () => ({ createUser: async () => ({ uid: 'new' }), getUser: async () => ({ uid: 'x' }) }),
  storage: () => ({ bucket: () => ({ file: () => ({ getSignedUrl: async () => ['stub://url'] }) }) }),
};

/** Captured callable handlers, keyed by export name. */
const captured = new Map();
const httpsStub = {
  HttpsError: StubHttpsError,
  onCall: (optionsOrHandler, maybeHandler) => {
    const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler;
    const options = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
    const wrapper = (request) => handler(request);
    wrapper.__handler = handler;
    wrapper.__options = options || {};
    return wrapper;
  },
  onRequest: (handler) => handler,
};

const inject = (specifier, exportsValue) => {
  let resolved;
  try { resolved = require.resolve(specifier); } catch { resolved = specifier; }
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
};

inject('firebase-admin', adminStub);
inject('firebase-functions/v2/https', httpsStub);
inject('firebase-functions/v2/scheduler', { onSchedule: (o, h) => h });
inject('firebase-functions/logger', { info: () => undefined, warn: () => undefined, error: () => undefined });
inject('firebase-functions/params', { defineSecret: () => ({ value: () => '' }), defineString: () => ({ value: () => '' }) });
inject('firebase-admin/firestore', { FieldValue, Firestore: class {} });

// --------------------------------------------------------------------- the matrix ----
const AUTHORIZING = ['Active', 'active', 'ACTIVE', ' Active '];
const REFUSING = [
  'Suspended', 'suspended', 'Inactive', 'Deactivated', 'Revoked', 'Expired',
  'Disabled', 'Deleted', 'Terminated', 'Archived', 'probation', 'Unknown',
  '', '   ', 'active_partner', 'Аctive' /* Cyrillic А */,
];

/**
 * Privileged Portal call sites, by the business surface the mission names. Each entry is a
 * real exported callable that gates on the shared staff predicate.
 */
const CALL_SITES = [
  { surface: 'partner/admin queue', module: 'partnerOnboardingRuntime', callable: 'listPartnerApplicationsV2' },
  { surface: 'partner/admin queue', module: 'partnerOnboardingRuntime', callable: 'getPartnerApplicationAdminV2' },
  { surface: 'partner/admin queue', module: 'partnerOnboardingRuntime', callable: 'reviewPartnerApplicationV2' },
  { surface: 'partner/admin queue', module: 'partnerOnboardingRuntime', callable: 'sendAdminPartnerSupportMessageV2' },
  { surface: 'template approval', module: 'marketingAssetRuntime', callable: 'transitionMarketingAsset' },
  { surface: 'campaigns / assets', module: 'marketingAssetRuntime', callable: 'listMarketingAssets' },
  { surface: 'delivery orchestration', module: 'bookingProviderPublicationRuntime', callable: 'publishBookingProviderPublicationV2' },
  { surface: 'delivery orchestration', module: 'bookingProviderPublicationRuntime', callable: 'prepareBookingProviderPublicationV2' },
  { surface: 'CSV conflict resolution', module: 'bookingReportingRuntime', callable: 'reconcileBookingOperationsV2' },
  { surface: 'CSV conflict resolution', module: 'bookingReportingRuntime', callable: 'exportBookingOperationsV2' },
  { surface: 'booking oversight', module: 'bookingReportingRuntime', callable: 'getBookingOperationsAdminV2' },
  { surface: 'booking oversight', module: 'partnerBookingRuntime', callable: 'getPlayBookingsAdminV2' },
  { surface: 'course claim review', module: 'partnerClaimReviewRuntime', callable: 'reviewCourseOperatorClaim' },
  { surface: 'availability review', module: 'partnerAvailabilityRuntime', callable: 'reviewCourseAvailabilityV2' },
  { surface: 'availability review', module: 'partnerAvailabilityRuntime', callable: 'listCourseAvailabilityAdminV2' },
  { surface: 'partner authority admin', module: 'partnerActivationRuntime', callable: 'listPartnerAuthorityAdmin' },
  { surface: 'partner authority admin', module: 'partnerActivationRuntime', callable: 'setPartnerOrganizationStatus' },
];

/**
 * The exact messages these runtimes raise when the STAFF GATE refuses. Anything else
 * carrying permission-denied is a business precondition, not an authorization decision.
 */
const AUTHORIZATION_REFUSALS = [
  'Admin required.',
  'Active Admin role required.',
];

const UID = 'staff-under-test';

/** Invoke a callable and classify the outcome. */
async function invoke(module, callable, adminDoc, { admin = true } = {}) {
  DOCS = new Map();
  if (adminDoc !== null) DOCS.set(`admin_users/${UID}`, adminDoc);
  const loaded = require(resolve(FUNCTIONS, `lib/${module}.js`));
  const fn = loaded[callable];
  if (typeof fn !== 'function') return { outcome: 'missing' };
  const request = {
    auth: { uid: UID, token: { email: 'x@y.z', email_verified: true } },
    app: { appId: 'stub' },
    data: { admin, organizationId: 'org1', commandId: 'cmd-abcdef', expectedVersion: 1, courseId: 'c1', slotId: 's1', claimId: 'k1', status: 'approved', action: 'list' },
  };
  try {
    await fn(request);
    return { outcome: 'allowed' };
  } catch (error) {
    if (error instanceof StubHttpsError && error.code === 'permission-denied') {
      // A permission-denied is NOT automatically an authorization refusal. These runtimes
      // also raise it for business preconditions the stub cannot satisfy — "Active claimed
      // course required", for instance. Treating those as authorization would have let a
      // call site look protected because an unrelated precondition happened to fail, which
      // is the same passing-for-the-wrong-reason trap this suite exists to avoid.
      const isStaffGate = AUTHORIZATION_REFUSALS.some((phrase) => error.message.includes(phrase));
      return { outcome: isStaffGate ? 'denied' : 'precondition', message: error.message };
    }
    // Any other failure means the guard was PASSED and execution proceeded into logic that
    // the stub cannot satisfy. That is an ALLOW for authorization purposes.
    return { outcome: 'allowed-then-failed', code: error && error.code, message: String(error && error.message).slice(0, 80) };
  }
}

// ---- 1. EVERY privileged call site refuses every non-active status ------------------
const failures = [];
let invocations = 0;
for (const site of CALL_SITES) {
  for (const status of REFUSING) {
    const result = await invoke(site.module, site.callable, { role: 'Director', status });
    invocations += 1;
    if (result.outcome === 'missing') { failures.push(`${site.module}.${site.callable} is not exported`); continue; }
    if (result.outcome !== 'denied') {
      failures.push(`${site.surface} :: ${site.module}.${site.callable} ALLOWED status ${JSON.stringify(status)} (${result.outcome}${result.code ? ' ' + result.code : ''})`);
    }
  }
  // A missing admin_users document must also be refused.
  const absent = await invoke(site.module, site.callable, null);
  invocations += 1;
  if (absent.outcome !== 'denied') {
    failures.push(`${site.surface} :: ${site.module}.${site.callable} ALLOWED a caller with NO admin_users document (${absent.outcome})`);
  }
  // A document with no status at all — the legacy shape — must be refused.
  const noStatus = await invoke(site.module, site.callable, { role: 'Director' });
  invocations += 1;
  if (noStatus.outcome !== 'denied') {
    failures.push(`${site.surface} :: ${site.module}.${site.callable} ALLOWED a document with NO status (${noStatus.outcome})`);
  }
  // A role-less but active document must be refused.
  const noRole = await invoke(site.module, site.callable, { status: 'Active' });
  invocations += 1;
  if (noRole.outcome !== 'denied') {
    failures.push(`${site.surface} :: ${site.module}.${site.callable} ALLOWED a role-less document (${noRole.outcome})`);
  }
}
assert.deepEqual(failures, [], `PORTAL CALL SITES ADMITTED UNAUTHORIZED STAFF:\n  ${failures.join('\n  ')}`);
ok(`${CALL_SITES.length} privileged Portal call sites refused every one of ${REFUSING.length} non-active statuses, a missing document, a status-less document and a role-less document (${invocations} real invocations)`);

// ---- 2. THE GUARD IS NOT A BLANKET DENIAL ------------------------------------------
// If every status were refused the block above would pass while the product was broken.
// An ACTIVE caller must get PAST the authorization guard — it may then fail on stubbed
// I/O, which is exactly the signal that authorization was satisfied.
const admitted = [];
for (const site of CALL_SITES) {
  for (const status of AUTHORIZING) {
    const result = await invoke(site.module, site.callable, { role: 'Director', status });
    if (result.outcome === 'denied') {
      admitted.push(`${site.module}.${site.callable} refused an ACTIVE Director with status ${JSON.stringify(status)} — the guard denies everything`);
    }
  }
}
assert.deepEqual(admitted, [], `A LOCKOUT, NOT A CONTROL:\n  ${admitted.join('\n  ')}`);
ok(`the same ${CALL_SITES.length} call sites admit an ACTIVE Director across ${AUTHORIZING.length} canonical spellings — the refusals above are a control, not a lockout`);

// ---- 3. APP CHECK ENFORCEMENT IS DECLARED ON PRIVILEGED PORTAL CALLABLES ------------
// Recorded as evidence, not asserted as provisioned. The Portal declares enforceAppCheck
// on its callables; the Admin lane declares it nowhere. Same project, two postures.
const appCheckByModule = new Map();
for (const site of CALL_SITES) {
  const loaded = require(resolve(FUNCTIONS, `lib/${site.module}.js`));
  const fn = loaded[site.callable];
  const enforced = !!(fn && fn.__options && fn.__options.enforceAppCheck);
  appCheckByModule.set(site.module, (appCheckByModule.get(site.module) || 0) + (enforced ? 1 : 0));
}
const enforcingModules = [...appCheckByModule.entries()].filter(([, n]) => n > 0);
assert.ok(enforcingModules.length > 0, 'no Portal callable declares enforceAppCheck — the recorded posture has changed');
ok(`App Check declared on privileged callables in ${enforcingModules.length}/${appCheckByModule.size} Portal runtimes (evidence for the commissioning boundary; provisioning is NOT asserted)`);

console.log(`\nPortal authority call-site verification PASS: ${checks} checks, ${invocations} real callable invocations across ${CALL_SITES.length} privileged call sites and ${new Set(CALL_SITES.map((s) => s.surface)).size} business surfaces.`);
