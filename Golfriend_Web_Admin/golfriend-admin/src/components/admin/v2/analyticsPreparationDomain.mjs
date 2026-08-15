// Privacy-safe acquisition analytics and JHCC aggregate preparation — pure logic, no transport.
//
// JHCC receives aggregate oversight only: counts and approved dimensions.
//
// SUPPRESSION, CORRECTLY. An earlier version of this module counted withheld buckets and
// published the total once two were withheld. That was arithmetic theatre: the residual
// (total − Σ disclosed) IS the sum of the withheld buckets, and with tallied data every bucket
// is at least 1, so `residual == withheldCount` pins every withheld bucket to exactly 1. The
// per-bucket reason made it worse by publishing an inequality about each withheld value.
// The rules now are blunt and checkable:
//   1. A withheld bucket carries NO count and NO reason that discloses which side of the
//      threshold it sits on. One uniform `withheld` marker.
//   2. An exact total is published ONLY when nothing is withheld. Any withholding means no
//      residual is available to subtract.
//   3. The cohort minimum is fixed server-side. A caller-tunable threshold lets the same data
//      be requested at several thresholds and differenced back to exact values.
//   4. Bucket references are ORDINALS within the payload, not hashes. A 32-bit hash of a
//      country name is reversible against a candidate list in milliseconds; an ordinal is not
//      reversible at all, and still keeps withheld buckets distinct and unmerged.
import{containsPersonalData,MIN_AGGREGATE_COUNT}from'./courseAcquisitionModel.mjs';

export const ANALYTICS_SCHEMA='golfriend.admin.acquisition-analytics-preparation.v1';
export const ANALYTICS_VERSION=1;
export const JHCC_AGGREGATE_SCHEMA='golfriend.admin.jhcc-acquisition-aggregate.v3';
export const JHCC_AGGREGATE_VERSION=3;

/** Server-fixed. Deliberately NOT a parameter — see rule 3 above. */
export const COHORT_MINIMUM=MIN_AGGREGATE_COUNT;

/**
 * Approved dimensions and how their keys may be published.
 * `enum` keys come from a bounded server-controlled vocabulary and are safe to name.
 * `ordinal` keys are operator free text and are published only as positions.
 */
export const APPROVED_DIMENSIONS=Object.freeze([
  {id:'country',keyPolicy:'ordinal'},
  {id:'prospect_status',keyPolicy:'enum'},
  {id:'contract_state',keyPolicy:'enum'},
  {id:'source',keyPolicy:'enum'},
]);
export const APPROVED_DIMENSION_IDS=Object.freeze(APPROVED_DIMENSIONS.map((d)=>d.id));
export const FORBIDDEN_AGGREGATE_FIELDS=Object.freeze(['courseName','courseId','prospectId','prospectName','contact','contactEmail','contactPhone','history','narrative','message','note','rawId','memberId','userId']);

/** Bounded vocabularies. A value outside the vocabulary becomes `unknown`, never free text. */
const ENUM_VOCABULARY=Object.freeze({
  prospect_status:Object.freeze(['new','researching','qualified','contact_ready','approval_required','contact_queued','contacted','responded','interested','trial_offered','portal_onboarding','partner_review','active_partner','declined','do_not_contact','archived']),
  contract_state:Object.freeze(['none','pilot_proposed','pilot_active','agreement_sent','signed_pending_effective','effective','lapsed','declined','source_unavailable']),
  source:Object.freeze(['golf_api','portal_course_lead','admin_created_lead','existing_course_database','referral','other_approved_structured']),
});

const isoDay=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const isoStamp=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v)?v:null;
const wholeCount=(v)=>Number.isInteger(v)&&v>=0?v:null;

/**
 * Bucket a dimension. Deterministic: buckets are ordered by count descending then by key, so
 * the same population always produces the same payload regardless of row order.
 */
