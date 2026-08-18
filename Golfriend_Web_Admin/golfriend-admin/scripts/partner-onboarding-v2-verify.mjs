import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let checks = 0;
const test = (name, fn) => { fn(); checks += 1; console.log(`ok ${checks} - ${name}`); };
const runtime=read('functions/src/partnerOnboardingRuntime.ts'), index=read('functions/src/index.ts'), app=read('src/App.tsx'), journey=read('src/components/B2B/PartnerApplicationJourney.tsx'), copyModule=read('src/i18n/partner/applicantJourney.ts'), admin=read('src/components/admin/v2/V2PartnerApplications.tsx'), service=read('src/components/B2B/partnerApplicationService.ts'), firestore=read('partner-onboarding.firestore.rules'), storage=read('partner-onboarding.storage.rules');
// Proportional, not a frozen count: a new callable must ALSO enforce App Check, and pinning
// the number just meant the next one silently changed the expected total.
test('every onboarding callable enforces App Check',()=>{const calls=(runtime.match(/onCall\(/g)||[]).length,guarded=(runtime.match(/enforceAppCheck: true/g)||[]).length;assert.ok(calls>0,'no callables found');assert.equal(guarded,calls,`${calls-guarded} callable(s) do not enforce App Check`);});
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
// The eight-locale set now comes from the canonical source instead of a literal in the
// component; the copy module itself must carry every locale, which is what a partner actually
// experiences.
test('applicant journey copy covers the canonical eight locales',()=>{
  assert.match(journey,/applicantJourneyCopy/);
  assert.match(journey,/APPLICANT_JOURNEY_LOCALES/);
  assert.match(copyModule,/from '\.\.\/locales\.ts'/);
  for(const locale of ['en','th','ko','ja','zh','es','fr','de']) assert.match(copyModule,new RegExp(`const ${locale}: ApplicantJourneyCopy`),`missing ${locale}`);
  assert.match(copyModule,/Record<CanonicalLocale, ApplicantJourneyCopy>/,'the record must be exhaustive so a missing locale is a type error');
});
test('applicant can supply an authorized representative and proportionate evidence',()=>{
  assert.match(journey,/representativeName/);
  assert.match(journey,/authorityConfirm/);
  assert.match(journey,/representationBasis/);
  assert.match(journey,/EVIDENCE_KIND_KEYS/,'a document checklist needs typed document kinds');
  assert.match(journey,/checklist\?\.missing/,'the server checklist drives what is still needed');
  assert.doesNotMatch(journey,/verificationStatus:\s*['"]verified['"]/, 'the client must never set its own verification status');
});
test('applicant accepts the exact agreement version and digest',()=>{
  assert.match(journey,/agreement\?\.version/);
  assert.match(journey,/agreement\?\.digest/);
  assert.match(journey,/acceptAgreement/);
  assert.match(service,/getPartnerAgreementV2/);
});
test('review-before-submit and status/history are real surfaces',()=>{
  for(const marker of ['reviewHeading','submitButton','statusHeading','historyHeading','messagesHeading']) assert.match(journey,new RegExp(marker));
});
test('no raw internal error code reaches the applicant',()=>{
  assert.match(journey,/humanError/);
  // Every branch of the failure mapper resolves to localized copy.
  assert.doesNotMatch(journey,/setNotice\(\{tone: "alert", text: String\(/);
});
test('Admin can decide documents and record contract approval',()=>{
  assert.match(service,/reviewPartnerApplicationEvidenceV2/);
  assert.match(service,/approvePartnerContractV2/);
  assert.match(admin,/reviewEvidence/);
  assert.match(admin,/approveContract/);
});
test('the applicant journey renders inside the zone landmark, not a second one',()=>assert.doesNotMatch(journey,/<main/));
test('Thai staff copy',()=>assert.match(admin,/ตรวจสอบการสมัครพันธมิตร/));
test('loading and error semantics',()=>{assert.match(journey,/role="status"/);assert.match(journey,/role="alert"/);});
test('restart server load',()=>assert.match(journey,/partnerApplicationService\.load/));
test('two way support',()=>{assert.match(runtime,/sendPartnerSupportMessageV2/);assert.match(runtime,/sendAdminPartnerSupportMessageV2/);});
test('Marketing Library reused',()=>assert.match(runtime,/marketing_assets/));
test('direct database access denied',()=>{assert.match(firestore,/allow read, write: if false/);assert.match(storage,/allow read, write: if false/);});
test('no mock success path',()=>{assert.doesNotMatch(service,/mock|fixture/i);assert.doesNotMatch(journey,/setTimeout/);});
console.log(`partner onboarding verifier: ${checks} checks passed.`);
