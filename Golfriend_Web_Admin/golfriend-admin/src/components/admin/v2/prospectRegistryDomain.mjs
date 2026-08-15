// Server-authoritative prospect registry domain — pure logic, no I/O.
//
// Follows the recorded `partnerIntakeLogic.ts` pattern: this module owns validation, the
// status state machine, duplicate detection and the merge decision; the callable wrappers
// enforce auth and persist. Nothing here reads or writes anything.
//
// AUTHORITY INVARIANTS (do not weaken):
//   - `active_partner` is NOT reachable from this state machine. Partner status is granted by
//     the separately approved partner authority; an adapter result can never confer it.
//   - Two prospects are NEVER merged automatically. Duplicate detection produces a REVIEW,
//     and a merge requires an explicit human decision recorded as its own receipt.
//   - A prospect that would change country or course association fails closed.
//   - Contact detail is access-controlled: it is returned only to a caller holding the grant,
//     and never crosses an outbound boundary.
import{containsPersonalData,outboundProspect,safeIdentifier,surrogateRef}from'./courseAcquisitionModel.mjs';

export const REGISTRY_SCHEMA='golfriend.admin.prospect-registry.v1';
export const REGISTRY_VERSION=1;

/** Approved structured provenance. An unrecognised source is not admitted. */
export const PROSPECT_SOURCES=Object.freeze(['golf_api','portal_course_lead','admin_created_lead','existing_course_database','referral','other_approved_structured']);

/** The full recorded lifecycle. Order is documentation, not permission — see TRANSITIONS. */
export const PROSPECT_STATUSES=Object.freeze(['new','researching','qualified','contact_ready','approval_required','contact_queued','contacted','responded','interested','trial_offered','portal_onboarding','partner_review','active_partner','declined','do_not_contact','archived']);

/**
 * `active_partner` is deliberately ABSENT from every transition target. It is set only by the
 * partner authority, out of band. `do_not_contact` and `archived` are reachable from anywhere.
 */
const TERMINAL_FROM_ANYWHERE=Object.freeze(['do_not_contact','archived']);
export const PROSPECT_TRANSITIONS=Object.freeze({
  new:['researching','declined'],
  researching:['qualified','declined'],
  qualified:['contact_ready','declined'],
  contact_ready:['approval_required','declined'],
  approval_required:['contact_queued','contact_ready','declined'],
  contact_queued:['contacted','contact_ready','declined'],
  contacted:['responded','contact_ready','declined'],
  responded:['interested','declined'],
  interested:['trial_offered','portal_onboarding','declined'],
  trial_offered:['portal_onboarding','declined'],
  portal_onboarding:['partner_review','declined'],
  partner_review:['declined'],
  active_partner:[],
  declined:['archived'],
  do_not_contact:['archived'],
  archived:[],
});

/** Statuses at which outreach may be prepared at all. */
export const CONTACTABLE_STATUSES=Object.freeze(['contact_ready','approval_required','contact_queued','contacted','responded','interested','trial_offered']);

const str=(v)=>typeof v==='string'?v.trim():'';
const nonEmpty=(v)=>str(v).length>0;
/** Fold case, width and punctuation so "Riverbend G.C." and "riverbend gc" key alike. */
const foldKey=(v)=>str(v).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'');

/**
 * A stable deterministic prospect id. The same course in the same country always produces the
 * same id, so a re-import cannot silently create a second record — it collides and is reviewed.
 */
export function deterministicProspectId({country,courseName,courseId}){
  const key=courseId&&nonEmpty(courseId)?`course:${foldKey(courseId)}`:`name:${foldKey(courseName)}`;
  return `prospect-${surrogateRef(`${foldKey(country)}|${key}`,'v1').replace(/^v1-/,'')}`;
}

/** Validate and normalize an inbound prospect record. Structured business fields only. */
export function validateProspectRecord(input){
  const errors=[];
  const source=PROSPECT_SOURCES.includes(input?.source)?input.source:null;
  if(!source)errors.push('An approved structured source is required.');
  if(!nonEmpty(input?.country))errors.push('A country is required.');
  if(!nonEmpty(input?.courseName)&&!nonEmpty(input?.courseId))errors.push('A course name or course identifier is required.');
  const status=input?.status===undefined?'new':input.status;
  if(!PROSPECT_STATUSES.includes(status))errors.push('An unrecognised status was supplied.');
  if(status==='active_partner')errors.push('Partner status is granted by the partner authority and cannot be set here.');
  // Business identity fields must not carry personal data.
  for(const field of ['country','region','courseName','courseId'])if(input?.[field]&&containsPersonalData(input[field]))errors.push(`The ${field} field failed privacy screening.`);
  // Undeclared fields are rejected rather than silently persisted.
  const declared=new Set(['source','country','region','courseName','courseId','status','contact','sourceReference']);
  for(const key of Object.keys(input??{}))if(!declared.has(key))errors.push(`Undeclared field: ${key}`);
  if(errors.length)return{ok:false,errors};
  const prospectId=deterministicProspectId({country:input.country,courseName:input.courseName,courseId:input.courseId});
  return{ok:true,errors:[],record:Object.freeze({
    schema:REGISTRY_SCHEMA,version:REGISTRY_VERSION,prospectId,source,
    country:str(input.country),region:str(input.region),courseName:str(input.courseName),
    courseId:input.courseId?safeIdentifier(input.courseId,'course'):null,
    sourceReference:input.sourceReference?surrogateRef(String(input.sourceReference),'src'):null,
    status,
    // Contact detail is held separately and is access-controlled; it is never part of the
    // record body that other surfaces read.
    contactHeld:Boolean(input.contact),
  })};
}

