import { execFileSync } from 'node:child_process';

const project='golfriend-v2-production-2ee34';
const appId='1:533338463502:web:8a45afed98abc0cdc38b5f';
const projectNumber='533338463502';
const firebase=process.platform==='win32'?'firebase.cmd':'firebase';
const npm=process.platform==='win32'?'npm.cmd':'npm';
const run=(command,args,options={})=>execFileSync(command,args,{shell:process.platform==='win32',...options});
let sdkConfigText;
try{sdkConfigText=run(firebase,['apps:sdkconfig','WEB',appId,'--project',project],{encoding:'utf8'});}catch(error){sdkConfigText=typeof error?.stdout==='string'?error.stdout:'';try{JSON.parse(sdkConfigText);}catch{throw error;}}
const config=JSON.parse(sdkConfigText);
const accessToken=run('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
const response=await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`,{headers:{authorization:`Bearer ${accessToken}`,'x-goog-user-project':project}});
if(!response.ok)throw Error(`V2_APP_CHECK_CONFIG_UNAVAILABLE:${response.status}`);
const appCheck=await response.json();
if(typeof appCheck.siteKey!=='string'||!appCheck.siteKey.trim())throw Error('V2_APP_CHECK_SITE_KEY_MISSING');
const env={...process.env,VITE_FIREBASE_PROJECT:'v2-preview',VITE_FIREBASE_V2_API_KEY:config.apiKey,VITE_FIREBASE_V2_AUTH_DOMAIN:config.authDomain,VITE_FIREBASE_V2_PROJECT_ID:config.projectId,VITE_FIREBASE_V2_STORAGE_BUCKET:config.storageBucket,VITE_FIREBASE_V2_MESSAGING_SENDER_ID:config.messagingSenderId,VITE_FIREBASE_V2_APP_ID:config.appId,VITE_FIREBASE_APPCHECK_SITE_KEY:appCheck.siteKey};
run(npm,['run','build'],{env,stdio:'inherit'});
run(process.execPath,['scripts/v2-admin-bundle-verify.mjs'],{env,stdio:'inherit',shell:false});
