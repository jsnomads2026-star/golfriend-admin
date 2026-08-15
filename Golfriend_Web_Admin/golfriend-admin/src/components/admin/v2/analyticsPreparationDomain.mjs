// Privacy-safe acquisition analytics and JHCC aggregate preparation — pure logic, no transport.
//
// JHCC receives aggregate oversight only: counts and approved dimensions. No course names,
// prospect names, contact details, narratives, raw identifiers, message content or history.
//
// SUPPRESSION IS TWO-STAGE, and the second stage is the one that is easy to miss. Withholding
// every bucket below the cohort minimum is not enough: if exactly ONE bucket is suppressed, a
// reader subtracts the published buckets from the published total and recovers it exactly.
// A complementary suppression is therefore applied so at least two buckets are always withheld
// together, and suppressed buckets keep DISTINCT surrogates rather than being merged into one
// residual — merging them would itself publish their sum.
import{MIN_AGGREGATE_COUNT,surrogateRef}from'./courseAcquisitionModel.mjs';

export const ANALYTICS_SCHEMA='golfriend.admin.acquisition-analytics-preparation.v1';
export const ANALYTICS_VERSION=1;
export const JHCC_AGGREGATE_SCHEMA='golfriend.admin.jhcc-acquisition-aggregate.v2';
export const JHCC_AGGREGATE_VERSION=2;

/** The only dimensions JHCC may receive. A dimension not named here is not prepared. */
export const APPROVED_DIMENSIONS=Object.freeze(['country','prospect_status','contract_state','source']);
/** Field names that must never appear in a prepared aggregate, checked structurally. */
export const FORBIDDEN_AGGREGATE_FIELDS=Object.freeze(['courseName','courseId','prospectId','prospectName','contact','contactEmail','contactPhone','history','narrative','message','note','rawId','memberId','userId']);

const int=(v)=>Number.isInteger(v)&&v>=0?v:0;

/**
 * Bucket a dimension with two-stage suppression.
 * Returns buckets keyed by a stable surrogate, each either disclosed with a count or withheld
 * with a reason. `total` is published only when it cannot be used to recover a withheld value.
 */
export function suppressBuckets(rawBuckets,{cohortMinimum=MIN_AGGREGATE_COUNT,dimension='dimension'}={}){
  const minimum=Number.isInteger(cohortMinimum)&&cohortMinimum>=MIN_AGGREGATE_COUNT?cohortMinimum:MIN_AGGREGATE_COUNT;
  const entries=Object.entries(rawBuckets??{}).map(([key,count])=>({key,count:int(count),
    // Distinct surrogate per bucket: withheld buckets stay separable without ever naming the
    // dimension value, and two withheld buckets never collapse into one.
    ref:surrogateRef(`${dimension}|${key}`,'bkt')}));
  const grandTotal=entries.reduce((sum,entry)=>sum+entry.count,0);
  const suppressed=new Set(entries.filter((entry)=>entry.count<minimum).map((entry)=>entry.key));
  // Complementary suppression: one withheld bucket is recoverable by subtraction, so withhold
  // the next-smallest disclosed bucket as well.
  if(suppressed.size===1){
    const next=entries.filter((entry)=>!suppressed.has(entry.key)).sort((a,b)=>a.count-b.count)[0];
    if(next)suppressed.add(next.key);
  }
  const buckets=entries.map((entry)=>Object.freeze(suppressed.has(entry.key)
    ?{ref:entry.ref,disclosed:false,count:null,reason:entry.count<minimum?'below_cohort_minimum':'complementary_suppression'}
    :{ref:entry.ref,disclosed:true,count:entry.count,reason:'disclosed'}));
  // With a single withheld bucket the total is a subtraction oracle. With none, or with two or
  // more, publishing the total reveals no individual value.
  const withheldCount=buckets.filter((bucket)=>!bucket.disclosed).length;
  const totalPublishable=withheldCount===0||withheldCount>=2;
  return Object.freeze({dimension,cohortMinimum:minimum,
    buckets:Object.freeze(buckets),
    bucketCount:buckets.length,
    withheldCount,
    total:totalPublishable?grandTotal:null,
    totalWithheldReason:totalPublishable?null:'total_would_reveal_a_withheld_bucket',
    notice:'Withheld buckets keep distinct surrogates and are never merged into a residual value.'});
}

/**
 * Prepare the JHCC aggregate. Counts and approved dimensions only — the input rows are reduced
 * to tallies here, so no identity or narrative can survive into the payload by construction.
 */
export function prepareJhccAggregate({rows=[],period,generatedAt,cohortMinimum=MIN_AGGREGATE_COUNT,opportunityReportsGenerated=0}={}){
  const tally=(pick)=>rows.reduce((map,row)=>{const key=String(pick(row)??'unknown');map[key]=(map[key]??0)+1;return map;},{});
  const dimensions=Object.fromEntries(APPROVED_DIMENSIONS.map((dimension)=>{
    const pick=dimension==='country'?(row)=>row.country:dimension==='prospect_status'?(row)=>row.status:dimension==='contract_state'?(row)=>row.contractState:(row)=>row.source;
    return[dimension,suppressBuckets(tally(pick),{cohortMinimum,dimension})];
  }));
  return Object.freeze({schema:JHCC_AGGREGATE_SCHEMA,version:JHCC_AGGREGATE_VERSION,generatedAt,
    period:Object.freeze({start:period?.start??null,end:period?.end??null}),
    scope:'aggregate_oversight_only',
    prospectTotal:rows.length,
    opportunityReportsGenerated:int(opportunityReportsGenerated),
    dimensions:Object.freeze(dimensions),
    cohortMinimum:Number.isInteger(cohortMinimum)&&cohortMinimum>=MIN_AGGREGATE_COUNT?cohortMinimum:MIN_AGGREGATE_COUNT,
    notice:'Aggregate oversight only. No course name, prospect identity, contact detail, narrative, raw identifier, message content or history is included.'});
}

/** Structural check that a prepared aggregate carries no forbidden field and no free text. */
export function aggregateIsMinimal(aggregate){
  const keys=[];
  const walk=(value)=>{if(Array.isArray(value)){value.forEach(walk);return;}
    if(value&&typeof value==='object'){for(const[key,child]of Object.entries(value)){keys.push(key);walk(child);}}};
  walk(aggregate);
  const forbidden=keys.filter((key)=>FORBIDDEN_AGGREGATE_FIELDS.includes(key));
  return{minimal:forbidden.length===0,forbiddenFields:forbidden};
}

/** Immutable preparation receipt. Preparation is never delivery. */
export function analyticsPreparationReceipt({aggregate,transmitterMounted=false,actorRef,at}){
  return Object.freeze({schema:'golfriend.admin.analytics-preparation-receipt.v1',version:1,
    receiptId:surrogateRef(`${aggregate.schema}|${aggregate.generatedAt}|${at}`,'anl'),
    aggregateSchema:aggregate.schema,aggregateVersion:aggregate.version,
    dimensionCount:Object.keys(aggregate.dimensions).length,
    // Preparation state, never delivery state. A missing transmitter stays unconfigured.
    transmitterMounted:transmitterMounted===true,
    deliveryState:transmitterMounted===true?'prepared_awaiting_transmission':'unconfigured',
    deliveryClaimed:false,
    actorRef:surrogateRef(String(actorRef??''),'actor'),at,
    notice:'Preparation receipt. The aggregate has been prepared, not transmitted; no delivery is claimed.'});
}
