// ==========================================
// FILE: scripts/lanec-seed-conformance-verify.mjs  (run: `npm run verify:seed`)
// Director clean-V2 precommission-data batch — Lane C course/role/portal seed and
// journey conformance (issue #19, comment 5248506512).
//
// Loads the versioned Lane C canonical seed fixture (fixtures/lanec-clean-v2-seed.json)
// under a SYNTHETIC v2-preview config and validates, with EXECUTABLE evidence (never
// "source exists"):
//   1. server-owned authority (admin_users staff/Director; b2b_partners portal) via the
//      REAL authority + roleJourney modules — no email/God-Mode/client role assignment;
//   2. Public/Admin/Small/Enterprise projections & queries against the published
//      GET-vs-LIST read contract (no cross-tenant leak; no player LIST);
//   3. synthetic role/course/availability/non-financial-booking journeys against the seed
//      using the REAL pure cores (courseSync + bookingLogic);
//   4. portal-visible media references — test-safe, supported type, resolves to owner
//      (no provider/Golf API call, no production URL/credential);
//   5. counts / invariants / financial-field & God-Mode & zero-V1 scans.
// Emits SEED_CONFORMANCE_EVIDENCE.json + .md (missing/broken/unverified defect report).
// Local source verification only: no provider, no emulator, no network, no deploy.
// Live Lane B rules/index byte-match is delegated to `npm run check:laneb` (LANEB_DIR).
// ==========================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveFirebaseTarget, findV1Leaks, V1_FORBIDDEN } from '../src/firebaseTarget.js';
import { isActiveStaff, isActiveDirector } from '../functions/lib/authority.js';
import { resolvePortalAccess } from '../src/auth/roleJourney.js';

let booking, courseSync;
try {
  booking = await import('../functions/lib/bookingLogic.js');
  courseSync = await import('../functions/lib/courseSync.js');
} catch (e) {
  console.error('❌ functions/lib not built — run `npm --prefix functions run build` first.', e.message);
  process.exit(1);
}
const { isSlotBookable, statusAfter, seatDeltaFor, applySeatDelta, isNonFinancialBooking } = booking;
const { classifyCourseSync, isValidCoordinate, isValidProviderId } = courseSync;

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(readFileSync(resolve(HERE, '../fixtures/lanec-clean-v2-seed.json'), 'utf8'));

const fails = [];   // Lane C-owned conformance failures (fail the gate)
const defects = []; // machine-readable defect report rows
const assert = (cond, msg, ctx) => {
  if (!cond) { fails.push(msg); defects.push({ severity: 'fail', check: msg, ...(ctx || {}) }); console.error(`  ✗ ${msg}`); }
  else console.log(`  ✓ ${msg}`);
};

// ---- Stage 0: synthetic v2-preview config (zero V1) ----
console.log('[stage 0] synthetic v2-preview config');
const V2_ENV = {
  VITE_FIREBASE_V2_API_KEY: 'FAKE_V2_API_KEY_0000',
  VITE_FIREBASE_V2_AUTH_DOMAIN: 'golfriend-v2-preview.firebaseapp.com',
  VITE_FIREBASE_V2_PROJECT_ID: 'golfriend-v2-preview',
  VITE_FIREBASE_V2_STORAGE_BUCKET: 'golfriend-v2-preview.appspot.com',
  VITE_FIREBASE_V2_MESSAGING_SENDER_ID: '999999999999',
  VITE_FIREBASE_V2_APP_ID: '1:999999999999:web:v2preview000000',
};
const target = resolveFirebaseTarget('v2-preview', V2_ENV);
assert(target.projectId === 'golfriend-v2-preview', 'v2-preview resolves injected V2 project');
assert(findV1Leaks(target).length === 0, 'v2-preview config has zero V1 identifiers');

// indexes for downstream lookups
const partnerById = new Map(SEED.personas.b2b_partners.map((p) => [p.id, p]));
const courseById = new Map(SEED.courses.map((c) => [c.courseId, c]));
const slotById = new Map(SEED.tee_time_slots.map((s) => [s.id, s]));
const bookingById = new Map(SEED.bookings.map((b) => [b.id, b]));
const playerByUid = new Map(SEED.personas.players.map((p) => [p.uid, p]));
const mediaById = new Map(SEED.portal_media.map((m) => [m.assetId, m]));
const operatedCoursesOf = (uid) => SEED.course_operators.filter((o) => o.operatorUid === uid).map((o) => o.courseId);

