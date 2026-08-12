// C3A booking commissioning boundary. This module is runtime-safe in Node and
// the browser: it has no Firebase imports, network access, or mutation APIs.

export const BOOKING_DATA_SCHEMA_ID = 'golfriend.admin.booking-data.v1';
export const BOOKING_CALLABLE_SCHEMA_ID = 'golfriend.admin.booking-callables.v1';
export const BOOKING_REPORT_SCHEMA_ID = 'golfriend.admin.booking-report.v1';
export const BOOKING_READINESS_SCHEMA_ID = 'golfriend.admin.booking-readiness.v1';
export const CONTRACT_VERSION = 1;
export const C3A_BASE_BUILD_ID = '6f194739f35e8a0cfb64e2d9ab567f846d52da41';
export const CANONICAL_LOCALES = Object.freeze(['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']);
export const READINESS_STATES = Object.freeze(['unavailable', 'fixture_verified', 'contract_ready', 'commissioned', 'degraded']);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const BOOKING_DATA_CONTRACT = deepFreeze({
  schemaId: BOOKING_DATA_SCHEMA_ID,
  version: CONTRACT_VERSION,
  streams: ['booking_overview', 'booking_audit', 'booking_messages'],
  lookups: ['course_provider_reference', 'booking_detail'],
  timestamp: { normalized: 'ISO-8601 UTC string', missing: null },
  status: { known: ['pending', 'confirmed', 'rejected', 'cancelled'], unknown: 'unknown' },
  sourceAuthority: 'trusted Golfriend server read model',
  prerequisites: { authentication: 'Firebase Auth session', authorization: 'verified staff role' },
  subscription: { returnsUnsubscribe: true, retryCreatesNewSubscription: true },
  timeoutMs: 10000,
  retry: { maximumAttempts: 3, backoff: 'bounded-exponential', safeForReads: true },
  browserWrites: 'forbidden',
});

export const CALLABLE_CONTRACTS = deepFreeze({
  adminResolveBooking: {
    schemaId: `${BOOKING_CALLABLE_SCHEMA_ID}.adminResolveBooking`, version: CONTRACT_VERSION,
    request: { required: ['bookingId', 'resolution', 'idempotencyKey'], resolution: ['confirm', 'reject', 'cancel'] },
    response: { required: ['accepted', 'bookingId', 'auditEventId'], accepted: 'boolean' },
    authorization: 'Firebase Auth plus verified staff role; server enforced',
    idempotency: 'required idempotencyKey; duplicate requests return the original outcome',
    auditEvent: 'required append-only booking resolution event', retrySafety: 'retry only with the same idempotencyKey',
    timeoutMs: 10000, errors: ['unauthenticated', 'permission_denied', 'invalid_argument', 'not_found', 'conflict', 'deadline_exceeded', 'unavailable', 'internal'],
    unavailable: true, directWriteFallback: 'forbidden',
  },
  sendBookingMessage: {
    schemaId: `${BOOKING_CALLABLE_SCHEMA_ID}.sendBookingMessage`, version: CONTRACT_VERSION,
    request: { required: ['bookingId', 'locale', 'message', 'idempotencyKey'], locales: CANONICAL_LOCALES },
    response: { required: ['accepted', 'bookingId', 'auditEventId'], accepted: 'boolean' },
    authorization: 'Firebase Auth plus verified staff role; server enforced',
    idempotency: 'required idempotencyKey; duplicate requests return the original outcome',
    auditEvent: 'required append-only booking message event', retrySafety: 'retry only with the same idempotencyKey',
    timeoutMs: 10000, errors: ['unauthenticated', 'permission_denied', 'invalid_argument', 'not_found', 'conflict', 'deadline_exceeded', 'unavailable', 'internal'],
    unavailable: true, directWriteFallback: 'forbidden',
  },
});

export const REPORT_EXCLUSIONS = deepFreeze([
  'revenue', 'payment', 'conversion', 'geography', 'delivery_confirmation', 'sla_success', 'automatic_jhcc_transmission',
]);

