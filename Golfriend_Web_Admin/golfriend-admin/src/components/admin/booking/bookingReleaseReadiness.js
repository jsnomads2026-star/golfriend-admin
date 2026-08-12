// C3B final Lane C booking release-readiness manifest.
// Deterministic, immutable, local-only, and free of provider/deployment claims.

export const BOOKING_RELEASE_READINESS_SCHEMA_ID = 'golfriend.admin.booking-release-readiness.v1';
export const BOOKING_RELEASE_READINESS_VERSION = 1;
export const BOOKING_RELEASE_PARENT_SHA = '97cbc878406a1e460e95e25b4c2e7dfaa119e65f';
export const BOOKING_RELEASE_LOCALES = Object.freeze(['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']);
export const BOOKING_RELEASE_CLASSIFICATIONS = Object.freeze([
  'implemented', 'fixture_verified', 'contract_ready', 'manual_verification_required', 'blocked_external', 'unavailable',
]);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

const allLocales = BOOKING_RELEASE_LOCALES;
const commonProhibitedClaims = Object.freeze([
  'tee-time sale', 'tee-time payment', 'provider availability', 'delivery confirmation',
  'revenue', 'conversion', 'SLA success', 'production commissioning',
]);

const entry = (stableId, classification, sourceType, authorityOwner, requiredSchemaFields, prerequisiteIds, evidenceType, manualVerificationRequirements, prohibitedClaims = commonProhibitedClaims) => ({
  stableId, classification, sourceType, authorityOwner, localeCoverage: allLocales,
  requiredSchemaFields, prerequisiteIds, prohibitedClaims, evidenceType, manualVerificationRequirements,
});

export const BOOKING_RELEASE_READINESS = deepFreeze([
  entry('booking_oversight', 'implemented', 'Firestore read stream plus trusted callable', 'Golfriend Booking Platform', ['booking.id', 'booking.status', 'booking.courseId', 'booking.createdAt'], ['firebase_auth', 'staff_role', 'booking_read_schema', 'adminResolveBooking_callable'], 'source_and_gate', ['Authenticated staff browser journey', 'Real read-stream error and empty states']),
  entry('booking_audit', 'implemented', 'append-only Firestore read stream', 'Golfriend Booking Platform', ['audit.id', 'audit.bookingId', 'audit.action', 'audit.createdAt'], ['firebase_auth', 'staff_role', 'booking_audit_schema'], 'source_and_gate', ['Authenticated append-only audit review', 'Keyboard and screen-reader review']),
  entry('booking_detail_panel', 'manual_verification_required', 'booking and message read streams', 'Lane C Admin', ['booking.id', 'booking.status', 'message.bookingId', 'message.createdAt'], ['firebase_auth', 'staff_role', 'booking_detail_schema'], 'source_and_accessibility_gate', ['Desktop and 390px focus-cycle review', 'Escape close and trigger-focus restoration review']),
  entry('booking_message_composer', 'implemented', 'local templates plus sendBookingMessage callable boundary', 'Golfriend Booking Platform', ['booking.id', 'locale', 'message', 'idempotencyKey'], ['firebase_auth', 'staff_role', 'sendBookingMessage_callable'], 'source_and_gate', ['Authorized callable test remains separately unavailable', 'Localized copy review by language owners']),
  entry('booking_exception_queue', 'fixture_verified', 'booking read stream plus pure classifier', 'Lane C Admin', ['booking.id', 'booking.status', 'booking.createdAt'], ['booking_read_schema', 'real_read_adapter'], 'deterministic_fixture_and_gate', ['Real-data stale-boundary sampling', 'Authenticated retry/error journey']),
  entry('booking_operations_report', 'fixture_verified', 'booking read stream plus pure aggregator', 'Lane C Admin', ['booking.id', 'booking.status', 'booking.createdAt', 'booking.courseId'], ['booking_read_schema', 'real_read_adapter'], 'deterministic_fixture_and_reconciliation_gate', ['Real-data reconciliation review', 'CSV and TXT human inspection']),
  entry('booking_data_contract', 'contract_ready', 'injectable read-only adapter contract', 'Golfriend Booking Platform', ['schemaId', 'version', 'sourceAuthority', 'unsubscribe'], ['approved_read_adapter', 'firebase_auth', 'staff_role', 'firestore_schema_review'], 'immutable_contract_and_smoke', ['Approved read-only real-data smoke']),
  entry('booking_callable_contract', 'contract_ready', 'server-authoritative callable interfaces', 'Golfriend Booking Platform', ['bookingId', 'idempotencyKey', 'accepted', 'auditEventId'], ['callable_deployment_review', 'server_staff_authorization', 'audit_event_review'], 'immutable_contract_and_shape_validation', ['Separately authorized non-production callable test']),
  entry('booking_report_contract', 'contract_ready', 'Lane C report producer boundary', 'Lane C Admin', ['reportId', 'generationWindow', 'sourceBuildId', 'reconciliation', 'statusTotals'], ['real_read_adapter', 'source_schema_review'], 'immutable_contract_and_fixture_reconciliation', ['Consumer contract review', 'Real-data reconciliation review']),
  entry('booking_readiness_contract', 'contract_ready', 'deterministic local readiness registry', 'Lane C Admin', ['capabilityId', 'currentState', 'evidence', 'prerequisites'], ['human_commissioning_approval'], 'immutable_contract_and_gate', ['Human evidence and approval review']),
  entry('automatic_reminders', 'unavailable', 'no approved adapter or delivery contract', 'Unassigned', [], ['approved_reminder_contract', 'delivery_authority'], 'explicit_unavailable_boundary', ['Product, privacy, and delivery review'], [...commonProhibitedClaims, 'automatic reminder sent']),
  entry('jhcc_report_transmission', 'blocked_external', 'Lane C producer boundary only', 'Future JHCC integration', ['reportId', 'schemaId', 'version'], ['approved_jhcc_ingestion_contract', 'transmission_authorization'], 'explicit_no_transmission_boundary', ['JHCC consumer contract and security review'], [...commonProhibitedClaims, 'automatic JHCC transmission']),
  entry('production_dependency_audit', 'blocked_external', 'npm production dependency audit', 'Golfriend Admin maintainers', ['package-lock.json'], ['production_dependency_remediation', 'clean_production_dependency_audit'], 'npm_audit_2026_08_12', ['Review and patch protobufjs and react-router advisories', 'Rerun production dependency audit after an approved dependency update'], [...commonProhibitedClaims, 'dependency-safe release']),
]);

export function summarizeBookingReleaseReadiness(entries = BOOKING_RELEASE_READINESS) {
  const counts = Object.fromEntries(BOOKING_RELEASE_CLASSIFICATIONS.map((classification) => [classification, 0]));
  const prerequisiteIds = new Set();
  for (const item of entries) {
    counts[item.classification] += 1;
    item.prerequisiteIds.forEach((id) => prerequisiteIds.add(id));
  }
  return deepFreeze({
    schemaId: BOOKING_RELEASE_READINESS_SCHEMA_ID,
    version: BOOKING_RELEASE_READINESS_VERSION,
    totalCapabilities: entries.length,
    completedCapabilities: counts.implemented + counts.fixture_verified + counts.contract_ready,
    externallyBlockedCapabilities: counts.blocked_external + counts.unavailable,
    manualVerificationCapabilities: counts.manual_verification_required,
    counts,
    remainingPrerequisiteIds: [...prerequisiteIds].sort(),
  });
}
