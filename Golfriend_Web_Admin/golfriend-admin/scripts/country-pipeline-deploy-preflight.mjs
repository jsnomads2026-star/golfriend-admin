import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const node = process.execPath;
const run = (args) => execFileSync(node, args, { cwd: root, stdio: 'inherit' });

run(['--check', 'functions-course-catalogue/index.js']);
run(['--test',
  'functions-course-catalogue/countryEnrollment.test.js',
  'functions-course-catalogue/countryGlobalPolicy.test.js',
  'functions-course-catalogue/countryIngestion.test.js',
  'functions-course-catalogue/countryMapping.test.js',
  'functions-course-catalogue/countrySchedule.test.js',
  'functions-course-catalogue/countryWorker.test.js',
  'functions-course-catalogue/thailandQuotaCalibration.test.js',
  'scripts/v1-course-seed-migration.test.mjs',
]);
run(['functions-course-catalogue/selection-proof.js']);
