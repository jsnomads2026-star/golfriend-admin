// Opportunity/evidence generation domain — pure logic, no I/O, no adapter, no transport.
//
// Produces INTERNAL evidence from authoritative counts and structured facts. It generates no
// invoice, no commission claim and no legal proof of play.
//
// THE PLAY CLAIM IS THE SHARP EDGE. Saying "a golfer played here" is a factual assertion about
// a person's movement. Search, course selection, Match activity, a booking request, location,
// a check-in and a user's own statement are each evidence of INTEREST or INTENT, never of play.
// Until an approved played-evidence authority exists, played rounds are withheld and counted
// as zero — not estimated, not inferred, not "probably".
import{containsPersonalData,discloseMetric,MIN_AGGREGATE_COUNT,surrogateRef}from'./courseAcquisitionModel.mjs';

export const EVIDENCE_SCHEMA='golfriend.admin.opportunity-evidence.v2';
export const EVIDENCE_VERSION=2;

/** Signals this domain can report, and what each is actually evidence OF. */
export const EVIDENCE_SIGNALS=Object.freeze([
  {id:'member_interest',claim:'interest',requiresAuthority:'golfriend_member_activity'},
  {id:'booking_request',claim:'intent',requiresAuthority:'booking_ledger'},
  {id:'confirmed_course_response',claim:'course_response',requiresAuthority:'course_response_ledger'},
  {id:'played_round',claim:'play',requiresAuthority:'played_evidence'},
  {id:'regional_demand',claim:'aggregate_interest',requiresAuthority:'golfriend_member_activity'},
  {id:'tournament_opportunity',claim:'opportunity_indicator',requiresAuthority:'tournament_registry'},
  {id:'enterprise_opportunity',claim:'opportunity_indicator',requiresAuthority:'enterprise_registry'},
]);

/** The authority that alone can establish that a round was played. */
export const PLAYED_EVIDENCE_AUTHORITY='played_evidence';
/**
 * Authorities approved in this build. `played_evidence` is deliberately ABSENT: no approved
 * authoritative played-evidence source exists, so the capability fails closed.
 */
export const APPROVED_EVIDENCE_AUTHORITIES=Object.freeze(['golfriend_member_activity','booking_ledger','course_response_ledger','tournament_registry','enterprise_registry']);

/**
 * Signals that can NEVER establish play, however many of them accumulate. Listed explicitly so
 * a future contributor adding "we have location plus a check-in, that's surely played" has to
 * delete a named rule rather than quietly widen an inference.
 */
export const NON_PLAY_INFERENCE_SOURCES=Object.freeze(['search','course_selection','match_activity','booking_request','location','check_in','user_statement','unconfirmed_activity']);

const int=(v)=>Number.isInteger(v)&&v>=0?v:null;

/**
 * Resolve whether played evidence may be reported at all.
 * Fail-closed and explicit: absent the authority the answer is `no_played_evidence_authority`,
 * the count is zero, and no course claim is produced.
 */
export function assessPlayedEvidence({authorities=[],inferredFrom=[]}={}){
  const held=Array.isArray(authorities)?authorities:[];
  const usedInference=inferredFrom.filter((source)=>NON_PLAY_INFERENCE_SOURCES.includes(source));
  if(usedInference.length)return Object.freeze({available:false,reason:'play_may_not_be_inferred',playedRounds:0,courseClaim:null,rejectedInference:Object.freeze(usedInference),
    notice:'Play was inferred from interest or intent signals. That is never evidence of play.'});
  if(!held.includes(PLAYED_EVIDENCE_AUTHORITY)||!APPROVED_EVIDENCE_AUTHORITIES.includes(PLAYED_EVIDENCE_AUTHORITY))return Object.freeze({available:false,reason:'no_played_evidence_authority',playedRounds:0,courseClaim:null,rejectedInference:Object.freeze([]),
    notice:'No approved authoritative played-evidence source exists. Played rounds are reported as zero and no course claim is generated.'});
  return Object.freeze({available:true,reason:'authoritative_played_evidence',playedRounds:null,courseClaim:null,rejectedInference:Object.freeze([]),
    notice:'An approved played-evidence authority is present; counts must come from it, never from inference.'});
}

