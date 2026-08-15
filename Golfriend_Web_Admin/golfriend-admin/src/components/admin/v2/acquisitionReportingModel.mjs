// Country- and course-level acquisition analytics + the Golfriend-to-JHCC reporting contract.
// Pure model: no I/O, no network, no transmitter. Delivery is fail-closed and stays
// unavailable until an approved, effective-dated authorization record is supplied.
//
// Golfriend Admin manages Golfriend. JHCC manages Jaidee Holding and receives oversight
// reporting only. This module defines the boundary; it does not implement or impersonate JHCC.
import{commissionState,containsPersonalData,CONTRACT_STATES,discloseMetric,MIN_AGGREGATE_COUNT,normalizeProspect,outboundProspect,PROSPECT_STAGES}from'./courseAcquisitionModel.mjs';

export const ACQUISITION_REPORT_SCHEMA='golfriend.admin.course-acquisition-report.v1';
export const ACQUISITION_REPORT_VERSION=1;
export const JHCC_TRANSMISSION_SCHEMA='golfriend.admin.jhcc-acquisition-report-transmission.v1';
/** Field names that must never reach JHCC. Mirrors the recorded privacy-safe input contract. */
export const JHCC_PROHIBITED_FIELDS=Object.freeze(['memberId','memberIds','userId','userIds','uid','playerUid','email','emailAddress','phone','phoneNumber','mobile','ip','ipAddress','lat','latitude','lng','long','longitude','geo','coordinates','location','address','residence','personName','fullName','firstName','lastName','deviceId','userAgent','messageBody','note','notes','internalNotes','payment','card','iban','contactEmail','contactPhone']);
/** Compare keys ignoring case and separators so `member_id` and `Member-Id` are caught too. */
const keyId=(key)=>String(key).toLowerCase().replace(/[_\-\s]/g,'');
const PROHIBITED_KEY_IDS=new Set(JHCC_PROHIBITED_FIELDS.map(keyId));