export const BOOKING_REPORT_CONTRACT = deepFreeze({
  schemaId: BOOKING_REPORT_SCHEMA_ID, version: CONTRACT_VERSION,
  identifier: 'sha256 of canonical window, build, contract version, totals and quality counts',
  required: ['reportId', 'generationWindow', 'sourceBuildId', 'sourceContractVersion', 'reconciliation', 'missingTimestampCount', 'unknownStatusCount', 'statusTotals', 'exceptionTotals', 'exports', 'exclusions'],
  exports: { csv: { mediaType: 'text/csv', localOnly: true }, txt: { mediaType: 'text/plain', localOnly: true } },
  exclusions: REPORT_EXCLUSIONS,
  transmission: 'unavailable',
});

export const FIXTURE_BOOKINGS = deepFreeze([
  { id: 'fixture-confirmed', status: 'confirmed', createdAt: '2026-08-10T09:00:00.000Z', courseId: 'fixture-course-a', courseName: 'Fixture North', locale: 'en' },
  { id: 'fixture-pending-missing-time', status: 'pending', createdAt: null, courseId: 'fixture-course-b', courseName: 'Fixture South', locale: 'th' },
  { id: 'fixture-unknown-status', status: 'unknown', createdAt: '2026-08-10T10:00:00.000Z', courseId: 'fixture-course-a', courseName: 'Fixture North', locale: 'de' },
]);

const unavailableError = () => Object.assign(new Error('Booking adapter unavailable until explicitly commissioned.'), { code: 'unavailable' });
export function createUnavailableBookingAdapter() {
  return deepFreeze({
    schemaId: BOOKING_DATA_SCHEMA_ID, version: CONTRACT_VERSION, mode: 'unavailable', readOnly: true,
    subscribe(_stream, observer) { observer.error(unavailableError()); return () => {}; },
    getBookingDetail: async () => { throw unavailableError(); },
    lookupCourseProvider: async () => { throw unavailableError(); },
  });
}

export function createFixtureBookingAdapter() {
  let subscriptionCount = 0;
  let activeCount = 0;
  const subscribe = (stream, observer) => {
    if (!BOOKING_DATA_CONTRACT.streams.includes(stream)) throw new Error(`Unsupported fixture stream: ${stream}`);
    subscriptionCount += 1; activeCount += 1;
    observer.next(stream === 'booking_messages' ? [] : FIXTURE_BOOKINGS);
    let active = true;
    return () => { if (active) { active = false; activeCount -= 1; } };
  };
  return {
    schemaId: BOOKING_DATA_SCHEMA_ID, version: CONTRACT_VERSION, mode: 'fixture', readOnly: true,
    subscribe,
    retry(stream, observer) { return subscribe(stream, observer); },
    async getBookingDetail(id) { return FIXTURE_BOOKINGS.find((booking) => booking.id === id) ?? null; },
    async lookupCourseProvider(courseId) { return { courseId, providerReference: `fixture:${courseId}`, sourceAuthority: 'deterministic local fixture' }; },
    diagnostics() { return Object.freeze({ subscriptionCount, activeCount }); },
  };
}

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
export function validateCallableRequest(callableName, request) {
  const contract = CALLABLE_CONTRACTS[callableName];
  if (!contract || !request || typeof request !== 'object') return { ok: false, errors: ['unsupported_callable_or_request'] };
  const errors = contract.request.required.filter((key) => !nonEmptyString(request[key])).map((key) => `missing_${key}`);
  if (callableName === 'adminResolveBooking' && !contract.request.resolution.includes(request.resolution)) errors.push('invalid_resolution');
  if (callableName === 'sendBookingMessage' && !CANONICAL_LOCALES.includes(request.locale)) errors.push('invalid_locale');
  return { ok: errors.length === 0, errors };
}

