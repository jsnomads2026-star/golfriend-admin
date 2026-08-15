import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('../commissioning/firestore.course-acquisition.rules.fragment',import.meta.url),'utf8'),matrix=JSON.parse(readFileSync(new URL('../commissioning/course-acquisition.rules-cases.json',import.meta.url),'utf8')).cases,protectedCollections=['golf_api_quota','golf_api_quota_receipts','golf_api_quota_overrides','course_acquisition_candidates','course_provider_attempts','course_provider_evidence','course_acquisition_reviews','course_publication_receipts','course_correction_requests'];
let passed=0;const check=(name,fn)=>{fn();passed++;console.log(`ok ${passed} - ${name}`)};
for(const collection of protectedCollections)check(`direct client access denied for ${collection}`,()=>assert.match(rules,new RegExp(`match /${collection}/\\{document=\\*\\*\\} \\{ allow read, write: if false; \\}`)));
for(const principal of ['unauthenticated','member','portal_partner','admin_client','missing_claims'])check(`${principal} has no protected direct grant`,()=>assert.ok(matrix.filter(x=>x.principal===principal).every(x=>x.read!==true&&x.write!==true)));
check('Portal correction remains callable-only and canonical write is denied',()=>{assert.ok(matrix.some(x=>x.principal==='portal_partner'&&x.collection==='course_correction_requests'&&x.write===false));assert.match(rules,/match \/courses\/\{courseId\} \{ allow write: if false; \}/)});
console.log(`1..${passed}`);
