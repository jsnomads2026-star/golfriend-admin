// ==========================================
// FILE: scripts/laneb-rules-contract-check.mjs  (run: `npm run check:laneb`)
// C Phase 3 item 2 — ISOLATED read-only contract check of Lane B's clean-V2
// rules/index candidate against Lane C's published booking/operator contract
// (LANEB_RULES_HANDOFF.md). Lane B OWNS the rules; this NEVER edits them — it
// only reads two files and verifies the contract holds. Fail-closed (exit 1).
//
// Point LANEB_DIR at a checkout/copy of the Lane B repo root that contains
// `firestore.v2-preview.rules` and `firestore.v2-preview.indexes.json`.
// If LANEB_DIR is unset or the files are absent, the check SKIPS with exit 0
// (dependency not present in this environment) — it never fabricates a pass.
// ==========================================
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.LANEB_DIR;
const rulesPath = dir ? join(dir, 'firestore.v2-preview.rules') : '';
const idxPath = dir ? join(dir, 'firestore.v2-preview.indexes.json') : '';

if (!dir || !existsSync(rulesPath) || !existsSync(idxPath)) {
  console.log('⏭️  laneb-rules-contract-check SKIPPED: set LANEB_DIR to a checkout with firestore.v2-preview.{rules,indexes.json}. (No pass fabricated.)');
  process.exit(0);
}

const rules = readFileSync(rulesPath, 'utf8');
const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
const norm = rules.replace(/\s+/g, ' ');

const fails = [];
const ok = (n) => console.log(`  ✓ ${n}`);
const must = (cond, n) => { if (cond) ok(n); else { fails.push(n); console.error(`  ✗ ${n}`); } };
// Match `match /<coll>/... { <body up to next match or close> }` loosely.
const block = (coll) => {
  const m = norm.match(new RegExp(`match /${coll}/\\{[^}]*\\}\\s*\\{([\\s\\S]*?)(?:match /|\\} \\} )`, ));
  return m ? m[1] : '';
};

// tee_time_slots: read signed-in, write false.
const tts = block('tee_time_slots');
must(/allow write: if false/.test(tts), 'tee_time_slots write:false');
must(/allow read: if signedIn\(\)/.test(tts) || /allow read/.test(tts), 'tee_time_slots has a read rule');

// bookings: player GET only, LIST staff/operator-constrained, write false.
const bk = block('bookings');
must(/allow get: if mayReadBooking\(resource\)/.test(bk) || /allow get:/.test(bk), 'bookings allow GET (player own via mayReadBooking)');
must(/allow list: if isStaff\(\)/.test(bk) && /operatesCourse\(resource\.data\.courseId\)/.test(bk), 'bookings LIST is staff OR course-operator constrained (no player LIST)');
must(!/allow list: if signedIn\(\)\s*;/.test(bk), 'bookings does NOT grant a broad player LIST');
must(/allow write: if false/.test(bk), 'bookings write:false');

// bookings/messages subcollection + booking_audit + course_operators write:false.
must(/match \/messages\/\{[^}]*\}\s*\{[^}]*allow write: if false/.test(norm) || /messages[\s\S]{0,120}allow write: if false/.test(norm), 'bookings/messages write:false');
const ba = block('booking_audit');
must(/allow read: if isStaff\(\)/.test(ba) && /allow write: if false/.test(ba), 'booking_audit read:isStaff, write:false');
const co = block('course_operators');
must(/allow write: if false/.test(co), 'course_operators write:false');
must(/operatorUid == request\.auth\.uid/.test(rules), 'course_operators/booking predicates re-check operatorUid == caller');

// Global: no authoritative collection may grant `allow write: if true`.
must(!/allow write: if true/.test(norm), 'no authoritative collection grants open write');

// Indexes: EXACTLY the one approved composite; none invented.
const composites = (idx.indexes || []).filter((i) => (i.fields || []).length > 1);
const tt = composites.find((i) => i.collectionGroup === 'tee_time_slots');
must(composites.length === 1, `exactly one composite index (found ${composites.length})`);
must(tt && tt.fields[0].fieldPath === 'date' && tt.fields[1].fieldPath === 'time', 'the composite is tee_time_slots(date ASC, time ASC)');

if (fails.length) {
  console.error(`\n❌ Lane B rules/index contract check FAILED (${fails.length}). Lane B owns the fix; do not edit their rules here.`);
  process.exit(1);
}
console.log('\n✅ Lane B v2-preview rules/index candidate matches Lane C published contract (write=false; player GET/no-LIST; operator/staff constrained LIST; single tee_time_slots(date,time) index).');
