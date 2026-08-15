// Enterprise course acquisition registry — pure model (no I/O, no Firebase, no network).
// Golfriend Admin approaches UNSIGNED courses with opportunity evidence. Invariants:
//   - An unsigned course receives opportunity evidence, never an invoice.
//   - No commission is effective without a signed, effective-dated agreement.
//   - Internal contact details and internal notes never leave via a shareable artifact.
//   - Approval/handoff never grants partner status; staff provisioning stays authoritative.
// The canonical eight-locale set is owned by `src/i18n/locales.ts` and is NOT redeclared here.
// This model validates locale SHAPE only; canonical membership is enforced at the TS boundary
// via `coerceLocale`/`isCanonicalLocale`, and asserted against the canonical source by the gate.
export const PROSPECT_STAGES=Object.freeze(['identified','researching','contacted','responded','meeting_held','pilot_discussion','agreement_drafting','onboarding_handoff','signed','declined','dormant','source_unavailable']);
export const CONTRACT_STATES=Object.freeze(['none','pilot_proposed','pilot_active','agreement_sent','signed_pending_effective','effective','lapsed','declined','source_unavailable']);
/** The only recorded contract states under which a commission may ever read as effective.
 *  A commission must agree with the recorded state, never contradict it. */
export const COMMISSION_BEARING_STATES=Object.freeze(['signed_pending_effective','pilot_active','effective']);
export const OUTREACH_CHANNELS=Object.freeze(['email_draft','call_note','meeting_note','postal_draft','inbound_enquiry','unknown']);
export const NOTE_VISIBILITIES=Object.freeze(['internal','shareable']);
export const ATTRIBUTION_LEVELS=Object.freeze(['authoritative','unverified','unavailable']);
/** Aggregate buckets below this count are suppressed so no individual movement is inferable. */
export const MIN_AGGREGATE_COUNT=5;
/** Fields that must never appear in a shareable artifact sent outside Golfriend. */
export const INTERNAL_ONLY_FIELDS=Object.freeze(['contactEmail','contactPhone','internalNotes','owner']);