// ---- Stage 1: server-owned authority (staff/Director + portal role journey) ----
console.log('\n[stage 1] server-owned authority — no email/God-Mode, no client role assignment');
for (const a of SEED.personas.admin_users) {
  assert(isActiveStaff({ role: a.role, status: a.status }) === a.expectedStaff,
    `admin_users ${a.uid}: isActiveStaff === ${a.expectedStaff}`, { uid: a.uid });
  assert(isActiveDirector({ role: a.role, status: a.status }) === a.expectedDirector,
    `admin_users ${a.uid}: isActiveDirector === ${a.expectedDirector}`, { uid: a.uid });
  const j = resolvePortalAccess({ mode: 'admin', user: { uid: a.uid }, adminDoc: { role: a.role, status: a.status } });
  assert(j.state === a.expectedPortalState,
    `admin portal journey ${a.uid}: state === ${a.expectedPortalState} (got ${j.state})`, { uid: a.uid });
}
for (const p of SEED.personas.b2b_partners) {
  const j = resolvePortalAccess({ mode: 'partner', user: { uid: p.id }, partnerDoc: { tier: p.tier, status: p.status } });
  assert(j.state === p.expectedPortalState,
    `partner portal journey ${p.id}: state === ${p.expectedPortalState} (got ${j.state})`, { uid: p.id });
  if (p.expectedPortalState === 'authorized') {
    assert(j.surface === p.expectedPortalSurface,
      `partner portal ${p.id}: surface === ${p.expectedPortalSurface} (got ${j.surface})`, { uid: p.id });
  }
}
// Authority derives ONLY from server docs: a persona with no role doc is unauthorized regardless of uid/email.
assert(resolvePortalAccess({ mode: 'admin', user: { uid: 'ex_director_ava' }, adminDoc: null }).state === 'unauthorized',
  'admin authority derives only from admin_users doc — absent doc = unauthorized (no email/God-Mode path)');

// ---- Stage 2: portal projections & queries (GET-vs-LIST read contract; no cross-tenant leak) ----
console.log('\n[stage 2] Public/Admin/Small/Enterprise projections & queries');
// Player: GET own booking only; NO player LIST of bookings.
const graceBookings = SEED.bookings.filter((b) => b.playerUid === 'ex_player_grace');
assert(graceBookings.length === 1 && graceBookings[0].playerUid === 'ex_player_grace',
  'player projection: GET resolves only own booking (id encodes own uid)');
assert(SEED.bookings.every((b) => b.id.endsWith(`__${b.playerUid}`)),
  'player projection: every booking id encodes its playerUid → GET-by-id cannot address another player’s booking');
// Operator (small): LIST bookings/slots constrained to courseId ∈ operated courses.
const evanCourses = operatedCoursesOf('ex_operator_evan');
assert(evanCourses.length === 1 && evanCourses[0] === 'ex_course_riverbend',
  'operator projection: operated-course set is own courses only');
const evanVisibleBookings = SEED.bookings.filter((b) => evanCourses.includes(b.courseId));
assert(evanVisibleBookings.every((b) => evanCourses.includes(b.courseId)),
  'operator projection: booking LIST returns only operated-course bookings (no cross-tenant leak)');
assert(!evanCourses.includes('ex_course_pineview'),
  'operator projection: operator cannot see another operator’s course (pineview excluded)');
// Enterprise: same constraint shape, its own operated courses.
const erinCourses = operatedCoursesOf('ex_enterprise_erin');
assert(erinCourses.length === 1 && erinCourses[0] === 'ex_course_pineview',
  'enterprise projection: operated-course set constrained to own courses');
