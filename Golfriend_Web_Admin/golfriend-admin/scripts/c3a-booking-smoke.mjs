import { readFileSync } from 'node:fs';
import {
  BOOKING_DATA_SCHEMA_ID, BOOKING_REPORT_SCHEMA_ID, BOOKING_READINESS_SCHEMA_ID,
  CALLABLE_CONTRACTS, CANONICAL_LOCALES, FIXTURE_BOOKINGS,
  createFixtureBookingAdapter, createUnavailableBookingAdapter,
  produceBookingReportBoundary, validateCallableRequest,
} from '../src/components/admin/booking/BookingCommissioning.js';

const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'local';
if (mode !== 'local') {
  console.error('C3A smoke is fail-closed: real-data mode is not authorized or implemented. No external operation attempted.');
  process.exit(2);
}

const checks = [];
const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); if (!ok) throw new Error(name); };
const requiredEnvironmentNames = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN'];
const environment = requiredEnvironmentNames.map((name) => ({ name, configured: Boolean(process.env[name]) }));

const unavailable = createUnavailableBookingAdapter();
check('default adapter is unavailable and read-only', unavailable.mode === 'unavailable' && unavailable.readOnly === true);
let unavailableObserved = false;
unavailable.subscribe('booking_overview', { next() {}, error(error) { unavailableObserved = error.code === 'unavailable'; } })();
check('unavailable adapter fails closed', unavailableObserved);

const fixture = createFixtureBookingAdapter();
let firstPayload = [];
const unsubscribeFirst = fixture.subscribe('booking_overview', { next(records) { firstPayload = records; }, error(error) { throw error; } });
check('fixture schema compatibility', fixture.schemaId === BOOKING_DATA_SCHEMA_ID && firstPayload.length === FIXTURE_BOOKINGS.length);
check('missing timestamp represented as null', firstPayload.some((record) => record.createdAt === null));
check('unknown status represented explicitly', firstPayload.some((record) => record.status === 'unknown'));
unsubscribeFirst();
check('first subscription cleaned up', fixture.diagnostics().activeCount === 0);
const beforeRetry = fixture.diagnostics().subscriptionCount;
const unsubscribeRetry = fixture.retry('booking_overview', { next() {}, error(error) { throw error; } });
check('retry creates genuine resubscription', fixture.diagnostics().subscriptionCount === beforeRetry + 1);
unsubscribeRetry();
check('retry subscription cleaned up', fixture.diagnostics().activeCount === 0);

check('adminResolveBooking request validates without invocation', validateCallableRequest('adminResolveBooking', { bookingId: 'fixture-confirmed', resolution: 'confirm', idempotencyKey: 'fixture-resolve-1' }).ok);
check('sendBookingMessage request validates without invocation', validateCallableRequest('sendBookingMessage', { bookingId: 'fixture-confirmed', locale: 'en', message: 'fixture only', idempotencyKey: 'fixture-message-1' }).ok);
check('callables remain unavailable', CALLABLE_CONTRACTS.adminResolveBooking.unavailable && CALLABLE_CONTRACTS.sendBookingMessage.unavailable);

const report = produceBookingReportBoundary({ bookings: FIXTURE_BOOKINGS, windowStart: '2026-08-10T00:00:00.000Z', windowEnd: '2026-08-11T00:00:00.000Z' });
check('report schema and reconciliation', report.schemaId === BOOKING_REPORT_SCHEMA_ID && report.reconciliation.ok === true);
check('report missing timestamp count', report.missingTimestampCount === 1);
check('report unknown status count', report.unknownStatusCount === 1);

const bookingSources = ['BookingCommissioning.js', 'BookingReadiness.tsx', 'BookingOversight.tsx', 'BookingAudit.tsx', 'booking/BookingDetailPanel.tsx', 'booking/BookingMessageComposer.tsx', 'booking/BookingExceptionQueue.tsx', 'booking/BookingReportView.tsx'];
const forbiddenWrites = /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/;
for (const relative of bookingSources) {
  const normalized = relative.startsWith('booking/') ? relative.slice(8) : relative;
  const base = relative.startsWith('BookingO') || relative.startsWith('BookingA') ? '../src/components/admin/' : '../src/components/admin/booking/';
  const source = readFileSync(new URL(base + normalized, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  check(`no direct mutation path: ${relative}`, !forbiddenWrites.test(source));
}
check('exact canonical locales', JSON.stringify(CANONICAL_LOCALES) === JSON.stringify(['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']));

const summary = Object.freeze({
  schemaId: 'golfriend.admin.booking-smoke-summary.v1',
  contractIds: [BOOKING_DATA_SCHEMA_ID, BOOKING_REPORT_SCHEMA_ID, BOOKING_READINESS_SCHEMA_ID],
  mode: 'local_fixture_read_only', environment, checksPassed: checks.length, checksFailed: 0,
  subscriptionsCreated: fixture.diagnostics().subscriptionCount, activeSubscriptions: fixture.diagnostics().activeCount,
  reportId: report.reportId, externalWrites: 0, callableInvocations: 0,
});
console.log(JSON.stringify(summary, null, 2));
