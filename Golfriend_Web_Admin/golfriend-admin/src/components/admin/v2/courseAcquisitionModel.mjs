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
// `signed_pending_effective` is deliberately EXCLUDED: a state that records the agreement as
// pending cannot simultaneously report an effective commission.
export const COMMISSION_BEARING_STATES=Object.freeze(['pilot_active','effective']);
/** A commission rate must be positive and no more than 100%. The rate itself is the
 *  onboarding domain's to grant; this only rejects impossible values. */
export const MAX_COMMISSION_BPS=10000;
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
// KNOWN LIMIT: these catch structured identifiers. A bare personal name ("Somchai Prasert")
// is still not mechanically detectable and will pass. Free text is therefore minimized
// structurally (see OUTBOUND_FIELD_ALLOWLIST); an operator remains responsible for what is
// typed into a registry field.
export const PERSONAL_DATA_PATTERNS=Object.freeze([
  /[\w.+-]+@[\w-]+\.[\w.]+/,                                                    // address
  /[\w.+-]+\s*(?:\(at\)|\[at\]|\sat\s)\s*[\w.-]+\s*(?:\(dot\)|\[dot\]|\sdot\s|\.)\s*[a-z]{2,}/i, // obfuscated address
  /\+\d[\d\s()-]{5,}\d/,                                                        // international telephone prefix
  /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/,                                  // coordinate pair
  /\b\d{1,3}(\.\d{1,3}){3}\b/,                                                  // network address
  // Messaging handle. The separator is REQUIRED: an unanchored `ig` alternative would match
  // inside ordinary words such as "figure".
  /\b(?:line|wechat|whatsapp|telegram|instagram|ig)\b\s*[:：]\s*@?[\w.]{3,}/i,
  /(?:^|[\s(])@[A-Za-z][\w.]{2,}/,                                              // bare handle
]);
const ISO_DAY_OR_STAMP=/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
const THAI_DIGITS=/[๐-๙]/g,ARABIC_INDIC=/[٠-٩]/g,EXT_ARABIC_INDIC=/[۰-۹]/g;
/** Fold width and script variants so full-width `＠` and Thai `๐๘๑` cannot evade the patterns. */
const foldDigitsAndWidth=(text)=>text.normalize('NFKC')
  .replace(THAI_DIGITS,(d)=>String(d.charCodeAt(0)-0x0E50))
  .replace(ARABIC_INDIC,(d)=>String(d.charCodeAt(0)-0x0660))
  .replace(EXT_ARABIC_INDIC,(d)=>String(d.charCodeAt(0)-0x06F0));
/**
 * A telephone / account / card number written with any separators. Counting digits inside a
 * run beats a contiguity rule: `081-234-5678` and `4111 1111 1111 1111` both qualify, and
 * there is no upper bound that a longer number could step over. ISO dates are removed first
 * so an adjacent date pair cannot masquerade as a long number.
 */
const LONG_DIGIT_RUN_MIN=9;
function hasLongDigitRun(text){const stripped=text.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g,' ');
  for(const run of stripped.match(/[\d][\d\s().-]*[\d]/g)||[]){if((run.match(/\d/g)||[]).length>=LONG_DIGIT_RUN_MIN)return true;}
  return false;}
/** True when a value looks like it carries personal data. ISO dates are structural, not personal. */
export function containsPersonalData(value){
  if(typeof value!=='string'&&typeof value!=='number')return false;
  const raw=String(value);
  if(ISO_DAY_OR_STAMP.test(raw))return false;
  const text=foldDigitsAndWidth(raw);
  return PERSONAL_DATA_PATTERNS.some((p)=>p.test(text))||hasLongDigitRun(text);}
/** Replace free text that fails screening rather than emitting it. */
export function redactText(value,fallback){return containsPersonalData(value)?fallback:value;}

