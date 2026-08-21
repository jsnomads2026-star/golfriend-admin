#!/usr/bin/env node
// Local-only cutover plan validation. It never authenticates or contacts Firebase.
const TARGET_PROJECT='golfriend-v2-production-2ee34';
const args=Object.fromEntries(process.argv.slice(2).filter(value=>value.startsWith('--')&&value.includes('=')).map(value=>{const [key,...rest]=value.slice(2).split('=');return[key,rest.join('=')];}));
if(args.project!==TARGET_PROJECT)throw Error('PROJECT_TARGET_REJECTED');
if(args.mode!=='plan')throw Error('MIGRATION_PREFLIGHT_PLAN_ONLY');
console.log(JSON.stringify({projectId:TARGET_PROJECT,mode:'plan',localOnly:true,providerRequests:0,firestoreReads:0,firestoreWrites:0,requiredBeforeDataMigration:['target rules and indexes deployed','target provider functions and GOLF_API_KEY metadata binding evidenced','provider schedulers paused','target activation configuration disabled','checkpoint blocked','course identity and audit retention plan approved'],collections:['courses','platform/golfApiCatalogueConfig','course_acquisition_checkpoints/golf-api','golf_api_quota','golf_api_quota_reservations','golf_api_quota_evidence','course_catalogue_activation_receipts','course_catalogue_runs','course_catalogue_failures','course_catalogue_dead_letters','golf_api_record_quarantine','course_catalogue_count_receipts']},null,2));
