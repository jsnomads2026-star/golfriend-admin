import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  BOOKING_DATA_CONTRACT, BOOKING_DATA_SCHEMA_ID, BOOKING_CALLABLE_SCHEMA_ID,
  BOOKING_REPORT_CONTRACT, BOOKING_REPORT_SCHEMA_ID, BOOKING_READINESS_REGISTRY,
  BOOKING_READINESS_SCHEMA_ID, CALLABLE_CONTRACTS, CANONICAL_LOCALES,
  CONTRACT_VERSION, READINESS_STATES, createFixtureBookingAdapter, createUnavailableBookingAdapter,
} from '../src/components/admin/booking/BookingCommissioning.js';

const results = [];
const assert = (label, condition) => results.push({ label, ok: Boolean(condition) });
assert('exact data schema ID', BOOKING_DATA_SCHEMA_ID === 'golfriend.admin.booking-data.v1');
assert('exact callable schema ID', BOOKING_CALLABLE_SCHEMA_ID === 'golfriend.admin.booking-callables.v1');
assert('exact report schema ID', BOOKING_REPORT_SCHEMA_ID === 'golfriend.admin.booking-report.v1');
assert('exact readiness schema ID', BOOKING_READINESS_SCHEMA_ID === 'golfriend.admin.booking-readiness.v1');
assert('contract version 1', CONTRACT_VERSION === 1);
assert('versioned schemas immutable', Object.isFrozen(BOOKING_DATA_CONTRACT) && Object.isFrozen(BOOKING_REPORT_CONTRACT) && Object.isFrozen(CALLABLE_CONTRACTS));
assert('exact canonical locales', JSON.stringify(CANONICAL_LOCALES) === JSON.stringify(['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']));
assert('allowed readiness states exact', JSON.stringify(READINESS_STATES) === JSON.stringify(['unavailable', 'fixture_verified', 'contract_ready', 'commissioned', 'degraded']));
const expectedCapabilities = ['booking_streams', 'booking_audit', 'booking_messages', 'booking_resolution_callable', 'message_send_callable', 'exception_queue', 'operations_report', 'automatic_reminders', 'jhcc_report_transmission'];
assert('exact readiness capabilities', JSON.stringify(BOOKING_READINESS_REGISTRY.map((entry) => entry.capabilityId)) === JSON.stringify(expectedCapabilities));
assert('no unsupported commissioned state', BOOKING_READINESS_REGISTRY.every((entry) => entry.currentState !== 'commissioned'));
assert('every readiness entry complete', BOOKING_READINESS_REGISTRY.every((entry) => entry.evidence && entry.prerequisites && entry.allowedActions && entry.blockedActions && entry.authorityOwner && entry.userFacingExplanation));
assert('default adapter unavailable', createUnavailableBookingAdapter().mode === 'unavailable');
assert('fixture adapter read-only', createFixtureBookingAdapter().readOnly === true);
assert('callables unavailable and direct fallback forbidden', Object.values(CALLABLE_CONTRACTS).every((contract) => contract.unavailable === true && contract.directWriteFallback === 'forbidden'));
const reportContractText = JSON.stringify(BOOKING_REPORT_CONTRACT).toLowerCase();
for (const exclusion of ['revenue', 'payment', 'conversion', 'geography', 'delivery_confirmation', 'sla_success', 'automatic_jhcc_transmission']) assert(`report exclusion: ${exclusion}`, reportContractText.includes(exclusion));
const ui = readFileSync(new URL('../src/components/admin/booking/BookingReadiness.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
assert('read-only UI integration', ui.includes('data-c3a-booking-readiness') && !/httpsCallable|onSnapshot|setDoc|addDoc|updateDoc|deleteDoc/.test(ui));
assert('keyboard and 44px controls', ui.includes('aria-expanded') && css.includes('min-height: 44px') && css.includes(':focus-visible'));
assert('390px responsive contract', css.includes('@media (max-width: 390px)'));
assert('reduced motion preserved', css.includes('prefers-reduced-motion'));
assert('smoke harness passes', (() => { try { execFileSync(process.execPath, [new URL('./c3a-booking-smoke.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'pipe' }); return true; } catch { return false; } })());

for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.label}`);
const failed = results.filter((result) => !result.ok);
console.log(`C3A gate: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
