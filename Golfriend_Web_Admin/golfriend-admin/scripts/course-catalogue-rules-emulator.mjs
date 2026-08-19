import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';

const projectId='demo-golfriend-v2-course-catalogue';
const testEnv=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../enterprise-authority.firestore.rules',import.meta.url),'utf8')}});
try{
  await testEnv.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'courses','course-1'),{schema:'golfriend.v2.course.v2',courseID:'course-1'});
    await setDoc(doc(context.firestore(),'golf_api_quota','2026-08'),{configuredBudget:500});
  });
  const signedIn=testEnv.authenticatedContext('golfer-1').firestore();
  const anonymous=testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(signedIn,'courses','course-1')));
  await assertFails(getDoc(doc(anonymous,'courses','course-1')));
  await assertFails(setDoc(doc(signedIn,'courses','course-1'),{name:'tamper'},{merge:true}));
  await assertFails(getDoc(doc(signedIn,'golf_api_quota','2026-08')));
  assert.ok(true);
  console.log('Course catalogue rules emulator checks completed.');
}finally{await testEnv.cleanup();}