// --- non-identifying surrogates -------------------------------------------
// Redacting to one shared constant would MERGE distinct values into a single bucket, which
// can un-suppress an aggregate the minimum-count rule was meant to withhold. Every withheld
// value therefore keeps a stable, non-identifying surrogate so distinct stays distinct.
const fnv1a=(text)=>{let hash=0x811c9dc5;for(let i=0;i<text.length;i+=1){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}return hash.toString(36);};
export function surrogateRef(raw,prefix='ref'){return `${prefix}-${fnv1a(String(raw))}`;}
/** Keep an identifier when it is clean; otherwise emit a stable surrogate, never the text. */
export function safeIdentifier(raw,prefix='ref'){if(raw===null||raw===undefined)return null;return containsPersonalData(raw)?surrogateRef(raw,prefix):String(raw);}
/** Keep a label when clean; otherwise withhold it while preserving its distinctness. */
export function safeLabel(raw){return containsPersonalData(raw)?`${WITHHELD_FREE_TEXT} (${surrogateRef(raw)})`:raw;}
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

/** Normalize a prospect row. Internal-only fields are retained here but stripped by `outboundProspect`. */
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
export function commissionState(contract,at){const c=normalizeContract(contract);const day=isoDay(at);const no=(reason)=>({effective:false,commissionBps:null,reason,authority:c.authority});if(!day)return no('invalid_evaluation_date');if(!COMMISSION_BEARING_STATES.includes(c.state))return no('contract_state_not_commission_bearing');if(!c.signed)return no('no_signed_agreement');if(!c.effectiveFrom)return no('no_effective_date');if(day<c.effectiveFrom)return no('not_yet_effective');if(c.effectiveUntil&&day>c.effectiveUntil)return no('agreement_lapsed');if(!c.activatedAt)return no('activation_not_verified');
  // A pilot that has run past its recorded end date no longer carries a commission.
  if(c.pilotEndsAt&&day>c.pilotEndsAt&&c.state==='pilot_active')return no('pilot_window_closed');
  if(c.commissionBps===null||c.commissionBps<=0)return no('no_agreed_rate');
  if(c.commissionBps>MAX_COMMISSION_BPS)return no('implausible_rate');
  return{effective:true,commissionBps:c.commissionBps,reason:'signed_effective_and_activated',authority:c.authority};}

/** An unsigned course is never invoiceable; it receives opportunity evidence instead. */
export function invoiceEligibility(prospect,at){const p=normalizeProspect(prospect);const commission=commissionState(p.contract,at);return{invoiceAllowed:commission.effective,commissionBps:commission.commissionBps,reason:commission.reason,entitlement:commission.effective?'commission_invoice_permitted':'opportunity_evidence_only',notice:commission.effective?'A signed, effective-dated agreement with verified activation is recorded by the partner-onboarding domain.':'Unsigned course: opportunity evidence only. No invoice, charge or commission may be raised.'};}

/** Strip every internal-only field. All outbound artifacts must be built from this shape. */
export const WITHHELD_FREE_TEXT='Withheld — failed privacy screening';

// --- outbound field allowlist (Founder decision, 2026-08-15) ---------------
// Outbound opportunity reports, JHCC payloads and automated outreach artifacts carry
// ALLOWLISTED STRUCTURED FIELDS ONLY. Free-text registry content and contact-history
// narrative never cross this boundary; contact history is reduced to structured counts
// and dates. A personal name may appear only via `recipientContact`, and only in a draft
// message awaiting human approval — never in analytics or aggregated evidence.
export const OUTBOUND_FIELD_ALLOWLIST=Object.freeze(['prospectId','courseId','courseName','country','region','stage','contractState','contractSigned','contractEffectiveFrom','pilotEndsAt','contactLocale','demandAttribution','contactCount','lastContactedAt','nextFollowUpAt']);
/** Free-text fields that must never appear in an outbound artifact in any form. */
export const OUTBOUND_PROHIBITED_FIELDS=Object.freeze([...INTERNAL_ONLY_FIELDS,'contactRole','history','demandSource','summary','recordedBy','collaboration']);

/**
 * The ONLY projection permitted to cross an outbound boundary.
 * Structured fields only; every retained string is screened, and anything that fails is
 * withheld rather than emitted. Contact history becomes a count and a date, never narrative.
 */
