import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let checks = 0;
const test = (name, fn) => { fn(); checks += 1; console.log(`ok ${checks} - ${name}`); };
const runtime=read('functions/src/partnerOnboardingRuntime.ts'), index=read('functions/src/index.ts'), app=read('src/App.tsx'), journey=read('src/components/B2B/PartnerApplicationJourney.tsx'), admin=read('src/components/admin/v2/V2PartnerApplications.tsx'), service=read('src/components/B2B/partnerApplicationService.ts'), firestore=read('partner-onboarding.firestore.rules'), storage=read('partner-onboarding.storage.rules');
test('ten callables enforce App Check',()=>assert.equal((runtime.match(/enforceAppCheck: true/g)||[]).length,10));
test('fixed server collections',()=>assert.match(runtime,/partner_applications_v2/));
test('client cannot select collection',()=>assert.doesNotMatch(service,/collection\s*\(/));
test('authenticated ownership deterministic',()=>assert.match(runtime,/applicationId\(uid\)/));
test('active staff authority',()=>assert.match(runtime,/isActiveStaff/));
test('evidence provider fails closed',()=>assert.match(runtime,/PROVIDER_UNCONFIGURED/));
test('evidence path server generated',()=>assert.match(runtime,/partner-applications\/\$\{id\}\/\$\{idempotentId\}/));
test('approval does not publish',()=>assert.match(runtime,/publishToApp: false/));
test('course candidate handoff',()=>assert.match(runtime,/course_growth_candidates/));
test('verified representative is staff-evidence backed',()=>assert.match(runtime,/verificationStatus !== "verified"/));
test('agreement acceptance is server timestamped',()=>assert.match(runtime,/acceptedAt: at\(\)/));
test('commission requires immutable approval record',()=>assert.match(runtime,/partner_contract_approvals/));
test('unsigned candidates cannot invoice',()=>assert.match(runtime,/invoiceEligible: false/));
// The applicant journey is ZONED, not absent. The frozen "never mounted" assertion made the
// only applicant surface unreachable dead code, so no applicant could ever complete a real
// application. The invariant that actually protects the Portal is: mounted beneath an explicit
// APPLICANT route, and nowhere else. Route-class separation itself is proven behaviourally in
// scripts/route-guard-verify.mjs; this check pins the mount site.
test('applicant journey is mounted only inside the applicant zone',()=>{
  assert.match(journey,/PartnerApplicationJourney/);
  assert.match(app,/<Route path="\/apply\//,'explicit APPLICANT routes must exist');
  const mounts=[...app.matchAll(/<PartnerApplicationJourney[\s/>]/g)];
  assert.equal(mounts.length,1,'exactly one mount site');
  const zone=app.indexOf('function Applicant(');
  assert.ok(zone!==-1&&zone<mounts[0].index,'the mount must sit inside function Applicant(');
  assert.doesNotMatch(app.slice(zone,mounts[0].index),/\nfunction /,'no other function may open between the applicant zone and the mount');
  const dashboard=app.indexOf('function Dashboard(');
  assert.ok(dashboard>mounts[0].index,'the privileged Dashboard must not contain the mount');
});
test('admin consumer mounted',()=>assert.match(app,/V2PartnerApplications/));
test('callables exported',()=>['savePartnerApplicationDraftV2','uploadPartnerApplicationEvidenceV2','reviewPartnerApplicationV2'].forEach(name=>assert.match(index,new RegExp(name))));
test('eight locale applicant selector',()=>assert.match(journey,/\["en", "th", "ko", "ja", "zh", "es", "fr", "de"\]/));
test('Thai staff copy',()=>assert.match(admin,/ตรวจสอบการสมัครพันธมิตร/));
test('loading and error semantics',()=>{assert.match(journey,/role="status"/);assert.match(journey,/role="alert"/);});
test('restart server load',()=>assert.match(journey,/partnerApplicationService\.load/));
test('two way support',()=>{assert.match(runtime,/sendPartnerSupportMessageV2/);assert.match(runtime,/sendAdminPartnerSupportMessageV2/);});
test('Marketing Library reused',()=>assert.match(runtime,/marketing_assets/));
test('direct database access denied',()=>{assert.match(firestore,/allow read, write: if false/);assert.match(storage,/allow read, write: if false/);});
test('no mock success path',()=>{assert.doesNotMatch(service,/mock|fixture/i);assert.doesNotMatch(journey,/setTimeout/);});
console.log(`partner onboarding verifier: ${checks} checks passed.`);
