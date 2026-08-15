import assert from "node:assert/strict";import{readFileSync}from"node:fs";import{join}from"node:path";
const source=readFileSync(join(process.cwd(),"src","courseAcquisition.ts"),"utf8");let passed=0;const check=(name:string,fn:()=>void)=>{fn();passed++;console.log(`ok ${passed} - ${name}`)};
check("all production callables enforce App Check and provider secret stays server-side",()=>{assert.match(source,/enforceAppCheck:true/);assert.match(source,/defineSecret\("GOLF_API_KEY"\)/);assert.doesNotMatch(source,/return\{[^}]*apiKey/);});
check("candidate ingestion never writes raw provider responses to canonical courses",()=>{assert.match(source,/course_acquisition_candidates/);assert.match(source,/course_provider_evidence/);assert.doesNotMatch(source,/batch\.set\(db\.collection\("courses"\)/);});
check("publication is transactional separately authorized and stale-safe",()=>{assert.match(source,/publishCanonical/);assert.match(source,/db\.runTransaction/);assert.match(source,/STALE_SOURCE_OVERWRITE_DENIED/);assert.match(source,/course_publication_receipts/);});
check("quota reservation and reconciliation are transaction owned",()=>{assert.match(source,/golf_api_quota_receipts/);assert.match(source,/reconcileQuota/);assert.match(source,/COMMAND_REUSED/);});
check("portal correction cannot mutate canonical catalogue",()=>{const block=source.slice(source.indexOf("submitCourseCorrectionRequest"));assert.match(block,/course_correction_requests/);assert.match(block,/canonicalMutation:false/);assert.doesNotMatch(block,/collection\("courses"\)/);});
console.log(`1..${passed}`);
