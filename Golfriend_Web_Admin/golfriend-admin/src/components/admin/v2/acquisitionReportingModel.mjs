// Country- and course-level acquisition analytics + the Golfriend-to-JHCC reporting contract.
// Pure model: no I/O, no network, no transmitter. Delivery is fail-closed and stays
// unavailable until an approved, effective-dated authorization record is supplied.
//
// Golfriend Admin manages Golfriend. JHCC manages Jaidee Holding and receives oversight
// reporting only. This module defines the boundary; it does not implement or impersonate JHCC.
import{commissionState,CONTRACT_STATES,discloseMetric,MIN_AGGREGATE_COUNT,normalizeProspect,PROSPECT_STAGES}from'./courseAcquisitionModel.mjs';

export const ACQUISITION_REPORT_SCHEMA='golfriend.admin.course-acquisition-report.v1';
export const ACQUISITION_REPORT_VERSION=1;
export const JHCC_TRANSMISSION_SCHEMA='golfriend.admin.jhcc-acquisition-report-transmission.v1';
/** Field names that must never reach JHCC. Mirrors the recorded privacy-safe input contract. */
export const JHCC_PROHIBITED_FIELDS=Object.freeze(['memberId','memberIds','userId','userIds','uid','playerUid','email','emailAddress','phone','phoneNumber','ip','ipAddress','latitude','longitude','coordinates','deviceId','userAgent','messageBody','note','notes','internalNotes','payment','card','iban','contactEmail','contactPhone']);
// Value screens: an address-like string, an international or bare long telephone run, or a
// precise coordinate pair. ISO dates and timestamps are structural, not personal, and are skipped.
const PII_VALUE_PATTERNS=Object.freeze([/[\w.+-]+@[\w-]+\.[\w.]+/,/\+\d[\d\s()-]{6,}\d/,/\b\d{10,15}\b/,/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/]);
const ISO_LIKE=/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

const isoDay=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
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
  const rows=prospects.map(normalizeProspect);
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
  if(!authorization.contractRef)return no('no_contract_reference','An approved JHCC authorization must carry a contract reference.');
  if(!day)return no('invalid_evaluation_date','The evaluation date is not a valid ISO day.');
  const from=isoDay(authorization.effectiveFrom);
  if(!from)return no('no_effective_date','An approved JHCC authorization must carry an effective date.');
  if(day<from)return no('not_yet_effective','The approved JHCC authorization is not yet effective.');
  const until=isoDay(authorization.effectiveUntil);
  if(until&&day>until)return no('authorization_lapsed','The approved JHCC authorization has lapsed.');
  return{authorized:true,status:'authorized',reason:'approved_and_effective',contractRef:String(authorization.contractRef),notice:'An approved, effective-dated JHCC acquisition reporting contract is on record.'};
}

/** Recursively collect every key and string value so a payload can be screened before transmission. */
function walk(value,keys,strings){if(Array.isArray(value)){for(const item of value)walk(item,keys,strings);return;}
  if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value)){keys.push(key);walk(child,keys,strings);}return;}
  if(typeof value==='string')strings.push(value);}

/** Screen a payload against the recorded JHCC privacy contract. Fail-closed: any hit blocks it. */
export function validateJhccPayload(payload){const keys=[],strings=[];walk(payload,keys,strings);
  const prohibitedKeys=[...new Set(keys.filter((k)=>JHCC_PROHIBITED_FIELDS.includes(k)))];
  const prohibitedValues=strings.filter((s)=>!ISO_LIKE.test(s)&&PII_VALUE_PATTERNS.some((p)=>p.test(s)));
  return{valid:prohibitedKeys.length===0&&prohibitedValues.length===0,prohibitedKeys,prohibitedValueCount:prohibitedValues.length,contract:JHCC_TRANSMISSION_SCHEMA};}

/**
 * Build the deterministic acquisition report. The payload is screened against the JHCC
 * privacy contract before any delivery state is reported, and a payload that fails
 * screening can never be marked deliverable.
 */
export function buildAcquisitionReport({prospects,period,generatedAt,evaluationDate,authorization=null}){
  const analytics=acquisitionAnalytics(prospects,{evaluationDate});
  const payload={schema:ACQUISITION_REPORT_SCHEMA,version:ACQUISITION_REPORT_VERSION,generatedAt,period,analytics};
  const validation=validateJhccPayload(payload);
  const delivery=jhccDeliveryState(authorization,evaluationDate);
  return Object.freeze({...payload,validation,delivery:Object.freeze({...delivery,transmitter:null,deliverable:validation.valid&&delivery.authorized,lastSuccessfulAt:null}),boundary:'Golfriend Admin manages Golfriend. JHCC receives oversight reporting only and is never the booking engine or a payment processor.',limitations:['Acquisition analytics exclude any unattributed booking, played round or revenue figure.','Aggregates below the minimum are withheld rather than estimated.','No invoice, price or commission amount is included for an unsigned course.']});
}

const esc=(v)=>`"${String(v??'').replaceAll('"','""')}"`;
export function acquisitionReportToJson(report){return JSON.stringify(report,null,2);}
export function acquisitionReportToText(report){return[`Schema: ${report.schema} (version ${report.version})`,`Generated: ${report.generatedAt}`,`Period: ${report.period.start} to ${report.period.end}`,`Prospects: ${report.analytics.totals.prospects} across ${report.analytics.totals.countries} country/countries`,`Commission-effective: ${report.analytics.totals.commissionEffective} · opportunity evidence only: ${report.analytics.totals.opportunityEvidenceOnly}`,'',...report.analytics.countries.map((c)=>{const b=c.demand.bookingInterest;const value=b.disclosed?`${b.value}${b.partialCoverage?` (partial — ${b.coverage.contributing} of ${b.coverage.total} courses reporting)`:''}`:`withheld (${b.reason})`;return`${c.country}: ${c.prospects} prospect(s) | attribution ${c.demand.attribution} | booking interest ${value}`;}),'',`JHCC delivery: ${report.delivery.status} (${report.delivery.reason})`,report.delivery.notice,...report.limitations].join('\n');}
export function acquisitionReportToCsv(report){return[['country','prospects','commission_effective','attribution','booking_interest','booking_interest_state','booking_interest_coverage','confirmed_bookings_state'],...report.analytics.countries.map((c)=>[c.country,c.prospects,c.signed,c.demand.attribution,c.demand.bookingInterest.disclosed?c.demand.bookingInterest.value:'',c.demand.bookingInterest.reason,`${c.demand.bookingInterest.coverage.contributing}/${c.demand.bookingInterest.coverage.total}`,c.demand.confirmedBookings.reason])].map((row)=>row.map(esc).join(',')).join('\n');}
