'use strict';

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const activation=fs.readFileSync(path.join(__dirname,'..','scripts','activate-course-catalogue-after-rotation.mjs'),'utf8');
const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));

test('activation evidence is deferred-manual and has no control-plane mutation capability',()=>{
  assert.match(activation,/SCHEDULER_MODE = 'deferred_by_design'/);
  assert.match(activation,/DEFERRED_MANUAL_BASELINE_READ_ONLY/);
  assert.doesNotMatch(activation,/cloudscheduler\.googleapis\.com/);
  assert.doesNotMatch(activation,/firestore\.googleapis\.com/);
  assert.match(activation,/https:\/\/secretmanager\.googleapis\.com/);
  assert.match(activation,/https:\/\/cloudfunctions\.googleapis\.com/);
  assert.match(activation,/https:\/\/run\.googleapis\.com/);
  assert.doesNotMatch(activation,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});

test('activation has no scheduled activation list or receipt/binding mutation flags',()=>{
  assert.match(activation,/const CALLABLE_FUNCTIONS = \[/);
  assert.doesNotMatch(activation,/scheduledGolfApiCatalogue|scheduledCourseCountryIngestionWorker|scheduledGolfApiCourseAcquisitionWorker/);
  assert.doesNotMatch(activation,/RECEIPT_ONLY=|SAFE_BIND=|bindingReceiptId|course_catalogue_activation_receipts/);
});

test('all prior mutation flags are explicitly rejected',()=>{
  for(const flag of ['--write-receipt-only','--bind-receipt-disabled','--apply-after-claude-pass'])assert.match(activation,new RegExp(flag.replace(/[-]/g,'\\-')));
  assert.match(activation,/DEFERRED_MANUAL_BASELINE_READ_ONLY/);
});

test('production deployment remains callable-only',()=>{
  const command=packageJson.scripts['deploy:course-catalogue:production:callables'];
  assert.match(command,/^firebase deploy --project golfriend-v2-production-2ee34 --only /);
  assert.doesNotMatch(command,/scheduledGolfApiCourseAcquisitionWorker|scheduledCourseCountryIngestionWorker|scheduledGolfApiCatalogue/);
  assert.match(packageJson.scripts['register:course-catalogue:production:schedulers'],/--project=golfriend-v2-production-2ee34/);
});