/** Apply a status transition. `active_partner` is unreachable; unknown transitions fail closed. */
export function applyStatusTransition(current,next,{partnerAuthorityGrant=false}={}){
  if(!PROSPECT_STATUSES.includes(current))return{ok:false,error:'unknown_current_status'};
  if(!PROSPECT_STATUSES.includes(next))return{ok:false,error:'unknown_target_status'};
  if(next==='active_partner')return{ok:false,error:partnerAuthorityGrant?'partner_status_requires_partner_authority_service':'partner_status_not_grantable_here'};
  if(TERMINAL_FROM_ANYWHERE.includes(next))return current===next?{ok:false,error:'no_op_transition'}:{ok:true,status:next};
  const allowed=PROSPECT_TRANSITIONS[current]??[];
  if(!allowed.includes(next))return{ok:false,error:'transition_not_permitted'};
  return{ok:true,status:next};
}

/**
 * Duplicate detection. Produces a REVIEW, never a merge. Two records that resolve to the same
 * deterministic id are an exact collision; a shared folded course key in the same country is a
 * likely duplicate; anything across countries is explicitly NOT a duplicate — a cross-country
 * match is the confusion this registry must fail closed on.
 */
export function detectDuplicates(candidate,existing){
  const candidateId=deterministicProspectId(candidate);
  const matches=[];
  for(const row of existing){
    if(foldKey(row.country)!==foldKey(candidate.country)){
      if(foldKey(row.courseName)&&foldKey(row.courseName)===foldKey(candidate.courseName))matches.push({prospectId:row.prospectId,confidence:'cross_country_conflict',mergeable:false,reason:'Same course name in a different country — never merged.'});
      continue;
    }
    if(row.prospectId===candidateId){matches.push({prospectId:row.prospectId,confidence:'exact',mergeable:false,reason:'Resolves to the same deterministic identifier.'});continue;}
    if(foldKey(row.courseName)&&foldKey(row.courseName)===foldKey(candidate.courseName))matches.push({prospectId:row.prospectId,confidence:'likely',mergeable:false,reason:'Same folded course name in the same country.'});
  }
  return Object.freeze({candidateId,duplicates:Object.freeze(matches),requiresReview:matches.length>0,autoMerged:false,
    notice:matches.length?'Duplicate review required. Two prospects are never merged automatically.':'No duplicate detected.'});
}

/**
 * Propose a merge for HUMAN review. This performs no merge: it returns the decision a
 * reviewer must make, and refuses outright where merging could confuse two real courses.
 */
export function proposeMerge({primary,duplicate,reviewerId}){
  if(!nonEmpty(reviewerId))return{ok:false,error:'reviewer_required'};
  if(!primary||!duplicate)return{ok:false,error:'two_records_required'};
  if(primary.prospectId===duplicate.prospectId)return{ok:false,error:'same_record'};
  if(foldKey(primary.country)!==foldKey(duplicate.country))return{ok:false,error:'cross_country_merge_refused'};
  if(primary.courseId&&duplicate.courseId&&primary.courseId!==duplicate.courseId)return{ok:false,error:'cross_course_merge_refused'};
  return{ok:true,proposal:Object.freeze({primaryId:primary.prospectId,duplicateId:duplicate.prospectId,reviewerId,
    decisionRequired:true,applied:false,
    notice:'Merge proposal only. A reviewer must decide explicitly; nothing has been merged.'})};
}

/** An immutable receipt for a status change or a merge decision. Minimum-necessary. */
export function registryReceipt({event,prospectId,fromStatus=null,toStatus=null,actorRef,at,policyVersion=null}){
  if(!['status_change','merge_decision','record_created','duplicate_review'].includes(event))throw new Error('Unknown registry event.');
  return Object.freeze({schema:'golfriend.admin.prospect-registry-receipt.v1',version:1,
    receiptId:surrogateRef(`${event}|${prospectId}|${fromStatus}|${toStatus}|${at}`,'reg'),
    event,prospectId,fromStatus,toStatus,
    // The actor is recorded as a surrogate: an audit needs to distinguish actors, not name them.
    actorRef:surrogateRef(String(actorRef??''),'actor'),
    at,policyVersion,
    notice:'Registry receipts are immutable and record no contact detail, narrative or personal data.'});
}

/**
 * Access-controlled contact read. Contact detail is returned ONLY to a caller holding the
 * explicit grant; everyone else gets a withheld marker, never the underlying value.
 */
export function readContact(record,{grants=[],purpose}={}){
  const permitted=Array.isArray(grants)&&grants.includes('acquisition.contact.read');
  if(!permitted)return{permitted:false,contact:null,reason:'grant_required',notice:'Contact detail requires the acquisition.contact.read grant.'};
  if(!nonEmpty(purpose))return{permitted:false,contact:null,reason:'purpose_required',notice:'A recorded purpose is required to read contact detail.'};
  if(!record?.contactHeld)return{permitted:true,contact:null,reason:'no_contact_recorded',notice:'No contact detail is held for this prospect.'};
  return{permitted:true,contact:Object.freeze({available:true}),reason:'granted',notice:'Contact detail released to an authorized caller for the recorded purpose.'};
}

/** The outbound projection stays the approved 15-field allowlist — never the registry body. */
export function registryOutbound(record){return outboundProspect({id:record.prospectId,courseId:record.courseId,courseName:record.courseName,country:record.country,region:record.region,stage:'source_unavailable'});}