const stableHash = (input) => {
  let hash = 2166136261;
  for (const char of input) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export function produceBookingReportBoundary({ bookings, windowStart, windowEnd, sourceBuildId = C3A_BASE_BUILD_ID }) {
  const statusTotals = { pending: 0, confirmed: 0, rejected: 0, cancelled: 0, unknown: 0 };
  let missingTimestampCount = 0;
  for (const booking of bookings) {
    if (booking.createdAt === null) missingTimestampCount += 1;
    if (Object.hasOwn(statusTotals, booking.status)) statusTotals[booking.status] += 1;
    else statusTotals.unknown += 1;
  }
  const reconciledTotal = Object.values(statusTotals).reduce((sum, count) => sum + count, 0);
  const seed = JSON.stringify([windowStart, windowEnd, sourceBuildId, CONTRACT_VERSION, statusTotals, missingTimestampCount]);
  return deepFreeze({
    schemaId: BOOKING_REPORT_SCHEMA_ID, version: CONTRACT_VERSION, reportId: `c3a-${stableHash(seed)}`,
    generationWindow: { start: windowStart, end: windowEnd }, sourceBuildId, sourceContractVersion: CONTRACT_VERSION,
    reconciliation: { ok: reconciledTotal === bookings.length, sourceTotal: bookings.length, reconciledTotal },
    missingTimestampCount, unknownStatusCount: statusTotals.unknown, statusTotals,
    exceptionTotals: { missingTimestamp: missingTimestampCount, unknownStatus: statusTotals.unknown },
    exports: { csv: { mediaType: 'text/csv', generated: false }, txt: { mediaType: 'text/plain', generated: false } },
    exclusions: REPORT_EXCLUSIONS,
  });
}

export const BOOKING_READINESS_REGISTRY = deepFreeze([
  ['booking_streams', 'contract_ready', 'C3A adapter schema and local fixture smoke pass', ['Auth session', 'staff role', 'read-only production adapter approval'], ['inspect contract', 'run local fixture smoke'], ['claim provider health', 'write booking data'], 'Golfriend Booking Platform'],
  ['booking_audit', 'contract_ready', 'Append-only viewer exists; C3A stream contract defined', ['audit collection schema review', 'staff read authorization'], ['inspect audit contract'], ['alter audit events'], 'Golfriend Booking Platform'],
  ['booking_messages', 'contract_ready', 'Message stream contract and eight-locale schema defined', ['message schema review', 'staff read authorization'], ['draft and export locally'], ['claim delivery confirmation'], 'Golfriend Booking Platform'],
  ['booking_resolution_callable', 'contract_ready', 'Request validation only; callable not invoked', ['callable deployment verification', 'Auth and staff role', 'authorized idempotency test'], ['validate request shape'], ['invoke callable', 'direct-write fallback'], 'Golfriend Booking Platform'],
  ['message_send_callable', 'contract_ready', 'Request validation only; callable not invoked', ['callable deployment verification', 'Auth and staff role', 'authorized idempotency test'], ['validate request shape'], ['invoke callable', 'claim message delivery'], 'Golfriend Booking Platform'],
  ['exception_queue', 'fixture_verified', 'C2E retry regression and C3A fixture resubscription pass', ['real stream commissioning'], ['review deterministic fixture'], ['send automatic reminders'], 'Lane C Admin'],
  ['operations_report', 'fixture_verified', 'C3A deterministic report reconciliation pass', ['real read adapter', 'source schema verification'], ['generate local fixture summary'], ['infer excluded metrics', 'transmit automatically'], 'Lane C Admin'],
  ['automatic_reminders', 'unavailable', 'No approved reminder contract', ['approved product and delivery contract'], [], ['send reminders', 'fabricate reminder history'], 'Unassigned'],
  ['jhcc_report_transmission', 'unavailable', 'Lane C producer boundary only; no ingestion contract', ['approved JHCC ingestion contract', 'separate authorization'], ['export locally'], ['transmit to JHCC automatically'], 'Future JHCC integration'],
].map(([capabilityId, currentState, evidence, prerequisites, allowedActions, blockedActions, authorityOwner]) => ({
  capabilityId, currentState, evidence, prerequisites, allowedActions, blockedActions, authorityOwner,
  userFacingExplanation: currentState === 'fixture_verified' ? 'Verified with deterministic local data; not connected to real data.' : currentState === 'contract_ready' ? 'The commissioning contract is ready; the capability is not commissioned.' : 'Unavailable until its prerequisites and authority are approved.',
})));
