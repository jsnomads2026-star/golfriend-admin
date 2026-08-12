export const COMMISSIONING_LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;
export type CommissioningLocale = (typeof COMMISSIONING_LOCALES)[number];

export const CAPABILITY_IDS = [
  'marketing.asset-storage',
  'partners.request-intake',
  'partners.decision-submit',
  'courses.preview-apply',
  'booking.report-ingest',
  'advertising-oem.report-ingest',
  'service-health.report-ingest',
  'jhcc.report-transmit',
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type ReadinessState = 'unavailable' | 'local_preview' | 'contract_ready' | 'commissioned' | 'degraded';
export type DataClassification = 'public_asset' | 'internal_operational' | 'confidential_partner' | 'restricted_operational';
export type CommissioningErrorCode =
  | 'ADAPTER_UNAVAILABLE'
  | 'AUTHORIZATION_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PREVIEW_MISMATCH'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_STALE'
  | 'TIMEOUT'
  | 'UNSUPPORTED_LOCALE'
  | 'UNSUPPORTED_FORMAT'
  | 'UPSTREAM_REJECTED';

export interface ContractError {
  code: CommissioningErrorCode;
  retryable: boolean;
  message: string;
}

export interface ContractResult<T> {
  ok: boolean;
  value?: T;
  error?: ContractError;
  auditEventId?: string;
}

export interface MarketingAssetRequest { operation: 'upload' | 'download' | 'export'; assetId?: string; locale: CommissioningLocale; idempotencyKey?: string; }
export interface MarketingAssetResponse { assetId: string; version: string; operation: 'stored' | 'downloaded' | 'exported'; }
export interface PartnerRequestInput { requestId: string; includeEvidence: boolean; locale: CommissioningLocale; }
export interface PartnerRequestOutput { requestId: string; source: 'trusted'; evidenceIds: readonly string[]; }
export interface PartnerDecisionInput { requestId: string; decision: 'approve' | 'decline' | 'information_required'; previewId: string; idempotencyKey: string; }
export interface PartnerDecisionOutput { requestId: string; confirmedStatus: string; auditEventId: string; }
export interface CourseOperationInput { operation: 'preview' | 'apply'; exactCourseIds: readonly string[]; previewId?: string; idempotencyKey?: string; }
export interface CourseOperationOutput { previewId: string; exactCourseIds: readonly string[]; status: 'previewed' | 'applied'; auditEventId?: string; }
export interface BookingReportInput { schema: string; version: number; periodStart: string; periodEnd: string; records: readonly unknown[]; }
export interface BookingReportOutput { accepted: boolean; sourceTimestamp: string; recordCount: number; }
export interface AdvertisingOemReportInput { domain: 'advertising' | 'oem_exchange'; schema: string; version: number; records: readonly unknown[]; }
export interface AdvertisingOemReportOutput { accepted: boolean; sourceTimestamp: string; recordCount: number; deliveryClaimed: false; }
export interface ServiceHealthReportInput { schema: string; version: number; observedAt: string; services: readonly { id: string; status: 'healthy' | 'degraded' | 'unavailable' | 'unknown' }[]; }
export interface ServiceHealthReportOutput { accepted: boolean; observedAt: string; services: readonly { id: string; status: 'healthy' | 'degraded' | 'unavailable' | 'unknown' }[]; }
export interface JHCCTransmissionInput { schema: 'golfriend.admin.operations-report.v1'; version: 1; payload: unknown; confirmationId: string; idempotencyKey: string; }
export interface JHCCTransmissionOutput { accepted: boolean; receiptId: string; acceptedAt: string; }

export interface CommissioningAdapter<I, O> { execute(input: I): Promise<ContractResult<O>>; }
export interface FutureJHCCTransmitter {
  validate(input: JHCCTransmissionInput): readonly string[];
  preview(input: JHCCTransmissionInput): Promise<ContractResult<{ validated: true; envelope: JHCCTransmissionInput }>>;
  transmit(input: JHCCTransmissionInput, confirmed: true): Promise<ContractResult<JHCCTransmissionOutput>>;
}

export interface CommissioningContract {
  capabilityId: CapabilityId;
  schema: { name: string; version: number };
  inputType: string;
  outputType: string;
  errors: readonly CommissioningErrorCode[];
  authorization: string;
  idempotency: string;
  auditEvent: string;
  localeHandling: string;
  dataClassification: DataClassification;
  retryPolicy: string;
  timeoutMs: number;
  unavailableBehavior: string;
  readinessPrerequisites: readonly string[];
  prohibitedBehavior: readonly string[];
}

export interface CommissioningReadiness {
  capabilityId: CapabilityId;
  currentState: ReadinessState;
  sourceEvidence: string;
  missingPrerequisites: readonly string[];
  allowedActions: readonly string[];
  blockedActions: readonly string[];
  explanation: string;
  lastVerifiedBuild: string;
}

const WRITE_ERRORS: readonly CommissioningErrorCode[] = ['ADAPTER_UNAVAILABLE', 'AUTHORIZATION_REQUIRED', 'VALIDATION_FAILED', 'IDEMPOTENCY_CONFLICT', 'TIMEOUT', 'UPSTREAM_REJECTED'];
const INGEST_ERRORS: readonly CommissioningErrorCode[] = ['ADAPTER_UNAVAILABLE', 'AUTHORIZATION_REQUIRED', 'VALIDATION_FAILED', 'SOURCE_UNAVAILABLE', 'SOURCE_STALE', 'TIMEOUT'];
const NO_CREDENTIALS = 'No direct browser writes, embedded credentials, invented endpoints, schedules, or background jobs.';
const NO_PAYMENT_AUTHORITY = 'Must not claim Golfriend sells tee times or processes tee-time payments.';

export const COMMISSIONING_CONTRACTS: readonly CommissioningContract[] = Object.freeze([
  { capabilityId:'marketing.asset-storage', schema:{name:'golfriend.admin.marketing-asset-operation',version:1}, inputType:'MarketingAssetRequest', outputType:'MarketingAssetResponse', errors:[...WRITE_ERRORS,'UNSUPPORTED_FORMAT','UNSUPPORTED_LOCALE'], authorization:'Approved server-authorized storage adapter and scoped Admin permission.', idempotency:'Uploads and exports require a stable idempotency key; retries must return the original outcome.', auditEvent:'Trusted service emits marketing_asset_operation with actor, asset, operation, and version.', localeHandling:'Locale must be one of the exact commissioning locales; untranslated assets remain incomplete.', dataClassification:'public_asset', retryPolicy:'Retry only adapter-declared transient failures with the same idempotency key.', timeoutMs:15000, unavailableBehavior:'Read-only catalogue remains available; upload, download, and export are blocked.', readinessPrerequisites:['Approved storage owner','Server authorization','Retention and malware policy','Audit sink'], prohibitedBehavior:[NO_CREDENTIALS,'Do not invent files, approval, publishing, or campaign delivery.'] },
  { capabilityId:'partners.request-intake', schema:{name:'golfriend.admin.partner-request-intake',version:1}, inputType:'PartnerRequestInput', outputType:'PartnerRequestOutput', errors:[...INGEST_ERRORS,'UNSUPPORTED_LOCALE'], authorization:'Approved read service with least-privilege access to necessary partner fields.', idempotency:'Reads are repeatable and side-effect free.', auditEvent:'Trusted source records protected evidence access without exposing secrets.', localeHandling:'Contact locale is limited to the exact commissioning locales or marked unverified.', dataClassification:'confidential_partner', retryPolicy:'Retry transient reads within source limits; never broaden requested personal data.', timeoutMs:10000, unavailableBehavior:'Clearly labelled local-preview catalogue only; trusted request and evidence remain unavailable.', readinessPrerequisites:['Approved request source','Data minimization review','Evidence access policy'], prohibitedBehavior:[NO_CREDENTIALS,'Do not expose secrets or unnecessary personal data.'] },
  { capabilityId:'partners.decision-submit', schema:{name:'golfriend.admin.partner-decision',version:1}, inputType:'PartnerDecisionInput', outputType:'PartnerDecisionOutput', errors:WRITE_ERRORS, authorization:'Approved server decision service plus explicit authorized Admin confirmation.', idempotency:'Every decision requires a stable idempotency key; retries cannot duplicate decisions.', auditEvent:'Trusted service emits decision_requested and decision_confirmed events.', localeHandling:'Decision summaries may use an exact supported locale; machine decision identifiers remain English.', dataClassification:'confidential_partner', retryPolicy:'Retry only transient failures using the same preview and idempotency keys.', timeoutMs:15000, unavailableBehavior:'Local decision preview, copy, and export only; submission cannot succeed.', readinessPrerequisites:['Approved decision service','Role authorization','Immutable audit history','Notification ownership decision'], prohibitedBehavior:[NO_CREDENTIALS,'A preview or client action is never approval; only a trusted confirmation changes status.'] },
  { capabilityId:'courses.preview-apply', schema:{name:'golfriend.admin.course-preview-apply',version:1}, inputType:'CourseOperationInput', outputType:'CourseOperationOutput', errors:[...WRITE_ERRORS,'PREVIEW_MISMATCH'], authorization:'Existing server-authorized Golf API course-operation service and authorized Admin role.', idempotency:'Apply requires a stable idempotency key and must not duplicate writes.', auditEvent:'Service records preview and confirmed apply with exact reconciled course IDs.', localeHandling:'Machine course identifiers are locale-neutral; messages use an exact supported locale.', dataClassification:'internal_operational', retryPolicy:'A failed apply may retry only with the same preview ID, exact course IDs, and idempotency key.', timeoutMs:30000, unavailableBehavior:'Preview may be prepared locally; apply is blocked when the approved adapter is absent.', readinessPrerequisites:['Approved callable deployment','Authorized role','Preview TTL policy','Production smoke test'], prohibitedBehavior:[NO_CREDENTIALS,'Never apply unless preview ID and exact course IDs reconcile.',NO_PAYMENT_AUTHORITY] },
  { capabilityId:'booking.report-ingest', schema:{name:'golfriend.admin.booking-report-ingestion',version:1}, inputType:'BookingReportInput', outputType:'BookingReportOutput', errors:INGEST_ERRORS, authorization:'Lane C-owned approved reporting provider grants read-only Admin ingestion.', idempotency:'The same source schema, period, timestamp, and content digest must reconcile to one snapshot.', auditEvent:'Admin records source version, period, digest, and acceptance result.', localeHandling:'Machine report keys remain English; display labels use the exact supported locales.', dataClassification:'restricted_operational', retryPolicy:'Retry the identical immutable snapshot only; never synthesize missing booking records.', timeoutMs:15000, unavailableBehavior:'Booking section remains source unavailable and contributes no production totals.', readinessPrerequisites:['Lane C reporting contract','Source timestamp and digest','Data minimization review'], prohibitedBehavior:[NO_CREDENTIALS,'Do not import or modify Lane C source.','Never fabricate booking, revenue, payment, or user totals.',NO_PAYMENT_AUTHORITY] },
  { capabilityId:'advertising-oem.report-ingest', schema:{name:'golfriend.admin.advertising-oem-report-ingestion',version:1}, inputType:'AdvertisingOemReportInput', outputType:'AdvertisingOemReportOutput', errors:INGEST_ERRORS, authorization:'Approved domain-owned reporting adapter with read-only Admin scope.', idempotency:'Identical source snapshots reconcile by domain, schema version, timestamp, and digest.', auditEvent:'Admin records source domain, schema, digest, and acceptance result.', localeHandling:'Machine fields remain English; human labels use the exact supported locales.', dataClassification:'restricted_operational', retryPolicy:'Retry identical snapshots only after retryable source failures.', timeoutMs:15000, unavailableBehavior:'Advertising and OEM sections remain unavailable and contain no production totals.', readinessPrerequisites:['Advertising/OEM source owner','Approved schemas','Source timestamps and digests'], prohibitedBehavior:[NO_CREDENTIALS,'Reporting acceptance never implies campaign delivery, publishing, or OEM activation.'] },
  { capabilityId:'service-health.report-ingest', schema:{name:'golfriend.admin.service-health-report-ingestion',version:1}, inputType:'ServiceHealthReportInput', outputType:'ServiceHealthReportOutput', errors:INGEST_ERRORS, authorization:'Approved observability adapter with read-only service-health scope.', idempotency:'Observations reconcile by service ID, observed time, schema version, and digest.', auditEvent:'Admin records observation source, time, digest, and validation outcome.', localeHandling:'Service IDs and status values remain stable English identifiers; labels are localized.', dataClassification:'internal_operational', retryPolicy:'Retry immutable observations only; retain unknown when evidence is absent.', timeoutMs:10000, unavailableBehavior:'Service health displays unknown/source unavailable, never healthy.', readinessPrerequisites:['Observability owner','Health semantics','Freshness threshold','Read authorization'], prohibitedBehavior:[NO_CREDENTIALS,'Unknown must never be converted to healthy.'] },
  { capabilityId:'jhcc.report-transmit', schema:{name:'golfriend.admin.jhcc-report-transmission',version:1}, inputType:'JHCCTransmissionInput', outputType:'JHCCTransmissionOutput', errors:WRITE_ERRORS, authorization:'Explicitly approved reporting transmitter and authorized confirmation.', idempotency:'Every confirmed transmission requires a stable idempotency key; retries return the original receipt.', auditEvent:'Trusted transmitter records validation, confirmation, acceptance, and receipt identifiers.', localeHandling:'Report machine keys remain English; human content is limited to exact supported locales.', dataClassification:'restricted_operational', retryPolicy:'Never auto-retry without the same confirmation and idempotency keys.', timeoutMs:30000, unavailableBehavior:'Local payload preview, schema validation, deterministic export, and readiness inspection only.', readinessPrerequisites:['Approved Golfriend-to-JHCC contract','Approved transmitter','Authorization model','Receipt and rollback policy','Production smoke test'], prohibitedBehavior:[NO_CREDENTIALS,'No automatic send, schedule, background transmission, email, or claim of JHCC receipt.'] },
]);

export const DEFAULT_COMMISSIONING_ADAPTERS: Readonly<Record<CapabilityId, null>> = Object.freeze(Object.fromEntries(CAPABILITY_IDS.map((id) => [id, null])) as Record<CapabilityId, null>);

export const COMMISSIONING_REGISTRY: readonly CommissioningReadiness[] = Object.freeze([
  { capabilityId:'marketing.asset-storage', currentState:'unavailable', sourceEvidence:'B5-R5 read-only catalogue; no approved storage adapter.', missingPrerequisites:['Approved storage owner','Server authorization','Retention and malware policy','Audit sink'], allowedActions:['Inspect catalogue','Preview supported local assets','Copy supported text'], blockedActions:['Upload','Trusted download/export','Publish'], explanation:'Marketing storage operations remain unavailable until storage approval.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'partners.request-intake', currentState:'local_preview', sourceEvidence:'B5-R6 clearly labelled local-preview provider only.', missingPrerequisites:['Approved request source','Evidence retrieval authorization','Data minimization review'], allowedActions:['Review preview requests','Copy/export local summary'], blockedActions:['Claim production intake','Retrieve trusted evidence'], explanation:'Preview data demonstrates the review shape and is excluded from production claims.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'partners.decision-submit', currentState:'unavailable', sourceEvidence:'B5-R6 default decision service is null.', missingPrerequisites:['Approved decision service','Role authorization','Immutable audit history'], allowedActions:['Preview decision','Copy/export summary'], blockedActions:['Approve or decline','Create account','Notify partner'], explanation:'A partner decision remains a preview until a trusted service confirms it.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'courses.preview-apply', currentState:'contract_ready', sourceEvidence:'B5-R4 preview-bound course-ID contract and server-authorized adapter boundary.', missingPrerequisites:['Approved deployed callable','Authorized environment smoke test','Preview TTL policy'], allowedActions:['Prepare preview','Validate exact course IDs'], blockedActions:['Apply without approved adapter','Apply mismatched preview/course IDs'], explanation:'The safety contract is ready; this build does not claim a commissioned deployment.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'booking.report-ingest', currentState:'contract_ready', sourceEvidence:'Admin-side read-only ingestion boundary; no Lane C provider injected.', missingPrerequisites:['Lane C reporting contract','Trusted source timestamp and digest','Data minimization review'], allowedActions:['Validate a future snapshot schema'], blockedActions:['Read Lane C directly','Fabricate booking or payment totals'], explanation:'The ingestion contract is ready while the external Lane C source remains unavailable.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'advertising-oem.report-ingest', currentState:'contract_ready', sourceEvidence:'Admin-side reporting boundary; no advertising or OEM provider injected.', missingPrerequisites:['Domain source owners','Approved schemas','Trusted timestamps and digests'], allowedActions:['Validate future source envelopes'], blockedActions:['Claim campaign delivery','Publish or activate OEM'], explanation:'Reporting contracts do not establish advertising delivery or OEM activation.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'service-health.report-ingest', currentState:'contract_ready', sourceEvidence:'Admin-side health observation boundary; no observability adapter injected.', missingPrerequisites:['Observability owner','Health semantics','Freshness threshold'], allowedActions:['Validate future observations','Display unknown'], blockedActions:['Infer healthy from missing data'], explanation:'The source contract is ready; current health remains unknown.', lastVerifiedBuild:'B5-R9@5785be1' },
  { capabilityId:'jhcc.report-transmit', currentState:'contract_ready', sourceEvidence:'B5-R7 report schema and disabled transmitter boundary.', missingPrerequisites:['Approved reporting contract','Approved transmitter','Authorization and receipt policy'], allowedActions:['Preview payload locally','Validate schema','Export deterministically','Inspect readiness'], blockedActions:['Send automatically','Schedule or email','Claim JHCC receipt'], explanation:'Contract-ready does not mean commissioned; transmission remains unavailable.', lastVerifiedBuild:'B5-R9@5785be1' },
]);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};
deepFreeze(COMMISSIONING_CONTRACTS);
deepFreeze(COMMISSIONING_REGISTRY);