const isoDay=(v)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const parsed=new Date(`${v}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v?v:null;};
/** A usable transmitter is an object (or function) exposing a `transmit` function. Nothing else. */
export const isTransmitter=(value)=>Boolean(value)&&(typeof value==='object'||typeof value==='function')&&typeof value.transmit==='function';
const deepFreeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};
const sumOrNull=(values)=>{const present=values.filter((v)=>typeof v==='number');return present.length?present.reduce((a,b)=>a+b,0):null;};
/** Weakest attribution wins: a rollup is only as trustworthy as its least-attributed input. */
const rollupAttribution=(levels)=>levels.includes('unavailable')||levels.length===0?'unavailable':levels.includes('unverified')?'unverified':'authoritative';

// A rollup states its own coverage: a total built from a subset of the courses is
// reported as partial rather than presented as a complete figure for the group.
const demandRollup=(rows)=>{const attribution=rollupAttribution(rows.map((r)=>r.demand.attribution));
  const metric=(key,requireAuthoritative)=>{const values=rows.map((r)=>r.demand[key]);const covered=values.filter((v)=>typeof v==='number').length;const disclosure=discloseMetric(sumOrNull(values),attribution,{requireAuthoritative});return{...disclosure,coverage:{contributing:covered,total:rows.length},partialCoverage:disclosure.disclosed&&covered<rows.length};};
  return{attribution,searchInterest:metric('searchInterest',false),savedCourse:metric('savedCourse',false),bookingInterest:metric('bookingInterest',false),confirmedBookings:metric('confirmedBookings',true),playedRounds:metric('playedRounds',true)};};

const stageCounts=(rows)=>Object.fromEntries(PROSPECT_STAGES.filter((s)=>rows.some((r)=>r.stage===s)).map((s)=>[s,rows.filter((r)=>r.stage===s).length]));
const contractCounts=(rows)=>Object.fromEntries(CONTRACT_STATES.filter((s)=>rows.some((r)=>r.contract.state===s)).map((s)=>[s,rows.filter((r)=>r.contract.state===s).length]));

/**
 * Country- and course-level acquisition analytics.
 * Course and country counts are counts of BUSINESSES, reported plainly.
 * Golfer demand aggregates pass through suppression and attribution gating.
 */
export function acquisitionAnalytics(prospects,{evaluationDate}={}){
  // Registry free text may carry personal data, so analytics rows are built from the
  // screened projection — the same one every other outbound artifact uses.
  const rows=prospects.map((p)=>{const n=normalizeProspect(p),o=outboundProspect(p);return{...n,courseName:o.courseName,country:o.country,region:o.region};});
  const countries=[...new Set(rows.map((r)=>r.country))].sort().map((country)=>{const inCountry=rows.filter((r)=>r.country===country);return{country,prospects:inCountry.length,signed:inCountry.filter((r)=>commissionState(r.contract,evaluationDate).effective).length,byStage:stageCounts(inCountry),byContract:contractCounts(inCountry),demand:demandRollup(inCountry)};});
  const courses=rows.map((r)=>{const commission=commissionState(r.contract,evaluationDate);return{prospectId:r.id,courseName:r.courseName,courseId:r.courseId,country:r.country,region:r.region,stage:r.stage,contractState:r.contract.state,commissionEffective:commission.effective,commissionReason:commission.reason,lastContactedAt:r.lastContactedAt,nextFollowUpAt:r.nextFollowUpAt,contactCount:r.history.length,demand:demandRollup([r])};});
  return{evaluationDate:isoDay(evaluationDate),totals:{prospects:rows.length,countries:countries.length,commissionEffective:courses.filter((c)=>c.commissionEffective).length,opportunityEvidenceOnly:courses.filter((c)=>!c.commissionEffective).length},countries,courses,minimumAggregate:MIN_AGGREGATE_COUNT};
}

/**
 * Fail-closed delivery state for the Golfriend-to-JHCC acquisition reporting contract.
 * Automatic delivery requires an approved authorization record with a contract reference
 * and an effective date covering the evaluation day. Absent that, delivery is unavailable.
 */
export function jhccDeliveryState(authorization,at){const day=isoDay(at);const no=(reason,notice)=>({authorized:false,status:'unavailable',reason,contractRef:null,notice});
  if(!authorization)return no('no_authorization_record','Automatic JHCC acquisition delivery awaiting an approved reporting contract.');
  if(authorization.approved!==true)return no('authorization_not_approved','A JHCC acquisition reporting contract exists but is not approved.');
  if(typeof authorization.contractRef!=='string'||authorization.contractRef.trim().length===0)return no('no_contract_reference','An approved JHCC authorization must carry a contract reference.');
  if(!day)return no('invalid_evaluation_date','The evaluation date is not a valid ISO day.');
  const from=isoDay(authorization.effectiveFrom);
  if(!from)return no('no_effective_date','An approved JHCC authorization must carry an effective date.');
  if(day<from)return no('not_yet_effective','The approved JHCC authorization is not yet effective.');
  const until=isoDay(authorization.effectiveUntil);
  if(until&&day>until)return no('authorization_lapsed','The approved JHCC authorization has lapsed.');
  return{authorized:true,status:'authorized',reason:'approved_and_effective',contractRef:authorization.contractRef.trim(),notice:'An approved, effective-dated JHCC acquisition reporting contract is on record.'};
}

// --- Founder-approved JHCC acquisition reporting contract (2026-08-15) ----
// Aggregate oversight only. Course-level identity, free text and contact history are OUT.
export const JHCC_ACQUISITION_ALLOWED_SECTIONS=Object.freeze(['prospectCounts','prospectStatus','countryCoverage','courseCoverage','opportunityReportCounts','portalConversionStatus','dataCompleteness']);
export const JHCC_ACQUISITION_AUTHORIZATION=Object.freeze({approved:true,contractRef:'GOLFRIEND-JHCC-ACQUISITION-2026-08-15',effectiveFrom:'2026-08-15',effectiveUntil:null,scope:'aggregate_oversight_only',allowedSections:JHCC_ACQUISITION_ALLOWED_SECTIONS,prohibited:Object.freeze(['personal names','email','phone','coordinates','IP','free text','private notes','booking identity','raw course-contact history']),approvedBy:'Founder',notice:'Aggregate oversight only. Transmission stays disabled until an approved transmitter is mounted.'});

/**
 * Project an acquisition report down to the Founder-approved aggregate JHCC sections.
 * Counts only — no course name, region, contact history, free text or identity of any kind.
 */
export function buildJhccAcquisitionPayload(report,{opportunityReportsGenerated=0}={}){
  const a=report.analytics;
  const countBy=(key)=>Object.fromEntries(a.courses.reduce((map,c)=>map.set(c[key],(map.get(c[key])||0)+1),new Map()));
  // The period is caller-supplied, so only its two validated ISO days are carried — never a
  // caller-attached label or any other free-text field riding along on the object.
  return deepFreeze({schema:JHCC_TRANSMISSION_SCHEMA,version:1,generatedAt:report.generatedAt,period:{start:isoDay(report.period?.start),end:isoDay(report.period?.end)},scope:'aggregate_oversight_only',
    prospectCounts:{total:a.totals.prospects,commissionEffective:a.totals.commissionEffective,opportunityEvidenceOnly:a.totals.opportunityEvidenceOnly},
    prospectStatus:countBy('stage'),
    countryCoverage:{countries:a.totals.countries,prospectsPerCountry:Object.fromEntries(a.countries.map((c)=>[c.country,c.prospects]))},
    courseCoverage:{coursesTracked:a.courses.length,coursesWithCourseId:a.courses.filter((c)=>c.courseId).length},
    opportunityReportCounts:{generated:Number.isInteger(opportunityReportsGenerated)&&opportunityReportsGenerated>=0?opportunityReportsGenerated:0},
    portalConversionStatus:countBy('contractState'),
    dataCompleteness:{minimumAggregate:a.minimumAggregate,partialCoverageCountries:a.countries.filter((c)=>Object.values(c.demand).some((m)=>m&&m.partialCoverage)).length,unattributedCountries:a.countries.filter((c)=>c.demand.attribution!=='authoritative').length},
    limitations:report.limitations});
}

/** Collect every key and every scalar (strings AND numbers) so a payload can be screened. */
function walk(value,keys,scalars){if(Array.isArray(value)){for(const item of value)walk(item,keys,scalars);return;}
  if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value)){keys.push(key);walk(child,keys,scalars);}return;}
  if(typeof value==='string'||typeof value==='number')scalars.push(value);}

/**
 * Screen a payload against the recorded JHCC privacy contract. Fail-closed: any hit blocks it.
 * The payload is materialized through JSON first, so what is screened is exactly what would be
 * transmitted — a `toJSON` that injects data after the walk cannot slip past.
 */
export function validateJhccPayload(payload){
  let materialized;
  try{materialized=JSON.parse(JSON.stringify(payload??null));}
  catch{return{valid:false,prohibitedKeys:['<unserializable payload>'],prohibitedValueCount:0,screened:null,contract:JHCC_TRANSMISSION_SCHEMA};}
  const keys=[],scalars=[];walk(materialized,keys,scalars);
  // Keys are screened BOTH against the prohibited-name list and for personal data, because a
  // key can carry text just as a value can.
  const prohibitedKeys=[...new Set(keys.filter((k)=>PROHIBITED_KEY_IDS.has(keyId(k))||containsPersonalData(k)))];
  const prohibitedValues=scalars.filter(containsPersonalData);
  const valid=prohibitedKeys.length===0&&prohibitedValues.length===0;
  // `screened` is the exact object that was inspected. A caller must transmit THIS, never its
  // own reference: an unstable `toJSON` would otherwise serialize differently after the check.
  return{valid,prohibitedKeys,prohibitedValueCount:prohibitedValues.length,screened:valid?deepFreeze(materialized):null,contract:JHCC_TRANSMISSION_SCHEMA};}

/**
 * Build the deterministic acquisition report. The payload is screened against the JHCC
 * privacy contract before any delivery state is reported, and a payload that fails
 * screening can never be marked deliverable.
 */
export function buildAcquisitionReport({prospects,period,generatedAt,evaluationDate,authorization=null,transmitter=null}){
  const analytics=acquisitionAnalytics(prospects,{evaluationDate});
  const payload={schema:ACQUISITION_REPORT_SCHEMA,version:ACQUISITION_REPORT_VERSION,generatedAt,period,analytics};
  const validation=validateJhccPayload(payload);
  const delivery=jhccDeliveryState(authorization,evaluationDate);
  // Deep-frozen: a screened-then-mutated payload must not be able to keep a deliverable flag
  // that was computed before the mutation.
  // Transmission requires ALL THREE: a clean privacy screen, an approved effective-dated
  // authorization, and a mounted transmitter. The transmitter is null in this build, so
  // `deliverable` is false even though the Founder authorization is now on record.
  // A transmitter counts as mounted only if it is an object exposing a `transmit` function.
  // `false`, `0`, `''` and a bare string are NOT transmitters and must not read as available.
  const transmitterMounted=isTransmitter(transmitter);
  return deepFreeze({...payload,validation,delivery:{...delivery,transmitter:transmitterMounted?'mounted':null,transmitterMounted,deliverable:validation.valid&&delivery.authorized&&transmitterMounted,lastSuccessfulAt:null},boundary:'Golfriend Admin manages Golfriend. JHCC receives oversight reporting only and is never the booking engine or a payment processor.',limitations:['Acquisition analytics exclude any unattributed booking, played round or revenue figure.','Aggregates below the minimum are withheld rather than estimated.','No invoice, price or commission amount is included for an unsigned course.']});
}

const esc=(v)=>`"${String(v??'').replaceAll('"','""')}"`;
export function acquisitionReportToJson(report){return JSON.stringify(report,null,2);}
export function acquisitionReportToText(report){return[`Schema: ${report.schema} (version ${report.version})`,`Generated: ${report.generatedAt}`,`Period: ${report.period.start} to ${report.period.end}`,`Prospects: ${report.analytics.totals.prospects} across ${report.analytics.totals.countries} country/countries`,`Commission-effective: ${report.analytics.totals.commissionEffective} · opportunity evidence only: ${report.analytics.totals.opportunityEvidenceOnly}`,'',...report.analytics.countries.map((c)=>{const b=c.demand.bookingInterest;const value=b.disclosed?`${b.value}${b.partialCoverage?` (partial — ${b.coverage.contributing} of ${b.coverage.total} courses reporting)`:''}`:`withheld (${b.reason})`;return`${c.country}: ${c.prospects} prospect(s) | attribution ${c.demand.attribution} | booking interest ${value}`;}),'',`JHCC delivery: ${report.delivery.status} (${report.delivery.reason})`,report.delivery.notice,...report.limitations].join('\n');}
export function acquisitionReportToCsv(report){return[['country','prospects','commission_effective','attribution','booking_interest','booking_interest_state','booking_interest_coverage','confirmed_bookings','confirmed_bookings_state'],...report.analytics.countries.map((c)=>[c.country,c.prospects,c.signed,c.demand.attribution,c.demand.bookingInterest.disclosed?c.demand.bookingInterest.value:'',c.demand.bookingInterest.reason,`${c.demand.bookingInterest.coverage.contributing}/${c.demand.bookingInterest.coverage.total}`,c.demand.confirmedBookings.disclosed?c.demand.confirmedBookings.value:'',c.demand.confirmedBookings.reason])].map((row)=>row.map(esc).join(',')).join('\n');}
