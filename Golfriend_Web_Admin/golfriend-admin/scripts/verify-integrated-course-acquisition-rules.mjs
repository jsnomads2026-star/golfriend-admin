import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
const path=process.argv[2];if(!path){console.error('INTEGRATED_RULES_PATH_REQUIRED');process.exit(2)}
const text=readFileSync(resolve(path),'utf8'),collections=['golf_api_quota','golf_api_quota_receipts','golf_api_quota_overrides','course_acquisition_candidates','course_provider_attempts','course_provider_evidence','course_acquisition_reviews','course_publication_receipts','course_correction_requests'];
for(const name of collections){const pattern=new RegExp(`match\\s+/${name}/\\{[^}]+\\}\\s*\\{\\s*allow\\s+read,\\s*write:\\s*if\\s+false;\\s*\\}`,'m');if(!pattern.test(text)){console.error(`RULE_DENIAL_MISSING:${name}`);process.exit(1)}}
if(!/match\s+\/courses\/\{courseId\}[\s\S]{0,300}allow\s+write:\s*if\s+false;/.test(text)){console.error('CANONICAL_WRITE_DENIAL_MISSING');process.exit(1)}
const recursive=[...text.matchAll(/match\s+\/\{[^}]+=\*\*\}\s*\{([\s\S]*?)\}/g)];if(recursive.some(x=>/allow\s+(read|write|read,\s*write)\s*:\s*if\s+(?!false)/.test(x[1]))){console.error('OVERLAPPING_RECURSIVE_GRANT_REQUIRES_RULES_EMULATOR_REVIEW');process.exit(1)}
console.log(JSON.stringify({ok:true,rulesVersion:'course-acquisition-rules.v1',sha256:createHash('sha256').update(text).digest('hex'),protectedCollections:collections.length,overlappingRecursiveGrant:false}));