const str=(v,fallback)=>typeof v==='string'&&v.trim()?v.trim():fallback;
const oneOf=(list,v,fallback)=>list.includes(v)?v:fallback;
/** A real calendar day, not just an ISO-shaped string: '2026-02-30' and '0000-00-00' are rejected. */
const isoDay=(v)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const parsed=new Date(`${v}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v?v:null;};

// --- shared privacy primitives ---------------------------------------------
// Free text entered in the registry may contain personal data. Any value crossing an
// outbound boundary is screened with these; they are deliberately conservative.
// KNOWN LIMIT: these catch structured identifiers — addresses, telephone runs, coordinates,
// IPs. A bare personal name in free text ("Somchai Prasert") is not mechanically detectable
// and will pass. Free text is therefore minimized at entry, and an operator remains
// responsible for what is typed into a registry field.
export const PERSONAL_DATA_PATTERNS=Object.freeze([/[\w.+-]+@[\w-]+\.[\w.]+/,/\+\d[\d\s()-]{6,}\d/,/\b\d{9,15}\b/,/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/,/\b\d{1,3}(\.\d{1,3}){3}\b/]);
const ISO_DAY_OR_STAMP=/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
/** True when a value looks like it carries personal data. ISO dates are structural, not personal. */
export function containsPersonalData(value){if(typeof value==='number')return PERSONAL_DATA_PATTERNS.some((p)=>p.test(String(value)));if(typeof value!=='string')return false;if(ISO_DAY_OR_STAMP.test(value))return false;return PERSONAL_DATA_PATTERNS.some((p)=>p.test(value));}
/** Replace free text that fails screening rather than emitting it. */
export function redactText(value,fallback){return containsPersonalData(value)?fallback:value;}
/** Shape-only locale check. Canonical membership belongs to `src/i18n/locales.ts`. */
const localeCode=(v)=>typeof v==='string'&&/^[a-z]{2}$/.test(v)?v:null;

/** Normalize one contact-history entry. Free text is kept only when explicitly marked shareable. */
export function normalizeContactEntry(row){const visibility=oneOf(NOTE_VISIBILITIES,row?.visibility,'internal');return{at:isoDay(row?.at),channel:oneOf(OUTREACH_CHANNELS,row?.channel,'unknown'),stageAfter:oneOf(PROSPECT_STAGES,row?.stageAfter,'source_unavailable'),visibility,summary:visibility==='shareable'?str(row?.summary,'No shareable summary recorded'):'Internal note withheld',recordedBy:str(row?.recordedBy,'Unattributed')};}

/**
 * Normalize a contract/pilot record for Admin VISIBILITY.
 * Commercial eligibility is owned by the partner-onboarding domain
 * (`golfriend.course-partner.v1`); Admin reports what that domain records and can never confer it.
 * A pilot window begins only at verified activation, never at signup.
 */
export function normalizeContract(row){const state=oneOf(CONTRACT_STATES,row?.state,'none');const signed=row?.signed===true;return{state,signed,signedAt:isoDay(row?.signedAt),effectiveFrom:isoDay(row?.effectiveFrom),effectiveUntil:isoDay(row?.effectiveUntil),activatedAt:isoDay(row?.activatedAt),pilotEndsAt:isoDay(row?.pilotEndsAt),commissionBps:Number.isInteger(row?.commissionBps)&&row.commissionBps>=0?row.commissionBps:null,agreementVersion:str(row?.agreementVersion,null),reference:str(row?.reference,null),authority:'partner-onboarding-domain'};}

/** Normalize a prospect row. Internal-only fields are retained here but stripped by `shareableProspect`. */
export function normalizeProspect(row){return{id:String(row?.id??'unknown'),courseName:str(row?.courseName,'Unverified course'),courseId:str(row?.courseId,null),country:str(row?.country,'Unverified'),region:str(row?.region,'Unverified'),stage:oneOf(PROSPECT_STAGES,row?.stage,'source_unavailable'),contactRole:str(row?.contactRole,'Role not recorded'),contactLocale:localeCode(row?.contactLocale),contactEmail:str(row?.contactEmail,null),contactPhone:str(row?.contactPhone,null),internalNotes:str(row?.internalNotes,null),owner:str(row?.owner,null),source:str(row?.source,'Source unavailable'),identifiedAt:isoDay(row?.identifiedAt),lastContactedAt:isoDay(row?.lastContactedAt),nextFollowUpAt:isoDay(row?.nextFollowUpAt),contract:normalizeContract(row?.contract),history:Array.isArray(row?.history)?row.history.map(normalizeContactEntry):[],demand:normalizeDemandEvidence(row?.demand)};}

/** Demand evidence carries its own attribution level; unverified evidence may never be claimed as fact. */
export function normalizeDemandEvidence(row){const attribution=oneOf(ATTRIBUTION_LEVELS,row?.attribution,'unavailable');const count=(v)=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;return{attribution,source:str(row?.source,'No attributed source'),observedFrom:isoDay(row?.observedFrom),observedUntil:isoDay(row?.observedUntil),searchInterest:count(row?.searchInterest),savedCourse:count(row?.savedCourse),bookingInterest:count(row?.bookingInterest),confirmedBookings:count(row?.confirmedBookings),playedRounds:count(row?.playedRounds)};}

/** Suppress any bucket that is below the aggregation threshold or not authoritatively attributed. */
export function discloseMetric(value,attribution,{requireAuthoritative=false}={}){if(requireAuthoritative&&attribution!=='authoritative')return{disclosed:false,value:null,reason:'not_authoritatively_attributed'};if(attribution==='unavailable')return{disclosed:false,value:null,reason:'source_unavailable'};if(typeof value!=='number')return{disclosed:false,value:null,reason:'not_recorded'};if(value<MIN_AGGREGATE_COUNT)return{disclosed:false,value:null,reason:'suppressed_low_volume'};return{disclosed:true,value,reason:'disclosed'};}

/**
 * Report whether the onboarding domain records a commission as effective. Fail-closed:
 * requires a signed agreement, a stated effective date covering `at`, and verified activation.
 * This never grants a commission — it only makes the recorded state visible to Admin.
 */
export function commissionState(contract,at){const c=normalizeContract(contract);const day=isoDay(at);const no=(reason)=>({effective:false,commissionBps:null,reason,authority:c.authority});if(!day)return no('invalid_evaluation_date');if(!COMMISSION_BEARING_STATES.includes(c.state))return no('contract_state_not_commission_bearing');if(!c.signed)return no('no_signed_agreement');if(!c.effectiveFrom)return no('no_effective_date');if(day<c.effectiveFrom)return no('not_yet_effective');if(c.effectiveUntil&&day>c.effectiveUntil)return no('agreement_lapsed');if(!c.activatedAt)return no('activation_not_verified');if(c.commissionBps===null)return no('no_agreed_rate');return{effective:true,commissionBps:c.commissionBps,reason:'signed_effective_and_activated',authority:c.authority};}

/** An unsigned course is never invoiceable; it receives opportunity evidence instead. */
export function invoiceEligibility(prospect,at){const p=normalizeProspect(prospect);const commission=commissionState(p.contract,at);return{invoiceAllowed:commission.effective,commissionBps:commission.commissionBps,reason:commission.reason,entitlement:commission.effective?'commission_invoice_permitted':'opportunity_evidence_only',notice:commission.effective?'A signed, effective-dated agreement with verified activation is recorded by the partner-onboarding domain.':'Unsigned course: opportunity evidence only. No invoice, charge or commission may be raised.'};}

/** Strip every internal-only field. All outbound artifacts must be built from this shape. */
export const WITHHELD_FREE_TEXT='Withheld — failed privacy screening';
export function shareableProspect(prospect){const p=normalizeProspect(prospect);const safe=(v)=>redactText(v,WITHHELD_FREE_TEXT);
  return{id:p.id,courseName:safe(p.courseName),courseId:p.courseId,country:safe(p.country),region:safe(p.region),stage:p.stage,contactRole:safe(p.contactRole),contactLocale:p.contactLocale,contract:{state:p.contract.state,signed:p.contract.signed,effectiveFrom:p.contract.effectiveFrom,pilotEndsAt:p.contract.pilotEndsAt},history:p.history.filter((h)=>h.visibility==='shareable').map((h)=>({...h,summary:safe(h.summary),recordedBy:safe(h.recordedBy)})),demandAttribution:p.demand.attribution,demandSource:safe(p.demand.source)};}

export function filterProspects(rows,{query='',stage='all',country='all',contract='all',locale='all',sort='recent'}={}){const n=query.trim().toLowerCase();return rows.filter((r)=>(!n||[r.courseName,r.country,r.region].some((v)=>String(v).toLowerCase().includes(n)))&&(stage==='all'||r.stage===stage)&&(country==='all'||r.country===country)&&(contract==='all'||r.contract.state===contract)&&(locale==='all'||r.contactLocale===locale)).sort((a,b)=>sort==='course'?a.courseName.localeCompare(b.courseName):sort==='follow_up'?String(a.nextFollowUpAt||'9999-12-31').localeCompare(String(b.nextFollowUpAt||'9999-12-31')):String(b.lastContactedAt||'').localeCompare(String(a.lastContactedAt||'')));}

export function acquisitionSummary(rows,at){return{total:rows.length,byStage:Object.fromEntries(PROSPECT_STAGES.map((s)=>[s,rows.filter((r)=>r.stage===s).length])),byContract:Object.fromEntries(CONTRACT_STATES.map((s)=>[s,rows.filter((r)=>r.contract.state===s).length])),invoiceable:rows.filter((r)=>invoiceEligibility(r,at).invoiceAllowed).length,opportunityEvidenceOnly:rows.filter((r)=>!invoiceEligibility(r,at).invoiceAllowed).length,followUpsDue:rows.filter((r)=>r.nextFollowUpAt&&isoDay(at)&&r.nextFollowUpAt<=at).length};}

/** Stages from which a prospect may be handed to the existing partner-intake pipeline. */
export const HANDOFF_READY_STAGES=Object.freeze(['meeting_held','pilot_discussion','agreement_drafting','onboarding_handoff','signed']);

/**
 * Prepare a conversion handoff into the recorded partner-application intake pipeline.
 * This creates no account, no submission and no partner status — staff provisioning stays authoritative.
 */
export function conversionHandoff(prospect){const p=normalizeProspect(prospect);const ready=HANDOFF_READY_STAGES.includes(p.stage);return{prospectId:p.id,courseName:p.courseName,courseId:p.courseId,contactLocale:p.contactLocale,eligible:ready,blockedReason:ready?null:`Stage "${p.stage}" is not a handoff-ready stage.`,targetPipeline:'partner_submissions',targetStatus:'draft',partnerStatusGranted:false,provisioningAuthority:'staff',submissionAvailable:false,notice:'Preview only. No submission, account, partner status or notification has been created.'};}
