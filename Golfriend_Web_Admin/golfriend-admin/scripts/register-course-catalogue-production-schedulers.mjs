#!/usr/bin/env node
// Deferred phase: only run after an operator has created and verified the four
// Cloud Scheduler jobs PAUSED. Firebase deploy otherwise creates them ENABLED.
import { spawnSync } from 'node:child_process';
const TARGET_PROJECT='golfriend-v2-production-2ee34';
const scheduled=[
  'scheduledGolfApiCatalogueIncremental', 'scheduledGolfApiCatalogueRetries',
  'scheduledGolfApiCatalogueCanary', 'scheduledGolfApiCatalogueCountReceipt',
];
const args=Object.fromEntries(process.argv.slice(2).filter(value=>value.startsWith('--')&&value.includes('=')).map(value=>{const [key,...rest]=value.slice(2).split('=');return[key,rest.join('=')];}));
if(args.project!==TARGET_PROJECT)throw Error('PROJECT_TARGET_REJECTED');
if(args.execute!=='SCHEDULER_REGISTRATION_APPROVED')throw Error('SCHEDULER_REGISTRATION_AUTHORIZATION_REQUIRED');
if(args['paused-jobs-confirmed']!=='true')throw Error('PAUSED_JOB_CONFIRMATION_REQUIRED');
const only=scheduled.map(name=>`functions:course-catalogue:${name}`).join(',');
const result=spawnSync('firebase.cmd',['deploy','--project',TARGET_PROJECT,'--only',only],{encoding:'utf8',windowsHide:true,shell:false});
if(result.status!==0)throw Error(`SCHEDULER_REGISTRATION_FAILED:${String(result.stderr||result.stdout).trim().slice(0,160)}`);
console.log(JSON.stringify({projectId:TARGET_PROJECT,scheduledExports:scheduled,pausedJobsConfirmed:true},null,2));