/** One evidence line. Unknown stays unknown: a missing count is never coerced to zero-as-fact. */
function evidenceLine(signal,rawCount,{authorities,cohortMinimum}){
  const held=Array.isArray(authorities)?authorities:[];
  const authorized=held.includes(signal.requiresAuthority)&&APPROVED_EVIDENCE_AUTHORITIES.includes(signal.requiresAuthority);
  if(!authorized)return{id:signal.id,claim:signal.claim,disclosed:false,value:null,reason:signal.requiresAuthority===PLAYED_EVIDENCE_AUTHORITY?'no_played_evidence_authority':'authority_not_held'};
  const count=int(rawCount);
  if(count===null)return{id:signal.id,claim:signal.claim,disclosed:false,value:null,reason:'unknown'};
  const disclosure=discloseMetric(count,'authoritative');
  return{id:signal.id,claim:signal.claim,disclosed:disclosure.disclosed&&count>=cohortMinimum,value:disclosure.disclosed&&count>=cohortMinimum?count:null,
    reason:disclosure.disclosed?(count>=cohortMinimum?'disclosed':'below_cohort_minimum'):disclosure.reason};
}

/**
 * Build the internal opportunity evidence report.
 * Every line states what it is evidence OF, so a reader cannot mistake interest for play.
 */
export function buildEvidenceReport({prospectRef,counts={},authorities=[],cohortMinimum=MIN_AGGREGATE_COUNT,generatedAt,inferredFrom=[]}){
  const minimum=Number.isInteger(cohortMinimum)&&cohortMinimum>=MIN_AGGREGATE_COUNT?cohortMinimum:MIN_AGGREGATE_COUNT;
  const played=assessPlayedEvidence({authorities,inferredFrom});
  const lines=EVIDENCE_SIGNALS.map((signal)=>{
    if(signal.id==='played_round')return{id:signal.id,claim:signal.claim,disclosed:false,value:played.available?null:0,reason:played.reason};
    return evidenceLine(signal,counts[signal.id],{authorities,cohortMinimum:minimum});
  });
  return Object.freeze({schema:EVIDENCE_SCHEMA,version:EVIDENCE_VERSION,generatedAt,
    // The subject is referenced by surrogate: acquisition evidence never names a golfer, and
    // the prospect is identified only as far as the outbound allowlist already permits.
    prospectRef:surrogateRef(String(prospectRef??''),'prospect'),
    cohortMinimum:minimum,
    signals:Object.freeze(lines.map((line)=>Object.freeze(line))),
    disclosed:Object.freeze(lines.filter((line)=>line.disclosed).map((line)=>line.id)),
    withheld:Object.freeze(lines.filter((line)=>!line.disclosed).map((line)=>Object.freeze({id:line.id,reason:line.reason}))),
    playedEvidence:played,
    golferIdentityIncluded:false,
    claims:Object.freeze({play:false,revenue:false,commission:false,invoice:false,legalProofOfPlay:false}),
    notice:'Internal opportunity evidence. It generates no invoice, no commission claim and no legal proof of play.'});
}

/** True only when a report may be shown to acquisition staff without a lawful-identity grant. */
export function evidenceIsIdentityFree(report){
  if(!report||report.golferIdentityIncluded!==false)return false;
  return !containsPersonalData(JSON.stringify(report));
}

/** Immutable preparation receipt. Minimum-necessary: no counts, no subject, no narrative. */
export function evidenceReceipt({report,actorRef,at}){
  return Object.freeze({schema:'golfriend.admin.opportunity-evidence-receipt.v1',version:1,
    receiptId:surrogateRef(`${report.schema}|${report.prospectRef}|${at}`,'evd'),
    evidenceVersion:report.version,disclosedSignalCount:report.disclosed.length,withheldSignalCount:report.withheld.length,
    playedEvidenceAvailable:report.playedEvidence.available,playedEvidenceReason:report.playedEvidence.reason,
    actorRef:surrogateRef(String(actorRef??''),'actor'),at,
    claims:report.claims,
    notice:'Evidence preparation receipt. No invoice, commission claim or proof of play is asserted.'});
}