export function suppressBuckets(rawBuckets,{dimension='dimension',keyPolicy='ordinal'}={}){
  const source=rawBuckets&&typeof rawBuckets==='object'?rawBuckets:{};
  const entries=[];
  let malformed=0;
  for(const key of Object.keys(source)){
    const count=wholeCount(source[key]);
    // A malformed count is UNKNOWN, not zero. Counting it as zero would silently corrupt the
    // total; it is excluded and reported instead.
    if(count===null){malformed+=1;continue;}
    entries.push({key:String(key),count});
  }
  entries.sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
  const anyWithheld=entries.some((entry)=>entry.count<COHORT_MINIMUM);
  const buckets=entries.map((entry,index)=>{
    // Ordinals keep withheld buckets distinct and unmerged without being reversible.
    const ref=`${dimension}-${index+1}`;
    const withheld=entry.count<COHORT_MINIMUM;
    if(withheld)return Object.freeze({ref,disclosed:false,count:null,reason:'withheld'});
    return Object.freeze({ref,key:keyPolicy==='enum'?entry.key:null,disclosed:true,count:entry.count,reason:'disclosed'});
  });
  const withheldCount=buckets.filter((bucket)=>!bucket.disclosed).length;
  return Object.freeze({dimension,cohortMinimum:COHORT_MINIMUM,
    buckets:Object.freeze(buckets),
    bucketCount:buckets.length,
    withheldCount,
    malformedCount:malformed,
    // An exact total plus partial buckets is a subtraction oracle. No withholding, no total.
    total:anyWithheld?null:entries.reduce((sum,entry)=>sum+entry.count,0),
    totalWithheldReason:anyWithheld?'total_would_permit_recovery_of_a_withheld_bucket':null,
    notice:'Withheld buckets carry no count and no threshold hint, stay distinct by ordinal, and are never merged into a residual.'});
}

/** Tally a dimension over rows using a null-prototype map so `__proto__` cannot corrupt it. */
function tally(rows,pick,dimensionId){
  const counts=Object.create(null);
  const vocabulary=ENUM_VOCABULARY[dimensionId];
  for(const row of rows){
    const raw=pick(row);
    const key=vocabulary?(vocabulary.includes(raw)?raw:'unknown'):String(raw??'unknown');
    counts[key]=(counts[key]??0)+1;
  }
  return counts;
}

/**
 * Prepare the JHCC aggregate. Rows are reduced to tallies, so no identity or narrative can
 * survive by construction. Caller-supplied period and timestamp are VALIDATED, not echoed:
 * an unvalidated passthrough is how free text reaches an otherwise clean payload.
 */
export function prepareJhccAggregate({rows,period,generatedAt,opportunityReportsGenerated=0}={}){
  const safeRows=Array.isArray(rows)?rows:[];
  const dimensions=Object.fromEntries(APPROVED_DIMENSIONS.map(({id,keyPolicy})=>{
    const pick=id==='country'?(row)=>row?.country:id==='prospect_status'?(row)=>row?.status:id==='contract_state'?(row)=>row?.contractState:(row)=>row?.source;
    return[id,suppressBuckets(tally(safeRows,pick,id),{dimension:id,keyPolicy})];
  }));
  return Object.freeze({schema:JHCC_AGGREGATE_SCHEMA,version:JHCC_AGGREGATE_VERSION,
    generatedAt:isoStamp(generatedAt),
    period:Object.freeze({start:isoDay(period?.start),end:isoDay(period?.end)}),
    scope:'aggregate_oversight_only',
    prospectTotal:safeRows.length,
    opportunityReportsGenerated:wholeCount(opportunityReportsGenerated)??0,
    dimensions:Object.freeze(dimensions),
    cohortMinimum:COHORT_MINIMUM,
    notice:'Aggregate oversight only. No course name, prospect identity, contact detail, narrative, raw identifier, message content or history is included.'});
}

/** Structural AND value check: a forbidden key, or any personal data in any value, blocks it. */
export function aggregateIsMinimal(aggregate){
  const forbiddenFields=[];const personalValues=[];
  const walk=(value)=>{
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value)){if(FORBIDDEN_AGGREGATE_FIELDS.includes(key))forbiddenFields.push(key);walk(child);}return;}
    if((typeof value==='string'||typeof value==='number')&&containsPersonalData(value))personalValues.push(String(value).slice(0,24));
  };
  walk(aggregate);
  return{minimal:forbiddenFields.length===0&&personalValues.length===0,forbiddenFields,personalValueCount:personalValues.length};
}

/** Immutable preparation receipt. Preparation is never delivery. */
export function analyticsPreparationReceipt({aggregate,transmitterMounted=false,actorRef,at}){
  return Object.freeze({schema:'golfriend.admin.analytics-preparation-receipt.v1',version:1,
    receiptId:`anl-${aggregate.version}-${String(at??'').replace(/[^0-9]/g,'').slice(0,14)}`,
    aggregateSchema:aggregate.schema,aggregateVersion:aggregate.version,
    dimensionCount:Object.keys(aggregate.dimensions).length,
    transmitterMounted:transmitterMounted===true,
    deliveryState:transmitterMounted===true?'prepared_awaiting_transmission':'unconfigured',
    deliveryClaimed:false,
    at:isoStamp(at)??isoDay(at),
    notice:'Preparation receipt. The aggregate has been prepared, not transmitted; no delivery is claimed.'});
}