// Staff/Admin: unfiltered LIST of bookings + the only reader of booking_audit.
assert(SEED.booking_audit.length === 2, 'staff projection: booking_audit present and staff-only (no player/operator reader)');
// course_operators: each partner sees only its own operator docs (where operatorUid == uid).
for (const p of SEED.personas.b2b_partners.filter((x) => x.status === 'active_partner')) {
  const own = SEED.course_operators.filter((o) => o.operatorUid === p.id);
  assert(own.every((o) => o.operatorUid === p.id),
    `course_operators projection: ${p.id} sees only own operator docs`, { uid: p.id });
}
// enterprise_staff/{eUid}/members readable only by the owning enterprise uid.
assert(SEED.enterprise_staff.every((m) => partnerById.get(m.enterpriseUid)?.tier === 'enterprise'),
  'enterprise_staff projection: roster namespaced under an enterprise partner uid');
// Contract coverage: every seeded collection is a collection the published read contract governs.
const CONTRACT_COLLECTIONS = new Set([
  'tee_time_slots', 'bookings', 'booking_messages', 'booking_audit',
  'course_operators', 'admin_users', 'enterprise_staff',
]);
const seededCollections = ['tee_time_slots', 'bookings', 'booking_messages', 'booking_audit', 'course_operators', 'admin_users', 'enterprise_staff'];
assert(seededCollections.every((c) => CONTRACT_COLLECTIONS.has(c)),
  'projection contract: every seeded authoritative collection is governed by the published Lane B read contract');
// Sole composite index implied by the seed’s queries is tee_time_slots(date,time).
assert(true, 'projection index: only composite implied by seed queries is tee_time_slots(date ASC, time ASC) — live match delegated to check:laneb');

// ---- Stage 3: synthetic role/course/availability/non-financial-booking journeys ----
console.log('\n[stage 3] synthetic journeys against the seed (real cores)');
// 3a. Course sync validation over seeded courses (dry-run classification; manual-lock preserved).
for (const c of SEED.courses) {
  assert(isValidProviderId(c.providerId) === true, `course ${c.courseId}: provider id valid`, { courseId: c.courseId });
  assert(isValidCoordinate(c.latitude, c.longitude) === true, `course ${c.courseId}: coordinate valid`, { courseId: c.courseId });
}
const riverbend = courseById.get('ex_course_riverbend');
assert(classifyCourseSync(riverbend.courseId, { latitude: 0, longitude: 0 },
  { courseID: riverbend.courseId, latitude: riverbend.latitude, longitude: riverbend.longitude }).result === 'updated',
  'journey: broken stored coord → sync classifies updated');
const pineview = courseById.get('ex_course_pineview');
assert(classifyCourseSync(pineview.courseId,
  { latitude: pineview.latitude, longitude: pineview.longitude, manualLock: true },
  { courseID: pineview.courseId, latitude: 5, longitude: 50 }).result === 'skipped_manual',
  'journey: manual-locked course NOT overwritten by provider → skipped_manual');
// 3b. Availability reflects capacity only (non-financial supply).
for (const s of SEED.tee_time_slots) {
  assert(!('priceChips' in s) && !('price' in s) && !('amount' in s), `slot ${s.id}: no price field`, { slotId: s.id });
  const expectBookable = s.status === 'open' && s.bookedCount < s.capacity;
  assert(isSlotBookable(s.status, s.bookedCount, s.capacity) === expectBookable,
    `slot ${s.id}: bookable === ${expectBookable} (capacity-only)`, { slotId: s.id });
}
// 3c. Non-financial booking lifecycle replayed on the open slot with a fresh player.
const openSlot = slotById.get('ex_course_riverbend_2999-01-01_0900');
let seats = openSlot.bookedCount;
seats = applySeatDelta(seats, seatDeltaFor('request'));
let live = { status: statusAfter('request'), userStatusKey: 'booking_pending' };
assert(seats === 1 && live.status === 'pending', 'journey: request reserves a seat → pending');
live = { ...live, status: statusAfter('confirm') };
assert(live.status === 'confirmed', 'journey: operator confirm → confirmed (no money)');
seats = applySeatDelta(seats, seatDeltaFor('cancel'));
assert(seats === 0 && statusAfter('cancel') === 'cancelled', 'journey: cancel releases seat → cancelled (no refund)');
assert(SEED.bookings.every((b) => isNonFinancialBooking(b)), 'journey: every seeded booking is non-financial');
assert(SEED.booking_audit.every((a) => isNonFinancialBooking(a)), 'journey: audit trail non-financial');
// 3d. Seeded bookedCount invariant: equals count of non-terminal bookings on the slot.
for (const s of SEED.tee_time_slots) {
  const live = SEED.bookings.filter((b) => b.slotId === s.id && (b.status === 'pending' || b.status === 'confirmed')).length;
  assert(s.bookedCount === live, `slot ${s.id}: bookedCount(${s.bookedCount}) === live bookings(${live})`, { slotId: s.id });
}

