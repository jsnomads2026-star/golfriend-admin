import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const firebaseRc = JSON.parse(readFileSync(new URL('./.firebaserc', root), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(new URL('./firebase.json', root), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('./package.json', root), 'utf8'));
const runbook = readFileSync(new URL('./docs/COURSE_CATALOGUE_PRODUCTION_CUTOVER.md', root), 'utf8');
const evidence = readFileSync(new URL('./scripts/read-course-catalogue-production-evidence.mjs', root), 'utf8');
const migrationPreflight = readFileSync(new URL('./scripts/course-catalogue-production-migration-preflight.mjs', root), 'utf8');
const controlledIncremental = readFileSync(new URL('./scripts/run-course-catalogue-production-controlled-incremental.mjs', root), 'utf8');
const activation = readFileSync(new URL('./scripts/activate-course-catalogue-after-rotation.mjs', root), 'utf8');
const pipelineStatus = readFileSync(new URL('./scripts/run-course-catalogue-pipeline.mjs', root), 'utf8');
const schedulerRegistration = readFileSync(new URL('./scripts/register-course-catalogue-production-schedulers.mjs', root), 'utf8');
const disabledBaseline = readFileSync(new URL('./scripts/establish-course-catalogue-production-disabled-baseline.mjs', root), 'utf8');
const callableExports = [
  'searchGolfApiCatalogue', 'getGolfApiCatalogueStatus', 'reconcileGolfApiPendingSettlements',
  'armGolfApiCalibrationCanary', 'runGolfApiCalibrationCanary',
];
const scheduledExports = [
  'scheduledGolfApiCatalogueIncremental', 'scheduledGolfApiCatalogueRetries',
  'scheduledGolfApiCatalogueCanary', 'scheduledGolfApiCatalogueCountReceipt',
];
const activationExports = [
  'activateCourseCatalogue', 'startCourseCountryIngestion', 'pauseCourseCountryIngestion',
  'resumeCourseCountryIngestion', 'requestGolfApiCourseAcquisition',
  'scheduledCourseCountryIngestionWorker', 'scheduledGolfApiCourseAcquisitionWorker',
];

test('course catalogue keeps the unrelated default V1 project and declares the distinct production alias', () => {
  assert.equal(firebaseRc.projects.default, 'golfriend-v1');
  assert.equal(firebaseRc.projects['golfriend-v2-production-2ee34'], 'golfriend-v2-production-2ee34');
  assert.equal(firebaseRc.projects['golfriend-v2'], undefined);
});

test('course catalogue codebase is Node 20 and every operational command selects production explicitly', () => {
  const codebase = firebaseJson.functions.find((item) => item.codebase === 'course-catalogue');
  assert.deepEqual(codebase && { source: codebase.source, runtime: codebase.runtime }, {
    source: 'functions-course-catalogue', runtime: 'nodejs20',
  });
  const callableDeploy = packageJson.scripts['deploy:course-catalogue:production:callables'];
  assert.match(callableDeploy, /^firebase deploy --project golfriend-v2-production-2ee34 --only /);
  for (const name of callableExports) assert.match(callableDeploy, new RegExp(`functions:course-catalogue:${name}`));
  for (const name of scheduledExports) assert.doesNotMatch(callableDeploy, new RegExp(name));
  assert.equal(packageJson.scripts['deploy:course-catalogue:production'], undefined);
  assert.match(packageJson.scripts['register:course-catalogue:production:schedulers'], /--project=golfriend-v2-production-2ee34/);
  assert.equal(packageJson.scripts['evidence:course-catalogue:production'],
    'node scripts/read-course-catalogue-production-evidence.mjs');
  assert.match(packageJson.scripts['preflight:course-catalogue:production'], /--project=golfriend-v2-production-2ee34/);
  assert.match(packageJson.scripts['establish:course-catalogue:production:disabled-baseline'], /--project=golfriend-v2-production-2ee34/);
  assert.match(packageJson.scripts['run:course-catalogue:production:controlled-incremental'], /--project=golfriend-v2-production-2ee34/);
  assert.equal(packageJson.scripts['deploy:course-catalogue:v2'], undefined);
  assert.equal(packageJson.scripts['evidence:course-catalogue:v2'], undefined);
  assert.match(packageJson.scripts['verify:course-catalogue-predeploy'], /test:course-catalogue-deployment-target/);
  assert.match(runbook, /deploy:course-catalogue:production:callables/);
  assert.doesNotMatch(runbook, /firebase deploy(?!\s+--project\s+golfriend-v2-production-2ee34)/);
  assert.doesNotMatch(runbook, /--project\s+golfriend-v2(?:\s|$)/);
  assert.match(evidence, /PROJECT\s*=\s*'golfriend-v2-production-2ee34'/);
  assert.match(evidence, /Read-only production control-plane evidence/);
  assert.doesNotMatch(evidence, /:access|method:\s*['"]POST['"]|method:\s*['"]PATCH['"]|method:\s*['"]PUT['"]|method:\s*['"]DELETE['"]/);
  assert.match(evidence, /const CALLABLE_FUNCTIONS = \[/);
  assert.match(evidence, /const DEFERRED_SCHEDULED_EXPORTS = \[/);
  assert.match(evidence, /deferred\/not created by design/);
  assert.match(evidence, /const LEGACY_SCHEDULER = 'firebase-schedule-runGolfApiIngestion-asia-southeast1'/);
  assert.match(evidence, /LEGACY_RUN_GOLF_API_INGESTION_NOT_PAUSED/);
  assert.match(evidence, /DEFERRED_CATALOGUE_SCHEDULER_PRESENT/);
  assert.match(evidence, /FIRESTORE_RULES_RELEASE_MISSING/);
  assert.match(evidence, /CATALOGUE_CONFIGURATION_NOT_DISABLED/);
  assert.match(evidence, /CATALOGUE_CHECKPOINT_NOT_BLOCKED/);
  assert.match(evidence, /CATALOGUE_QUOTA_BASELINE_NOT_EMPTY/);
  for (const name of callableExports) assert.match(evidence, new RegExp(`'${name}'`));
  for (const name of scheduledExports) assert.match(evidence, new RegExp(`'${name}'`));
  assert.match(migrationPreflight, /TARGET_PROJECT='golfriend-v2-production-2ee34'/);
  assert.match(controlledIncremental, /TARGET_PROJECT='golfriend-v2-production-2ee34'/);
  assert.match(activation, /PROJECT\s*=\s*'golfriend-v2-production-2ee34'/);
  assert.match(activation, /SCHEDULER_MODE = 'deferred_by_design'/);
  assert.match(activation, /const ACTIVATION_FUNCTIONS = \[/);
  assert.match(activation, /DEFERRED_MANUAL_BASELINE_READ_ONLY/);
  assert.doesNotMatch(activation, /cloudscheduler\.googleapis\.com/);
  assert.doesNotMatch(activation, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
  for (const name of activationExports) assert.match(activation, new RegExp(`'${name}'`));
  for (const name of scheduledExports) assert.doesNotMatch(activation, new RegExp(`'${name}'`));
  assert.match(pipelineStatus, /PROJECT='golfriend-v2-production-2ee34'/);
  assert.match(controlledIncremental, /MAX_PROVIDER_REQUESTS=10/);
  assert.match(controlledIncremental, /MAX_COURSE_WRITES=2/);
  assert.match(schedulerRegistration, /SCHEDULER_REGISTRATION_AUTHORIZATION_REQUIRED/);
  assert.match(schedulerRegistration, /PAUSED_JOB_CONFIRMATION_REQUIRED/);
  assert.match(schedulerRegistration, /functions:course-catalogue:\$\{name\}/);
  assert.match(disabledBaseline, /TARGET_PROJECT = 'golfriend-v2-production-2ee34'/);
  assert.match(disabledBaseline, /DISABLED_BASELINE_EXECUTION_APPROVAL_REQUIRED/);
  assert.match(disabledBaseline, /currentDocument: \{ exists: false \}/);
  assert.match(disabledBaseline, /functionInvocations: 0/);
  assert.match(disabledBaseline, /schedulerMutations: 0/);
  assert.match(disabledBaseline, /courseWrites: 0/);
  for (const name of scheduledExports) assert.match(schedulerRegistration, new RegExp(`'${name}'`));
});

test('production operation guards reject the former V2 project, unqualified execution, and an unbounded trigger', () => {
  assert.match(migrationPreflight, /PROJECT_TARGET_REJECTED/);
  assert.match(controlledIncremental, /PROJECT_TARGET_REJECTED/);
  assert.match(controlledIncremental, /EXECUTION_APPROVAL_REQUIRED/);
  assert.match(controlledIncremental, /spawnSync\('gcloud\.cmd',\['scheduler','jobs','run'/);
  for (const [script, args, expected] of [
    ['course-catalogue-production-migration-preflight.mjs', ['--project=golfriend-v2', '--mode=plan'], 'PROJECT_TARGET_REJECTED'],
    ['course-catalogue-production-migration-preflight.mjs', ['--mode=plan'], 'PROJECT_TARGET_REJECTED'],
    ['run-course-catalogue-production-controlled-incremental.mjs', ['--project=golfriend-v2', '--max-provider-requests=10', '--max-course-writes=2'], 'PROJECT_TARGET_REJECTED'],
    ['run-course-catalogue-production-controlled-incremental.mjs', ['--max-provider-requests=10', '--max-course-writes=2'], 'PROJECT_TARGET_REJECTED'],
    ['run-course-catalogue-production-controlled-incremental.mjs', ['--project=golfriend-v2-production-2ee34', '--max-provider-requests=9', '--max-course-writes=2'], 'CONTROLLED_INCREMENTAL_BOUND_REQUIRED'],
    ['run-course-catalogue-production-controlled-incremental.mjs', ['--project=golfriend-v2-production-2ee34', '--max-provider-requests=10', '--max-course-writes=2'], 'EXECUTION_APPROVAL_REQUIRED'],
    ['register-course-catalogue-production-schedulers.mjs', ['--project=golfriend-v2-production-2ee34'], 'SCHEDULER_REGISTRATION_AUTHORIZATION_REQUIRED'],
    ['register-course-catalogue-production-schedulers.mjs', ['--project=golfriend-v2-production-2ee34', '--execute=SCHEDULER_REGISTRATION_APPROVED'], 'PAUSED_JOB_CONFIRMATION_REQUIRED'],
    ['register-course-catalogue-production-schedulers.mjs', ['--project=golfriend-v2'], 'PROJECT_TARGET_REJECTED'],
    ['establish-course-catalogue-production-disabled-baseline.mjs', ['--project=golfriend-v2'], 'PROJECT_TARGET_REJECTED'],
    ['establish-course-catalogue-production-disabled-baseline.mjs', ['--project=golfriend-v2-production-2ee34'], 'DISABLED_BASELINE_EXECUTION_APPROVAL_REQUIRED'],
  ]) {
    const result = spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: new URL('..', import.meta.url), encoding: 'utf8', shell: false });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, new RegExp(expected));
  }
});
