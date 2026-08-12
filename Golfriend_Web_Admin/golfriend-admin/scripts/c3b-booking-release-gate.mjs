import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKING_RELEASE_CLASSIFICATIONS, BOOKING_RELEASE_LOCALES, BOOKING_RELEASE_PARENT_SHA, BOOKING_RELEASE_READINESS, BOOKING_RELEASE_READINESS_SCHEMA_ID, BOOKING_RELEASE_READINESS_VERSION, summarizeBookingReleaseReadiness } from '../src/components/admin/booking/bookingReleaseReadiness.js';
import { BOOKING_DATA_SCHEMA_ID, BOOKING_CALLABLE_SCHEMA_ID, BOOKING_REPORT_SCHEMA_ID, BOOKING_READINESS_SCHEMA_ID, CONTRACT_VERSION, BOOKING_READINESS_REGISTRY } from '../src/components/admin/booking/BookingCommissioning.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(APP, '..', '..');
const read = (path) => readFileSync(resolve(APP, path), 'utf8');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${REPO}`, '-C', REPO, ...args], { encoding: 'utf8' }).trim();
const results = [];
const check = (label, condition, detail = '') => results.push({ label, ok: Boolean(condition), detail });

const requiredFiles = [
  'src/components/admin/BookingOversight.tsx', 'src/components/admin/BookingAudit.tsx', 'src/components/admin/booking/BookingDetailPanel.tsx',
  'src/components/admin/booking/BookingMessageComposer.tsx', 'src/components/admin/booking/BookingClassifier.ts', 'src/components/admin/booking/BookingExceptionQueue.tsx',
  'src/components/admin/booking/BookingReport.ts', 'src/components/admin/booking/BookingReportView.tsx', 'src/components/admin/booking/BookingCommissioning.js',
  'src/components/admin/booking/BookingCommissioning.d.ts', 'src/components/admin/booking/BookingReadiness.tsx', 'scripts/c3a-booking-smoke.mjs',
  'scripts/c3a-booking-commissioning-gate.mjs', 'docs/LANEC_C3A_BOOKING_COMMISSIONING_HANDOFF.md', 'src/components/admin/booking/bookingReleaseReadiness.js',
  'src/components/admin/booking/bookingReleaseReadiness.d.ts', 'src/components/admin/booking/BookingReleaseSummary.tsx', 'scripts/c3b-booking-release-gate.mjs',
  'docs/LANEC_C3B_BOOKING_RELEASE_READINESS.md',
];
for (const file of requiredFiles) check(`inventory: ${file}`, existsSync(resolve(APP, file)));

const lineage = [
  ['acae63568781af1e8386cb95517ece371ff4e639', 'C2A'], ['943fc2799d918e34c6f9778107d78c118b37cdce', 'C2B'],
  ['327624d64c77a89b03a89f15ca4eb7d77c5bea67', 'C2B.1'], ['9d65e89b6a66f4c53c7aafc6b6513dce42e93fd1', 'C2C'],
  ['4285b08d51e7cc96f50de3985006559ec223276c', 'C2D'], ['6f194739f35e8a0cfb64e2d9ab567f846d52da41', 'C2E'], [BOOKING_RELEASE_PARENT_SHA, 'C3A'],
];
for (let i = 1; i < lineage.length; i += 1) check(`lineage ${lineage[i - 1][1]} → ${lineage[i][1]}`, git('rev-parse', `${lineage[i][0]}^`) === lineage[i - 1][0]);

const canonical = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
check('canonical release locale order', JSON.stringify(BOOKING_RELEASE_LOCALES) === JSON.stringify(canonical));
const localeOwners = ['src/components/admin/booking/BookingMessageComposer.tsx', 'src/components/admin/booking/BookingClassifier.ts', 'src/components/admin/booking/BookingReportView.tsx', 'src/components/admin/booking/BookingReadiness.tsx', 'src/components/admin/booking/BookingReleaseSummary.tsx'];
for (const file of localeOwners) check(`Arabic absent: ${file}`, !/(?:['"]ar['"]|\barabic\b)/i.test(read(file)));

const oversight = read('src/components/admin/BookingOversight.tsx');
const audit = read('src/components/admin/BookingAudit.tsx');
const panel = read('src/components/admin/booking/BookingDetailPanel.tsx');
const composer = read('src/components/admin/booking/BookingMessageComposer.tsx');
const classifier = read('src/components/admin/booking/BookingClassifier.ts');
const queue = read('src/components/admin/booking/BookingExceptionQueue.tsx');
const report = read('src/components/admin/booking/BookingReport.ts');
const reportView = read('src/components/admin/booking/BookingReportView.tsx');
check('Booking Oversight remains stream-based', /onSnapshot\s*\(/.test(oversight));
check('Booking Audit remains append-only/read-only', /onSnapshot\s*\(/.test(audit) && !/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(audit));
check('Detail focus-on-open', /closeRef\.current\?\.focus\(\)/.test(panel));
check('Detail focus trap', /querySelectorAll<HTMLElement>/.test(panel) && /e\.key !== 'Tab'/.test(panel));
check('Detail Escape close', /e\.key === 'Escape'[^\n]*onClose\(\)/.test(panel));
check('Detail restores prior focus', /previousFocusRef\.current\?\.focus\(\)/.test(panel));
check('Composer copy and export preserved', /navigator\.clipboard/.test(composer) && /\.download\s*=/.test(composer));
check('Composer callable-only send', /httpsCallable\([^\n]*'sendBookingMessage'/.test(composer) && !/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(composer));
check('Classifier deterministic strict stale boundary', /now - createdAtMs > STALE_THRESHOLD_MS/.test(classifier));
check('Operations Report remains pure', !/firebase|httpsCallable|fetch\s*\(/i.test(report) && /export function aggregate/.test(report));
check('Exception retry genuinely resubscribes', /\[retryCount\]/.test(queue) && /setRetryCount/.test(queue));
check('Report retry genuinely resubscribes', /\[retryCount\]/.test(reportView) && /setRetryCount/.test(reportView));

for (const [name, source] of Object.entries({ oversight, audit, panel, queue, reportView })) {
  const subscriptions = (source.match(/onSnapshot\s*\(/g) || []).length;
  const cleanups = (source.match(/return\s*\(\s*\)\s*=>\s*unsub\s*\(\s*\)/g) || []).length;
  check(`${name} subscriptions clean up`, subscriptions === cleanups, `${subscriptions} subscriptions, ${cleanups} cleanups`);
}
const laneCUI = [oversight, audit, panel, composer, queue, reportView, read('src/components/admin/booking/BookingReadiness.tsx'), read('src/components/admin/booking/BookingReleaseSummary.tsx')].join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('no direct Firestore writes in Lane C UI', !/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(laneCUI));
check('booking resolution remains server-authoritative', /httpsCallable\([^\n]*'adminResolveBooking'/.test(oversight));
check('automatic reminders unavailable', /data-c2c-send-unavailable/.test(queue));
check('JHCC transmission unavailable', /data-c2d-jhcc-unavailable/.test(reportView));
const logicOnly = report.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'[^']*'|"[^"]*"/g, '');
check('no unsupported business metric inference', !/\b(revenue|payment|conversion|geography|deliveryConfirmation|slaSuccess|providerAvailability)\b/i.test(logicOnly));

check('C3A contracts remain exact v1', CONTRACT_VERSION === 1 && BOOKING_DATA_SCHEMA_ID === 'golfriend.admin.booking-data.v1' && BOOKING_CALLABLE_SCHEMA_ID === 'golfriend.admin.booking-callables.v1' && BOOKING_REPORT_SCHEMA_ID === 'golfriend.admin.booking-report.v1' && BOOKING_READINESS_SCHEMA_ID === 'golfriend.admin.booking-readiness.v1');
check('no C3A capability commissioned', BOOKING_READINESS_REGISTRY.every((item) => item.currentState !== 'commissioned'));
check('C3B manifest schema exact v1', BOOKING_RELEASE_READINESS_SCHEMA_ID === 'golfriend.admin.booking-release-readiness.v1' && BOOKING_RELEASE_READINESS_VERSION === 1);
check('C3B classifications exact', JSON.stringify(BOOKING_RELEASE_CLASSIFICATIONS) === JSON.stringify(['implemented', 'fixture_verified', 'contract_ready', 'manual_verification_required', 'blocked_external', 'unavailable']));
check('C3B manifest immutable', Object.isFrozen(BOOKING_RELEASE_READINESS) && BOOKING_RELEASE_READINESS.every((item) => Object.isFrozen(item)));
check('C3B manifest complete', BOOKING_RELEASE_READINESS.length >= 12 && BOOKING_RELEASE_READINESS.every((item) => item.stableId && item.sourceType && item.authorityOwner && item.localeCoverage.length === 8 && item.requiredSchemaFields && item.prerequisiteIds && item.prohibitedClaims && item.evidenceType && item.manualVerificationRequirements));
const summary = summarizeBookingReleaseReadiness();
check('release summary reconciles', Object.values(summary.counts).reduce((sum, count) => sum + count, 0) === summary.totalCapabilities);

const c3bSources = ['src/components/admin/booking/bookingReleaseReadiness.js', 'src/components/admin/booking/BookingReleaseSummary.tsx'].map(read).join('\n');
check('no secret or production endpoint material', !/(AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|https:\/\/[^\s'"]*(firebaseio|googleapis|cloudfunctions)|bearer\s+[A-Za-z0-9._-]{16,})/i.test(c3bSources));
check('no callable, transmission, or deployment implementation in C3B', !/httpsCallable\s*\(|fetch\s*\(|XMLHttpRequest|firebase deploy|git push|transmitReport\s*\(/.test(c3bSources));
check('protected seed evidence unchanged from C3A', (() => { try { git('diff', '--quiet', BOOKING_RELEASE_PARENT_SHA, '--', 'Golfriend_Web_Admin/golfriend-admin/SEED_CONFORMANCE_EVIDENCE.json', 'Golfriend_Web_Admin/golfriend-admin/SEED_CONFORMANCE_EVIDENCE.md'); return true; } catch { return false; } })());

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.label}${result.ok || !result.detail ? '' : ` — ${result.detail}`}`);
const failed = results.filter((result) => !result.ok);
console.log(`C3B release gate: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.error('C3B release gate failed closed.'); process.exit(1); }
