import {readDeployment,readRoles} from './course-acquisition-deployment.mjs';
import {readConfig} from './course-acquisition-config.mjs';
import {verifyArtifacts} from './verify-course-acquisition-artifacts.mjs';
const actions=['prepare','deploy','verify','disable','rollback','rotate-key','reduce-quota'],action=process.argv[2],template=process.argv.includes('--template');
if(!actions.includes(action))throw Error('ACTION_INVALID');
const config=readConfig(undefined,{allowPlaceholders:template}),deployment=readDeployment(undefined,{allowPlaceholders:template}),roles=readRoles(undefined,{allowPlaceholders:template});
if(action!=='prepare'&&template)throw Error('PLACEHOLDERS_FORBIDDEN_FOR_ACTION');
if(!template)verifyArtifacts(deployment);
const p=deployment.projectId,r=config.functions.region,callables=['getCourseAcquisitionDashboard','previewCourseAcquisitionPlan','acquireCourseCandidates','decideCourseCandidate','publishCourseCandidate','submitCourseCorrectionRequest','approveCourseQuotaOverride','reconcileExpiredCourseReservation'],say=x=>console.log(x);
say('# DRY-RUN COMMAND RENDER ONLY. Nothing below was executed.');
if(action==='prepare'){
  say(`node scripts/course-acquisition-config.mjs commissioning/course-acquisition.config.json${template?' --template':''}`);
  say(`node scripts/verify-integrated-course-acquisition-rules.mjs "${deployment.integratedRules.path}"`);
  say('node scripts/render-course-acquisition-quota.mjs commissioning/course-acquisition.config.json <UTC_DATE>');
  say('node scripts/render-course-acquisition-quota.mjs commissioning/course-acquisition.config.json <UTC_DATE> --future');
  say(`gcloud secrets describe GOLF_API_KEY --project ${p}`);
}
if(action==='deploy'){
  say(`firebase deploy --project ${p} --only firestore:rules --config "${deployment.integratedRules.firebaseConfig}"`);
  say(`firebase deploy --project ${p} --only ${callables.map(x=>`functions:${x}`).join(',')} --config "${deployment.functions.sourcePath}/firebase.json"`);
}
if(action==='verify'){
  for(const fn of [...new Set([...callables,...deployment.sharedSecretConsumers])])say(`gcloud functions describe ${fn} --region ${r} --project ${p} --format=json`);
  say(`gcloud secrets describe GOLF_API_KEY --project ${p} --format=json`);
  say(`node scripts/verify-integrated-course-acquisition-rules.mjs "${deployment.integratedRules.path}"`);
  say(`# With an operator-provided short-lived App Check token and ID token: POST getCourseAcquisitionDashboard with {} and previewCourseAcquisitionPlan with {"coverage":[],"manual":[]}. Never call acquireCourseCandidates as smoke.`);
  say('# Verify quota document enabled=false by an approved read-only operator console or audited server read.');
}
if(action==='disable'){
  say('# Set current golf_api_quota/YYYY-MM.enabled=false through the approved operator transaction; preserve all evidence.');
  say('# Revoke course_acquisition_operator and course_quota_override_approver assignments.');
}
if(action==='rollback'){
  say(`firebase deploy --project ${p} --only firestore:rules --config "${deployment.rollbackRules.firebaseConfig}"`);
  say(`firebase deploy --project ${p} --only ${callables.map(x=>`functions:${x}`).join(',')} --config "${deployment.functions.priorSourcePath}/firebase.json"`);
  say(`gcloud secrets versions enable ${deployment.secretVersions.previous} --secret GOLF_API_KEY --project ${p}`);
  say('# Re-run verify; preserve quota, candidates, reviews, attempts, receipts and audit evidence.');
}
if(action==='rotate-key'){
  say('# First render and execute disable under the incident/security owner.');
  say(`gcloud secrets versions add GOLF_API_KEY --project ${p} --data-file=-`);
  say(`firebase deploy --project ${p} --only ${deployment.sharedSecretConsumers.map(x=>`functions:${x}`).join(',')} --config "${deployment.functions.sourcePath}/firebase.json"`);
  for(const fn of deployment.sharedSecretConsumers)say(`gcloud functions describe ${fn} --region ${r} --project ${p} --format=json`);
  say(`gcloud secrets versions disable ${deployment.secretVersions.previous} --secret GOLF_API_KEY --project ${p}`);
  say(`gcloud secrets versions enable ${deployment.secretVersions.previous} --secret GOLF_API_KEY --project ${p}`);
  say(`firebase deploy --project ${p} --only ${deployment.sharedSecretConsumers.map(x=>`functions:${x}`).join(',')} --config "${deployment.functions.priorSourcePath}/firebase.json"`);
}
if(action==='reduce-quota'){
  say('node scripts/render-course-acquisition-quota.mjs commissioning/course-acquisition.config.json <NEXT_UTC_MONTH_DATE> --future');
  say('# Keep disabled; verify reserved+completed+failed <= future budget minus reserve before an approved write. Never erase counters.');
}
void roles;