const READINESS_STATES: readonly ReadinessState[] = ['unavailable', 'local_preview', 'contract_ready', 'commissioned', 'degraded'];

export const validateCommissioningRegistry = (
  entries: readonly CommissioningReadiness[] = COMMISSIONING_REGISTRY,
  adapters: Readonly<Partial<Record<CapabilityId, unknown>>> = DEFAULT_COMMISSIONING_ADAPTERS,
): readonly string[] => {
  const errors: string[] = [];
  const ids = entries.map((entry) => entry.capabilityId);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate capability ID');
  if (ids.length !== CAPABILITY_IDS.length || CAPABILITY_IDS.some((id) => !ids.includes(id))) errors.push('Capability set mismatch');
  for (const entry of entries) {
    if (!READINESS_STATES.includes(entry.currentState)) errors.push(`${entry.capabilityId} has unsupported readiness state`);
    if (!entry.sourceEvidence.trim()) errors.push(`${entry.capabilityId} lacks source evidence`);
    if (entry.currentState === 'commissioned' && !adapters[entry.capabilityId]) errors.push(`${entry.capabilityId} lacks commissioned evidence`);
  }
  return errors;
};

export const exportCommissioningRegistry = (): string => JSON.stringify(COMMISSIONING_REGISTRY.map((entry) => ({
  capability_id: entry.capabilityId,
  current_state: entry.currentState,
  source_evidence: entry.sourceEvidence,
  missing_prerequisites: [...entry.missingPrerequisites],
  allowed_actions: [...entry.allowedActions],
  blocked_actions: [...entry.blockedActions],
  explanation: entry.explanation,
  last_verified_build: entry.lastVerifiedBuild,
})), null, 2);

export const validateJHCCTransmissionEnvelope = (input: unknown): readonly string[] => {
  if (!input || typeof input !== 'object') return ['Envelope must be an object'];
  const envelope = input as Partial<JHCCTransmissionInput>;
  const errors: string[] = [];
  if (envelope.schema !== 'golfriend.admin.operations-report.v1') errors.push('Unsupported report schema');
  if (envelope.version !== 1) errors.push('Unsupported report version');
  if (!envelope.confirmationId) errors.push('Confirmation is required');
  if (!envelope.idempotencyKey) errors.push('Idempotency key is required');
  if (envelope.payload === undefined) errors.push('Payload is required');
  return errors;
};
