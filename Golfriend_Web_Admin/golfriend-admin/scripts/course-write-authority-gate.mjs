import { readFileSync } from 'node:fs';

const seeder = readFileSync(new URL('../src/components/CourseSeeder.tsx', import.meta.url), 'utf8');
const functions = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');

function must(condition, message) {
  if (!condition) { console.error(`  ✗ ${message}`); process.exitCode = 1; }
  else console.log(`  ✓ ${message}`);
}

must(!/(?:setDoc|updateDoc|addDoc|deleteDoc)\s*\(\s*(?:doc|collection)\(\s*db\s*,\s*['"]courses['"]/.test(seeder),
  'CourseSeeder contains no direct course writes');
must(/httpsCallable\(getFunctions\(\), ['"]setManualCourseCoordinates['"]\)/.test(seeder),
  'manual correction routes through its trusted callable');
must(/export const setManualCourseCoordinates = onCall/.test(functions),
  'manual correction callable is exported');
const manualBody = functions.split('export const setManualCourseCoordinates = onCall')[1]?.split('// ==========================================')[0] || '';
must(/isActiveStaff\(/.test(manualBody) && /admin_users/.test(manualBody),
  'manual correction derives active staff authority server-side');
must(/gpsSource: 'manual'/.test(manualBody) && /manualLock: true/.test(manualBody) && /trusted: true/.test(manualBody),
  'manual correction locks and identifies trusted GPS provenance');
must(/course_sync_audit/.test(manualBody), 'manual correction writes an audit record');
for (const handler of ['healBrokenVault', 'executeMassRescue', 'fetchLiveCourse']) {
  const body = seeder.split(`const ${handler} = async () => {`)[1]?.split('\n  };')[0] || '';
  const stop = body.indexOf('return;');
  const providerFetch = body.search(/fetch\s*\(/);
  must(stop >= 0 && (providerFetch < 0 || stop < providerFetch),
    `${handler} fails closed before any client provider request`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('\n✅ course-write authority gate passed.');