export function outboundProspect(prospect){const p=normalizeProspect(prospect);const safe=safeLabel;
  // Identifiers are operator-typed too: they are screened and surrogated, never emitted raw.
  return Object.freeze({prospectId:safeIdentifier(p.id,'prospect'),courseId:safeIdentifier(p.courseId,'course'),courseName:safe(p.courseName),country:safe(p.country),region:safe(p.region),stage:p.stage,contractState:p.contract.state,contractSigned:p.contract.signed,contractEffectiveFrom:p.contract.effectiveFrom,pilotEndsAt:p.contract.pilotEndsAt,contactLocale:p.contactLocale,demandAttribution:p.demand.attribution,contactCount:p.history.length,lastContactedAt:p.lastContactedAt,nextFollowUpAt:p.nextFollowUpAt});}

/**
 * The explicitly selected recipient/contact field for a FUTURE HUMAN-APPROVED message.
 * Permitted in a draft only. Never call this from analytics or aggregated evidence.
 */
export function recipientContact(prospect){const p=normalizeProspect(prospect);
  return{prospectId:p.id,contactRole:redactText(p.contactRole,WITHHELD_FREE_TEXT),contactLocale:p.contactLocale,selectionRequired:true,approvalRequired:true,notice:'Recipient detail is included for human approval before any message is sent. It must never enter analytics or aggregated evidence.'};}
// `shareableProspect` was REMOVED after the 2026-08-15 Founder ruling. It carried contact-history
// narrative, contactRole and the demand source description — none of which may leave the registry.
// `outboundProspect` is the only outbound projection; do not reintroduce a second one.

export function filterProspects(rows,{query='',stage='all',country='all',contract='all',locale='all',sort='recent'}={}){const n=query.trim().toLowerCase();return rows.filter((r)=>(!n||[r.courseName,r.country,r.region].some((v)=>String(v).toLowerCase().includes(n)))&&(stage==='all'||r.stage===stage)&&(country==='all'||r.country===country)&&(contract==='all'||r.contract.state===contract)&&(locale==='all'||r.contactLocale===locale)).sort((a,b)=>sort==='course'?a.courseName.localeCompare(b.courseName):sort==='follow_up'?String(a.nextFollowUpAt||'9999-12-31').localeCompare(String(b.nextFollowUpAt||'9999-12-31')):String(b.lastContactedAt||'').localeCompare(String(a.lastContactedAt||'')));}

export function acquisitionSummary(rows,at){return{total:rows.length,byStage:Object.fromEntries(PROSPECT_STAGES.map((s)=>[s,rows.filter((r)=>r.stage===s).length])),byContract:Object.fromEntries(CONTRACT_STATES.map((s)=>[s,rows.filter((r)=>r.contract.state===s).length])),invoiceable:rows.filter((r)=>invoiceEligibility(r,at).invoiceAllowed).length,opportunityEvidenceOnly:rows.filter((r)=>!invoiceEligibility(r,at).invoiceAllowed).length,followUpsDue:rows.filter((r)=>r.nextFollowUpAt&&isoDay(at)&&r.nextFollowUpAt<=at).length};}

/** Stages from which a prospect may be handed to the existing partner-intake pipeline. */
export const HANDOFF_READY_STAGES=Object.freeze(['meeting_held','pilot_discussion','agreement_drafting','onboarding_handoff','signed']);

/**
 * Prepare a conversion handoff into the recorded partner-application intake pipeline.
 * This creates no account, no submission and no partner status — staff provisioning stays authoritative.
 */
export function conversionHandoff(prospect){const p=normalizeProspect(prospect);const ready=HANDOFF_READY_STAGES.includes(p.stage);return{prospectId:safeIdentifier(p.id,'prospect'),courseName:safeLabel(p.courseName),courseId:safeIdentifier(p.courseId,'course'),contactLocale:p.contactLocale,eligible:ready,blockedReason:ready?null:`Stage "${p.stage}" is not a handoff-ready stage.`,targetPipeline:'partner_submissions',targetStatus:'draft',partnerStatusGranted:false,provisioningAuthority:'staff',submissionAvailable:false,notice:'Preview only. No submission, account, partner status or notification has been created.'};}