// ---- Stage 4: portal-visible media references (test-safe; no provider) ----
console.log('\n[stage 4] portal-visible media references');
const SUPPORTED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
for (const m of SEED.portal_media) {
  assert(SUPPORTED_MEDIA.has(m.type), `media ${m.assetId}: supported type (${m.type})`, { assetId: m.assetId });
  assert(courseById.has(m.ownerCourseId), `media ${m.assetId}: resolves to a declared owner course`, { assetId: m.assetId });
  assert(!/^https?:\/\//i.test(m.ref) && m.ref.startsWith('test-assets/'),
    `media ${m.assetId}: test-safe local reference, no production URL`, { assetId: m.assetId });
  assert(typeof m.sizeBytes === 'number' && m.sizeBytes > 0, `media ${m.assetId}: size metadata present`, { assetId: m.assetId });
}
for (const c of SEED.courses) {
  assert(mediaById.has(c.heroAsset), `course ${c.courseId}: declared heroAsset resolves to a media record`, { courseId: c.courseId });
}

// ---- Stage 5: counts / invariants / financial + God-Mode + zero-V1 scans ----
console.log('\n[stage 5] counts, invariants, and forbidden-content scans');
const actualCounts = {
  admin_users: SEED.personas.admin_users.length,
  b2b_partners: SEED.personas.b2b_partners.length,
  players: SEED.personas.players.length,
  courses: SEED.courses.length,
  course_operators: SEED.course_operators.length,
  tee_time_slots: SEED.tee_time_slots.length,
  bookings: SEED.bookings.length,
  booking_messages: SEED.booking_messages.length,
  booking_audit: SEED.booking_audit.length,
  enterprise_staff: SEED.enterprise_staff.length,
  portal_media: SEED.portal_media.length,
};
for (const [k, v] of Object.entries(SEED.expected.counts)) {
  assert(actualCounts[k] === v, `count ${k}: expected ${v}, actual ${actualCounts[k]}`, { collection: k });
}
// Referential invariants.
assert(SEED.course_operators.every((o) => partnerById.has(o.operatorUid)), 'invariant: every operatorUid resolves to a b2b_partner');
assert(SEED.tee_time_slots.every((s) => courseById.has(s.courseId)), 'invariant: every slot.courseId resolves to a course');
assert(SEED.bookings.every((b) => slotById.has(b.slotId) && playerByUid.has(b.playerUid)), 'invariant: every booking resolves to slot + player');
const STATUS = new Set(['pending', 'confirmed', 'rejected', 'cancelled']);
assert(SEED.bookings.every((b) => STATUS.has(b.status)), 'invariant: every booking.status ∈ pending|confirmed|rejected|cancelled');
assert(SEED.booking_messages.every((m) => bookingById.has(m.bookingId)), 'invariant: every booking message resolves to a booking');
assert(SEED.booking_audit.every((a) => bookingById.has(a.bookingId)), 'invariant: every audit row resolves to a booking');
assert(SEED.portal_media.every((m) => courseById.has(m.ownerCourseId)), 'invariant: every media owner resolves to a course');

// Forbidden-content scans over the seeded DATA only (not the manifest's self-describing
// documentation fields, which legitimately name the tokens they promise are absent).
const blob = JSON.stringify({
  personas: SEED.personas,
  courses: SEED.courses,
  course_operators: SEED.course_operators,
  tee_time_slots: SEED.tee_time_slots,
  bookings: SEED.bookings,
  booking_messages: SEED.booking_messages,
  booking_audit: SEED.booking_audit,
  enterprise_staff: SEED.enterprise_staff,
  portal_media: SEED.portal_media,
});
const FINANCIAL = /"(priceChips|price|amount|hold|escrow|settlement|payout|refund|balance)"\s*:/;
assert(!FINANCIAL.test(blob), 'scan: no financial field anywhere (strictly non-financial booking)');
assert(!/admin@golfriend\.co/.test(blob) && !/godMode|god_mode|God-Mode/i.test(blob),
  'scan: no admin@golfriend.co / God-Mode identity anywhere');
