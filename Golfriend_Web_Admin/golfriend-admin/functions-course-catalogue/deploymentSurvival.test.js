'use strict';
// DELETION BY DEPLOY IS A REAL FAILURE MODE — course-catalogue codebase.
//
// Founder ruling 2026-09-05, re-baseline. `firebase deploy --only functions:course-catalogue`
// RECONCILES the codebase: a function live under that codebase label but absent from this
// entrypoint's export set is DELETED, silently. Measured that day against production, deploying
// this codebase from the baseline would have removed four live functions, one of them
// scheduledGolfApiCourseAcquisitionWorker, which runs on an ENABLED 5-minute schedule.
//
// RESOLVED EXPORTS, NOT FILE TEXT. A grep cannot see a spread re-export, and on the app side that
// exact mistake produced a false "this function will be deleted" report. So this loads the module
// and reads Object.keys. The clean worktree has no node_modules, so the three firebase packages are
// stubbed through Module._load — the same interception this repo already uses in
// backend/v2/domains/locker/lockerAuthorityCallable.test.js. Local modules load for real.
//
// COVERAGE IS DECLARED, NOT IMPLIED. Anything not in COVERED below is listed in NOT_COVERED with a
// reason. This test must never suggest a contract holds when it was excluded from the import.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

/** Live under codebase=course-catalogue and imported into this baseline. */
const COVERED = Object.freeze([
  ['activateCourseCatalogue', 'ee3961b — activation callable, Admin UI: none found, no schedule'],
  ['requestGolfApiCourseAcquisition', '9a66695 — Admin UI course acquisition request'],
  ['scheduledGolfApiCourseAcquisitionWorker', '9a66695 — ENABLED, every 5 minutes'],
  ['scheduledCourseCountryIngestionWorker', 'baseline — ENABLED, every 5 minutes'],
  ['startGlobalCatalogueCutover', 'baseline — Admin UI'],
  ['startCourseCountryIngestion', 'baseline — Admin UI'],
  ['pauseCourseCountryIngestion', 'baseline — Admin UI'],
  ['resumeCourseCountryIngestion', 'baseline — Admin UI'],
  ['previewCourseCountryAutoRefresh', 'baseline — Admin UI'],
  ['setCourseCountryAutoRefresh', 'baseline — Admin UI'],
  ['searchGolfApiCatalogue', 'baseline'],
  ['getGolfApiCatalogueStatus', 'baseline — Admin UI'],
  ['armGolfApiCalibrationCanary', 'baseline — Admin UI'],
  ['runGolfApiCalibrationCanary', 'baseline — Admin UI'],
  ['reconcileGolfApiPendingSettlements', 'baseline'],
]);

/**
 * Live under codebase=course-catalogue and DELIBERATELY NOT imported. A deploy of this codebase
 * from this baseline WOULD delete these. They are listed so the gap is explicit rather than implied
 * to be covered. Removing an entry means it was imported and must move to COVERED.
 */
const NOT_COVERED = Object.freeze([
  ['enableWeeklyCourseRefresh', 'enableweeklycourserefresh-00001-nit',
    'df9e480 weeklyRefresh.js destructures {WEEK, asMs} from ./countrySchedule. This baseline defines asMs without exporting it and has no WEEK at all, so weeklyJob() throws "asMs is not a function". Importing it would require editing countrySchedule.js, a diverged file outside the four ruled for import. Owner: countrySchedule recovery packet.'],
]);

const stub = () => new Proxy(function stubbed() { return stubbed; }, {
  get: (t, k) => (k === 'then' ? undefined : stub()),
  apply: () => stub(),
  construct: () => stub(),
});

function resolvedExports() {
  const original = Module._load;
  Module._load = (id, parent, isMain) => {
    if (id === 'firebase-functions/v2/https') return { onCall: () => stub(), HttpsError: class extends Error {} };
    if (id === 'firebase-functions/v2/scheduler') return { onSchedule: () => stub() };
    if (id === 'firebase-functions/params') return { defineSecret: () => stub() };
    // geo-tz backs courseTimeZone.js (ba93ba4). Stubbed for the same reason as the firebase
    // packages: this check is about which names the module exports, not about resolving timezones.
    if (id === 'geo-tz/all' || id === 'geo-tz') return { find: () => [] };
    if (id === 'firebase-admin') {
      const fs = () => stub();
      fs.FieldValue = { serverTimestamp: () => stub() };
      fs.Timestamp = { now: () => stub(), fromMillis: () => stub() };
      return { apps: [{}], initializeApp: () => stub(), firestore: fs, app: () => ({ options: {} }), credential: { applicationDefault: () => stub() } };
    }
    return original(id, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(path.join(__dirname, 'index.js'))];
    return Object.keys(require(path.join(__dirname, 'index.js')));
  } finally {
    Module._load = original;
  }
}

test('every covered course-catalogue function survives a codebase deploy', () => {
  const exported = new Set(resolvedExports());
  const missing = COVERED.filter(([name]) => !exported.has(name));
  assert.deepEqual(
    missing.map(([name, why]) => `${name} — ${why}`),
    [],
    'live under codebase=course-catalogue but absent from the resolved export set: a codebase deploy would DELETE these',
  );
});

test('excluded contracts are declared, and this guard does not claim they hold', () => {
  const exported = new Set(resolvedExports());
  // If one of these becomes exported it was imported, and the ledger must be updated rather than
  // silently drifting into "covered". Either direction fails here.
  const nowPresent = NOT_COVERED.filter(([name]) => exported.has(name));
  assert.deepEqual(
    nowPresent.map(([name]) => name),
    [],
    'a NOT_COVERED function is now exported — move it to COVERED and remove it from the excluded ledger',
  );
  assert.ok(NOT_COVERED.length > 0, 'the excluded ledger is empty — if nothing is excluded, say so deliberately');
});

test('the country ingestion worker keeps its observed production cadence of every 5 minutes', () => {
  // Founder ruling 2026-09-05: production runs this every 5 minutes. df9e480 redefines it to
  // 'every 7 days'; that redefinition is excluded and must never arrive as a side effect of an
  // import. A 2,016-fold cadence change would be its own release with its own rationale.
  const source = require('node:fs').readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const definitions = source.split('\n').filter((l) => l.startsWith('exports.scheduledCourseCountryIngestionWorker='));
  assert.ok(definitions.length > 0, 'the country ingestion worker export disappeared');
  for (const line of definitions) {
    assert.match(line, /schedule:'every 5 minutes'/, 'country ingestion worker cadence is not every 5 minutes');
    assert.doesNotMatch(line, /every 7 days/, 'the excluded 7-day cadence has arrived');
  }
});
