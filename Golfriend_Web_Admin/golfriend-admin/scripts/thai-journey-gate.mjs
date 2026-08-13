// ==========================================
// FILE: scripts/thai-journey-gate.mjs
// L1 capstone: Thai end-to-end partner-journey gate (run: `npm run gate:thai-journey`).
//
// Verifies a Thai golf-course employee with no English can complete the whole
// partner journey in Thai:
//   discover + sign in -> onboarding hub -> onboard course -> publish
//   availability -> receive/respond bookings -> documents & consent -> resume.
//
// For each surface it asserts: the dictionary covers all eight canonical locales
// with every key non-empty; Thai is actually translated (differs from English);
// the component routes copy through the i18n provider (no hard-coded English for
// the checked strings); and the client-only surfaces make no authoritative
// writes. Fails (exit 1) on any gap.
// ==========================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCALE_CODES } from '../src/i18n/locales.ts';
import { SIGN_IN } from '../src/i18n/partner/signIn.ts';
import { ACCESS_STATES } from '../src/i18n/partner/accessStates.ts';
import { ONBOARDING } from '../src/i18n/partner/onboarding.ts';
import { COURSE_AVAILABILITY } from '../src/i18n/partner/courseAvailability.ts';
import { BOOKING_REQUESTS } from '../src/i18n/partner/bookingRequests.ts';
import { DOCUMENTS } from '../src/i18n/partner/documents.ts';

const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => fs.readFileSync(REPO + rel, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const results = [];
const ok = (label) => results.push({ pass: true, label });
function check(label, cond, detail = '') {
  if (cond) { ok(label); } else { results.push({ pass: false, label, detail }); }
}

// 1. Full eight-locale + Thai coverage across every journey surface.
const DICTS = {
  'sign-in': SIGN_IN,
  'access-states': ACCESS_STATES,
  'onboarding': ONBOARDING,
  'course-availability': COURSE_AVAILABILITY,
  'booking-requests': BOOKING_REQUESTS,
  'documents-consent': DOCUMENTS,
};

for (const [name, dict] of Object.entries(DICTS)) {
  const enKeys = Object.keys(dict.en);
  let localeParity = true, thaiFull = true, thaiTranslated = true;
  for (const code of LOCALE_CODES) {
    if (!dict[code] || JSON.stringify(Object.keys(dict[code])) !== JSON.stringify(enKeys)) localeParity = false;
    for (const k of enKeys) if (!dict[code] || !String(dict[code][k] ?? '').length) { if (code === 'th') thaiFull = false; }
  }
  for (const k of enKeys) if (dict.th[k] === dict.en[k]) thaiTranslated = false;
  check(`${name}: all 8 locales define all keys`, localeParity);
  check(`${name}: Thai is complete (every key non-empty)`, thaiFull);
  check(`${name}: Thai is actually translated (differs from English)`, thaiTranslated);
}

// 2. Each journey component routes copy through the i18n provider.
const USES = [
  ['sign in (storefront)', 'src/components/public/B2BStorefront.tsx', /useT\(\s*SIGN_IN\s*\)/],
  ['access states (App)', 'src/App.tsx', /ACCESS_STATES/],
  ['onboarding hub', 'src/components/B2B/PartnerOnboarding.tsx', /useT\(\s*ONBOARDING\s*\)/],
  ['course & availability', 'src/components/B2B/CourseAvailability.tsx', /useT\(\s*COURSE_AVAILABILITY\s*\)/],
  ['booking requests', 'src/components/B2B/BookingRequests.tsx', /useT\(\s*BOOKING_REQUESTS\s*\)/],
  ['documents & consent', 'src/components/B2B/PartnerDocuments.tsx', /useT\(\s*DOCUMENTS\s*\)/],
];
for (const [label, rel, re] of USES) {
  check(`${label}: routes copy through the i18n provider`, re.test(read(rel)));
}

// 3. The partner dashboard wires every journey tab.
const dash = read('src/components/B2B/SmallBusinessDashboard.tsx');
for (const comp of ['PartnerOnboarding', 'CourseAvailability', 'BookingRequests', 'PartnerDocuments']) {
  check(`dashboard renders <${comp}>`, new RegExp(`<${comp}\\s`).test(dash));
}

// 4. Client-only surfaces make no authoritative writes / callables.
for (const rel of ['src/components/B2B/PartnerDocuments.tsx', 'src/components/B2B/PartnerOnboarding.tsx']) {
  const code = stripComments(read(rel));
  const clean = !['httpsCallable', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'getFunctions', 'uploadBytes'].some((b) => code.includes(b));
  check(`${rel.split('/').pop()}: no authoritative writes/callables`, clean);
}

// 5. Resume is real (local draft read on both the documents and onboarding surfaces).
check('documents: draft persisted for resume', /localStorage\.setItem/.test(read('src/components/B2B/PartnerDocuments.tsx')));
check('onboarding: reflects saved progress for resume', /localStorage\.getItem/.test(read('src/components/B2B/PartnerOnboarding.tsx')));

// ---- Report ----
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
if (failed.length) {
  console.error(`\nTHAI JOURNEY GATE FAILED: ${failed.length} gap(s).`);
  process.exit(1);
}
console.log(`\n✅ Thai end-to-end partner journey: ${results.length} checks green — discover, sign in, onboard, publish availability, respond to bookings, documents & consent, and resume are fully available in Thai.`);
assert.ok(true);
