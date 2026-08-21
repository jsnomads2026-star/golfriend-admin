#!/usr/bin/env node
// The sole operator trigger for the first production incremental batch.
import {spawnSync} from 'node:child_process';
const TARGET_PROJECT='golfriend-v2-production-2ee34',REGION='asia-southeast1',JOB='firebase-schedule-scheduledGolfApiCatalogueIncremental-asia-southeast1',MAX_PROVIDER_REQUESTS=10,MAX_COURSE_WRITES=2;
const args=Object.fromEntries(process.argv.slice(2).filter(value=>value.startsWith('--')&&value.includes('=')).map(value=>{const [key,...rest]=value.slice(2).split('=');return[key,rest.join('=')];}));
if(args.project!==TARGET_PROJECT)throw Error('PROJECT_TARGET_REJECTED');
if(args['max-provider-requests']!==String(MAX_PROVIDER_REQUESTS)||args['max-course-writes']!==String(MAX_COURSE_WRITES))throw Error('CONTROLLED_INCREMENTAL_BOUND_REQUIRED');
if(args.execute!=='APPROVED_CONTROLLED_INCREMENTAL')throw Error('EXECUTION_APPROVAL_REQUIRED');
const result=spawnSync('gcloud.cmd',['scheduler','jobs','run',JOB,`--location=${REGION}`,`--project=${TARGET_PROJECT}`],{encoding:'utf8',windowsHide:true,shell:false});
if(result.status!==0)throw Error(`SCHEDULER_TRIGGER_FAILED:${String(result.stderr||result.stdout).trim().slice(0,160)}`);
console.log(JSON.stringify({projectId:TARGET_PROJECT,job:JOB,region:REGION,maxProviderRequests:MAX_PROVIDER_REQUESTS,maxCourseWrites:MAX_COURSE_WRITES,providerRequests:'scheduler-triggered; server activation gate remains authoritative'},null,2));
