// Human approval workflow for Enterprise outreach drafts — server-authoritative pure logic.
//
// An approval is a statement by a named person that THIS EXACT CONTENT may go to THIS EXACT
// RECIPIENT. So it binds the content digest, and it is revalidated at send time rather than
// trusted from when it was given: grants get revoked, consent gets withdrawn, roles change,
// prospects get deleted and evidence moves on between approval and delivery.
//
// Nothing here sends anything. The send-adapter contract is declared and left unmounted.
import{safeIdentifier}from'./courseAcquisitionModel.mjs';
import{isProductionApproved}from'./acquisitionAdapters.mjs';
import{contentDigest,DIGEST_ALGORITHM}from'./outreachDraftDomain.mjs';

export const APPROVAL_SCHEMA='golfriend.admin.outreach-approval.v1';
export const APPROVAL_VERSION=1;
/** An approval is short-lived by design: the world changes underneath it. */
export const APPROVAL_TTL_MINUTES=60;

export const APPROVAL_STATES=Object.freeze(['draft_created','reviewer_assigned','previewed','approved','rejected','changes_requested','expired','revoked','invalidated']);
export const APPROVAL_ACTIONS=Object.freeze(['assign_reviewer','preview','approve','reject','request_changes','expire','revoke']);
/** The grant a reviewer must hold to act. Held server-side, never asserted by a client. */
export const REVIEWER_GRANT='acquisition.outreach.approve';
export const AUTHOR_GRANT='acquisition.outreach.draft';

const TRANSITIONS=Object.freeze({
  draft_created:['reviewer_assigned','revoked'],
  reviewer_assigned:['previewed','rejected','changes_requested','expired','revoked'],
  previewed:['approved','rejected','changes_requested','expired','revoked'],
  approved:['expired','revoked','invalidated'],
  rejected:[],changes_requested:['reviewer_assigned','revoked'],
  expired:[],revoked:[],invalidated:[],
});

/** Conditions that invalidate an approval between grant and send. All checked at send time. */
export const INVALIDATION_TRIGGERS=Object.freeze(['content_changed','grant_revoked','role_changed','consent_withdrawn','do_not_contact_set','prospect_deleted','evidence_changed','approval_expired']);

const nonEmpty=(v)=>typeof v==='string'&&v.trim().length>0;
/** Membership without trusting a forged includes(): entries are read positionally. */
const safeGrants=(value)=>{if(!Array.isArray(value))return{includes:()=>false};const entries=Array.prototype.slice.call(value).map(String);return{includes:(g)=>entries.some((entry)=>entry===g)};};
const minutesBetween=(from,to)=>{const a=Date.parse(from),b=Date.parse(to);return Number.isFinite(a)&&Number.isFinite(b)?(b-a)/60000:null;};

/** Immutable audit receipt for one workflow transition. Actors are surrogated, never named. */
export function workflowReceipt({action,fromState,toState,draftDigest,actorRef,at,detail=null}){
  return Object.freeze({schema:'golfriend.admin.outreach-workflow-receipt.v1',version:1,
    receiptId:`wf-${action}-${String(at??'').replace(/[^0-9]/g,'').slice(0,14)}-${String(draftDigest??'').slice(-20)}`,
    action,fromState,toState,draftDigest,digestAlgorithm:DIGEST_ALGORITHM,
    actorRef:safeIdentifier(actorRef,'actor'),at,detail,
    deliveryClaimed:false,
    notice:'Workflow receipt. An approval receipt is not delivery confirmation.'});
}

/**
 * Apply one workflow action.
 * Separation of duties is enforced here rather than in the UI: the author of a draft may never
 * approve it, and may never be assigned as its reviewer.
 */
