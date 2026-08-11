import { readFileSync } from 'node:fs';

const seeder = readFileSync(new URL('../src/components/CourseSeeder.tsx', import.meta.url), 'utf8');
const functions = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
const previewCore = readFileSync(new URL('../functions/src/courseSyncPreview.ts', import.meta.url), 'utf8');
const precommission = readFileSync(new URL('../docs/PRECOMMISSION_SEED_AND_SMOKE.md', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../AUTHORITY_MANIFEST.md', import.meta.url), 'utf8');

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
must(/runSyncCoursesFromProviderPreview\('preview'/.test(functions),
  'syncCoursesFromProvider routes preview decisions through the preview-only seam');
must(/mode: 'preview'/.test(previewCore) && /productionWrites: 0/.test(previewCore) && !/firebase|fetch\s*\(/i.test(previewCore),
  'synthetic preview seam is preview-only with no Firebase/network write surface');
must(/projectId\.startsWith\('demo-'\)/.test(previewCore) && /localhost\|127\\\.0\\\.0\\\.1/.test(previewCore),
  'synthetic harness fails closed outside demo projects and loopback emulator hosts');
must(!/syncCoursesFromProvider[^\n]*legacy|callerEmail\s*===\s*['"]admin@golfriend\.co['"]/i.test(precommission),
  'precommission guidance contains no legacy email bypass');
must(/setManualCourseCoordinates/.test(precommission) && /server-owned `admin_users\/\{uid\}`/.test(precommission),
  'precommission guidance names the current server-owned staff authority');
must(/setManualCourseCoordinates/.test(manifest) && /clients have no direct write path/.test(manifest),
  'authority manifest assigns manual course correction to the trusted callable');
for (const handler of ['healBrokenVault', 'executeMassRescue', 'fetchLiveCourse']) {
  const body = seeder.split(`const ${handler} = async () => {`)[1]?.split('\n  };')[0] || '';
  const stop = body.indexOf('return;');
  const providerFetch = body.search(/fetch\s*\(/);
  must(stop >= 0 && (providerFetch < 0 || stop < providerFetch),
    `${handler} fails closed before any client provider request`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('\n✅ course-write authority gate passed.');