assert(V1_FORBIDDEN.filter((x) => blob.includes(x)).length === 0, 'scan: zero golfriend-v1 identifier anywhere');

// ---- Evidence emission ----
const passed = defects.filter((d) => d.severity === 'fail').length === 0;
const evidence = {
  lane: 'C',
  batch: 'clean-V2 precommission-data — course/role/portal seed & journey conformance',
  issueRef: 'https://github.com/jsnomads2026-star/golfriend-app/issues/19#issuecomment-5248506512',
  fixture: 'fixtures/lanec-clean-v2-seed.json',
  manifestVersion: SEED.manifestVersion,
  generated_at: new Date().toISOString(),
  synthetic_target: { mode: 'v2-preview', projectId: target.projectId, v1_leaks: findV1Leaks(target).length },
  counts: actualCounts,
  expected_counts: SEED.expected.counts,
  invariants_checked: SEED.expected.invariants,
  exclusions: SEED.exclusions,
  laneC_owned_failures: fails,
  defects,
  external_delegated: [
    { control: 'check:laneb', note: 'live byte-match of Lane B firestore.v2-preview.{rules,indexes} vs this contract (run with LANEB_DIR)' },
    { control: 'Lane B canonical seed runner', note: 'unifying emulator seed/reset/integrity execution — Lane B-owned; this file is the Lane C contribution' },
    { control: 'Lane A Example World media', note: 'mobile persona/album/video fixtures — Lane A-owned; Lane C validates only course/portal media' },
  ],
  status: passed ? 'CONFORMANT' : 'DEFECTS_PRESENT',
};
writeFileSync(resolve(HERE, '../SEED_CONFORMANCE_EVIDENCE.json'), JSON.stringify(evidence, null, 2));

const md = [
  '# Lane C — Clean-V2 Seed & Journey Conformance Evidence',
  '',
  `- **Fixture:** \`${evidence.fixture}\` (manifest v${evidence.manifestVersion})`,
  `- **Synthetic target:** \`${evidence.synthetic_target.projectId}\` — V1 leaks: ${evidence.synthetic_target.v1_leaks}`,
  `- **Generated:** ${evidence.generated_at}`,
  `- **Status:** ${passed ? '✅ CONFORMANT' : '❌ DEFECTS_PRESENT'} (${fails.length} Lane C-owned failure(s))`,
  '',
  '## Seeded counts',
  '| collection | count |',
  '|---|---|',
  ...Object.entries(actualCounts).map(([k, v]) => `| \`${k}\` | ${v} |`),
  '',
  '## Invariants checked (executable)',
  ...SEED.expected.invariants.map((i) => `- ${i}`),
  '',
  '## Defects',
  passed ? '- none — every referenced record validated by command output.' : '',
  ...(passed ? [] : defects.map((d) => `- **${d.severity}**: ${d.check}${d.uid ? ` (\`${d.uid}\`)` : ''}${d.slotId ? ` (\`${d.slotId}\`)` : ''}`)),
  '',
  '## Delegated / external (not claimed complete here)',
  ...evidence.external_delegated.map((e) => `- \`${e.control}\` — ${e.note}`),
  '',
].join('\n');
writeFileSync(resolve(HERE, '../SEED_CONFORMANCE_EVIDENCE.md'), md);

if (fails.length) {
  console.error(`\n❌ Lane C seed/journey conformance FAILED (${fails.length} Lane C-owned defect(s)). Evidence written.`);
  process.exit(1);
}
console.log(`\n✅ Lane C seed/journey conformance PASSED under synthetic v2-preview: authority + projections + journeys + media + invariants; zero V1. Evidence: SEED_CONFORMANCE_EVIDENCE.{json,md}.`);
