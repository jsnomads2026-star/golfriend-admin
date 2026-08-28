#!/usr/bin/env node
// REST writes are retired. A live batch needs the server-side canonical executor.
import { runV1SeedBatch } from './v1-course-seed-migration.mjs';
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{const[k,...v]=x.slice(2).split('=');return[k,v.join('=')]}));
if(args.mode!=='dry-run'||!args.fixture)throw Error('V1_SEED_SERVER_EXECUTOR_REQUIRED');
const rows=JSON.parse(await (await import('node:fs/promises')).readFile(args.fixture,'utf8'));
console.log(JSON.stringify(await runV1SeedBatch({sourceRows:rows,existingCourses:[],cursor:args.cursor||null,limit:Number(args.limit||25),dryRun:true})));