export function applyWorkflowAction({state,action,draft,actor,reviewerRef=null,at,assignedReviewerRef=null}){
  if(!APPROVAL_ACTIONS.includes(action))return{ok:false,error:'unknown_action',state};
  if(!APPROVAL_STATES.includes(state))return{ok:false,error:'unknown_state',state};
  const allowed=TRANSITIONS[state]??[];
  const targetFor={assign_reviewer:'reviewer_assigned',preview:'previewed',approve:'approved',reject:'rejected',request_changes:'changes_requested',expire:'expired',revoke:'revoked'};
  const target=targetFor[action];
  if(!allowed.includes(target))return{ok:false,error:'transition_not_permitted',state};
  if(!actor||!nonEmpty(actor.actorRef))return{ok:false,error:'actor_required',state};
  const grants=safeGrants(actor.grants);

  // Separation of duties is enforced against the field the PRODUCER actually emits (createdBy),
  // and by POSITIVE assertion: an absent author is a refusal, never a comparison against
  // undefined that silently passes. The earlier version compared a field no producer wrote.
  const authorRef=nonEmpty(draft?.createdBy)?draft.createdBy:(nonEmpty(draft?.createdByRef)?draft.createdByRef:null);
  if((action==='assign_reviewer'||action==='approve')&&!authorRef)return{ok:false,error:'draft_author_unknown',state};
  if(action==='assign_reviewer'){
    if(!grants.includes(REVIEWER_GRANT)&&!grants.includes(AUTHOR_GRANT))return{ok:false,error:'assignment_grant_required',state};
    if(!nonEmpty(reviewerRef))return{ok:false,error:'reviewer_required',state};
    if(reviewerRef===authorRef)return{ok:false,error:'separation_of_duties',state};
    return{ok:true,state:target,reviewerRef};
  }
  if((action==='revoke'||action==='expire')&&!grants.includes(REVIEWER_GRANT))return{ok:false,error:'reviewer_grant_required',state};
  if(action==='approve'||action==='reject'||action==='request_changes'||action==='preview'){
    if(!grants.includes(REVIEWER_GRANT))return{ok:false,error:'reviewer_grant_required',state};
    if(assignedReviewerRef&&actor.actorRef!==assignedReviewerRef)return{ok:false,error:'not_the_assigned_reviewer',state};
    if(action==='approve'&&actor.actorRef===authorRef)return{ok:false,error:'separation_of_duties',state};
  }
  if(action==='approve'){
    if(!nonEmpty(draft?.contentDigest))return{ok:false,error:'digest_required',state};
    if(!nonEmpty(actor.role))return{ok:false,error:'approver_role_required',state};
    return{ok:true,state:target,approvedDigest:draft.contentDigest,approvedAt:at,approvedByRef:actor.actorRef,approverRole:actor.role,evidenceVersion:draft.evidenceVersion??null};
  }
  return{ok:true,state:target};
}

/**
 * Revalidate an approval immediately before a send would occur.
 * Fail-closed on every trigger, and the digest is RECOMPUTED from the current bound content
 * rather than compared to a stored copy of itself — otherwise a mutated draft carrying its old
 * digest would validate against itself.
 */
export function revalidateApproval({approval,currentBound,context,at}){
  const failures=[];
  if(!approval||approval.state!=='approved')failures.push('not_approved');
  const recomputed=currentBound?contentDigest(currentBound):null;
  if(!recomputed||recomputed!==approval?.approvedDigest)failures.push('content_changed');
  const elapsed=approval?.approvedAt&&at?minutesBetween(approval.approvedAt,at):null;
  if(elapsed===null||elapsed<0||elapsed>APPROVAL_TTL_MINUTES)failures.push('approval_expired');
  // Authorization is revalidated NOW: a grant held at approval time may since have been revoked.
  const grants=safeGrants(context?.approverGrants);
  if(!grants.includes(REVIEWER_GRANT))failures.push('grant_revoked');
  // Fail CLOSED: a missing role on either side is not agreement, it is an unknown.
  if(!nonEmpty(approval?.approverRole)||!nonEmpty(context?.approverRole)||context.approverRole!==approval.approverRole)failures.push('role_changed');
  if(context?.consentState!=='granted')failures.push('consent_withdrawn');
  if(context?.doNotContact)failures.push('do_not_contact_set');
  if(context?.prospectDeleted)failures.push('prospect_deleted');
  // Normalise absent to null so undefined-vs-null is not read as agreement by accident, but a
  // genuine mismatch still fails.
  if((context?.evidenceVersion??null)!==(approval?.evidenceVersion??null))failures.push('evidence_changed');
  return Object.freeze({valid:failures.length===0,failures:Object.freeze(failures),
    recomputedDigest:recomputed,
    notice:failures.length?'Approval is no longer valid. A fresh approval is required before any send.':'Approval remains valid for the exact approved content.'});
}

/**
 * The send-adapter contract. Declared so a future transmitter has a defined shape to satisfy;
 * deliberately UNMOUNTED — there is no provider, no channel and no send path in this build.
 */
export const SEND_ADAPTER_CONTRACT=Object.freeze({
  schema:'golfriend.admin.outreach-send-adapter.v1',version:1,
  required:Object.freeze(['send(draft, approval, idempotencyKey)']),
  preconditions:Object.freeze(['approval.state === "approved"','revalidateApproval(...).valid === true','adapter.productionApproved === true','recipient explicitly selected','contact preference honoured']),
  prohibited:Object.freeze(['sending without a fresh revalidation','sending to a do-not-contact prospect','sending on a withdrawn consent','claiming delivery without a trusted receipt']),
  mounted:false,adapter:null,
  notice:'Contract only. No send adapter is mounted; no email, message or provider connection exists.',
});

/** Resolve whether a send may even be attempted. Always false while no adapter is mounted. */
export function sendReadiness({approval,currentBound,context,at,adapter=null}){
  const revalidation=revalidateApproval({approval,currentBound,context,at});
  const adapterMounted=isProductionApproved(adapter)&&typeof adapter.send==='function';
  return Object.freeze({sendable:revalidation.valid&&adapterMounted,
    revalidation,adapterMounted,
    blocked:Object.freeze(revalidation.valid?(adapterMounted?[]:['no_send_adapter_mounted']):revalidation.failures),
    notice:'Send readiness only. Nothing is transmitted by this function under any condition.'});
}
