// Authoritative persistence for outreach drafts, assignments, transitions and receipts.
//
// SCOPE NOTE, stated plainly: the concrete store binding (Firestore/Admin SDK) is NOT here.
// `src/components/admin/v2/` is gate-banned from setDoc/updateDoc/addDoc/deleteDoc/writeBatch,
// and callables are out of scope for this slice. What this module provides is the repository
// CONTRACT plus a transactional reference adapter implementing the full authority semantics —
// optimistic versioning, replay safety, immutability, separation of duties — so the eventual
// server binding has an executable specification to satisfy rather than a prose description.
// The store port is fail-closed and unmounted (see `PRODUCTION_STORE_PORT`).
//
// AUTHORITY RULE: creator and reviewer identities are read from the PERSISTED record, never
// from the caller. A client that supplies `createdBy` is ignored — that field is the whole
// basis of separation of duties, so accepting it from the caller would make the control
// decorative.
import{outreachContentDigest,sha256Hex}from'./outreachDigest.mjs';
import{safeIdentifier}from'./courseAcquisitionModel.mjs';

export const REPOSITORY_SCHEMA='golfriend.admin.outreach-repository.v1';
export const REPOSITORY_VERSION=1;

export const PERSISTED_FIELDS=Object.freeze(['draftId','prospectRef','contactRef','createdByRef','assignedReviewerRef','state','version','contentDigest','digestAlgorithm','templateVersion','locale','jurisdiction','jurisdictionApprovalVersion','evidenceVersion','consentVersion','doNotContactVersion','contactPreferenceVersion','createdAt','updatedAt','expiresAt']);
/** Fields that may NEVER be persisted: raw contact data, rendered body, or any secret. */
export const NEVER_PERSISTED=Object.freeze(['subject','body','recipientRole','address','email','phone','contactEmail','contactPhone','purpose','apiKey','token','secret']);
export const REPOSITORY_ERRORS=Object.freeze(['not_found','stale_write','version_required','replay_payload_mismatch','duplicate_draft','separation_of_duties','reviewer_not_assigned','immutable_record','invalid_transition','store_unavailable','payload_rejected']);

const nonEmpty=(v)=>typeof v==='string'&&v.trim().length>0;
const deepFreeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};
/** A stable fingerprint of a command payload, so a replay can be compared exactly. */
export function commandFingerprint(payload){return `cmd-sha256:${sha256Hex(JSON.stringify(payload??null))}`;}

const fail=(error,detail=null)=>deepFreeze({ok:false,error,detail,record:null,receipt:null});
const succeed=(record,receipt,replayed=false)=>deepFreeze({ok:true,error:null,detail:null,record,receipt,replayed});

/** Immutable, privacy-minimized audit receipt. References and digests only. */
function persistenceReceipt({draftId,action,fromState,toState,fromVersion,toVersion,actorRef,at,contentDigest,commandId}){
  return deepFreeze({schema:'golfriend.admin.outreach-persistence-receipt.v1',version:1,
    receiptId:`prc-${sha256Hex(`${draftId}|${action}|${toVersion}|${at}`).slice(0,24)}`,
    draftId,action,fromState,toState,fromVersion,toVersion,
    actorRef:safeIdentifier(actorRef,'actor'),at,contentDigest,
    commandRef:commandId?`cmd-${sha256Hex(String(commandId)).slice(0,16)}`:null,
    deliveryClaimed:false,
    notice:'Persistence receipt. It records references, versions and a digest — never message content, contact detail or a purpose statement.'});
}

/** Structural check that a record or receipt carries nothing it must not. */
export function persistedShapeIsMinimal(value){
  const offenders=[];
  const walk=(node)=>{if(Array.isArray(node)){node.forEach(walk);return;}
    if(node&&typeof node==='object'){for(const[key,child]of Object.entries(node)){if(NEVER_PERSISTED.includes(key))offenders.push(key);walk(child);}}};
  walk(value);
  return{minimal:offenders.length===0,offendingFields:offenders};
}

/**
 * Create the reference repository. Every mutation is a compare-and-set on an EXACT expected
 * version; there is no "last write wins" path. A command id makes a mutation replay-safe.
 */
export function createOutreachRepository(){
  const drafts=new Map();
  const receipts=[];
  const commands=new Map();

  /** Replay: identical command id AND identical payload returns the original result. */
  const replayGuard=(commandId,payload)=>{
    if(!nonEmpty(commandId))return{hit:false};
    const fingerprint=commandFingerprint(payload);
    const previous=commands.get(commandId);
    if(!previous)return{hit:false,fingerprint};
    // Same id, different payload is NOT a replay — it is a conflicting reuse of a command id.
    if(previous.fingerprint!==fingerprint)return{hit:true,mismatch:true};
    return{hit:true,mismatch:false,result:previous.result};
  };
  const remember=(commandId,fingerprint,result)=>{if(nonEmpty(commandId))commands.set(commandId,{fingerprint,result});return result;};

  const readRecord=(draftId)=>drafts.get(draftId)??null;

  return{
    schema:REPOSITORY_SCHEMA,version:REPOSITORY_VERSION,

    get(draftId){const record=readRecord(draftId);return record?deepFreeze({...record}):null;},
    receipts(){return deepFreeze(receipts.map((r)=>({...r})));},
    /** Transition history for one draft, append-only and in order. */
    history(draftId){return deepFreeze(receipts.filter((r)=>r.draftId===draftId).map((r)=>({...r})));},

    createDraft({draftId,bound,createdByRef,at,expiresAt,commandId}){
      const payload={draftId,bound,createdByRef,at,expiresAt};
      const guard=replayGuard(commandId,payload);
      if(guard.hit)return guard.mismatch?fail('replay_payload_mismatch',commandId):guard.result;
      if(!nonEmpty(draftId))return fail('payload_rejected','draftId is required');
      if(!nonEmpty(createdByRef))return fail('payload_rejected','an authoritative creator identity is required');
      if(drafts.has(draftId))return fail('duplicate_draft',draftId);
      const digest=outreachContentDigest(bound);
      if(!digest.ok)return fail('payload_rejected',`${digest.error}:${digest.field}`);
      const record=deepFreeze({
        draftId,prospectRef:bound.prospectRef,contactRef:bound.contactRef,
        // Persisted from the SERVER-supplied identity, surrogated. Never a client field.
        createdByRef:safeIdentifier(createdByRef,'actor'),assignedReviewerRef:null,
        state:'draft_created',version:1,
        contentDigest:digest.digest,digestAlgorithm:'sha-256',
        templateVersion:bound.templateVersion,locale:bound.locale,jurisdiction:bound.jurisdiction,
        jurisdictionApprovalVersion:bound.jurisdictionApprovalVersion,evidenceVersion:bound.evidenceVersion,
        consentVersion:bound.consentVersion,doNotContactVersion:bound.doNotContactVersion,
        contactPreferenceVersion:bound.contactPreferenceVersion,
        createdAt:at,updatedAt:at,expiresAt:expiresAt??null,
      });
      drafts.set(draftId,record);
      const receipt=persistenceReceipt({draftId,action:'create',fromState:null,toState:'draft_created',fromVersion:0,toVersion:1,actorRef:createdByRef,at,contentDigest:digest.digest,commandId});
      receipts.push(receipt);
      return remember(commandId,guard.fingerprint,succeed(record,receipt));
    },

    assignReviewer({draftId,expectedVersion,reviewerRef,actorRef,at,commandId}){
      const payload={draftId,expectedVersion,reviewerRef,actorRef,at};
      const guard=replayGuard(commandId,payload);
      if(guard.hit)return guard.mismatch?fail('replay_payload_mismatch',commandId):guard.result;
      const record=readRecord(draftId);
      if(!record)return fail('not_found',draftId);
      if(!Number.isInteger(expectedVersion))return fail('version_required',draftId);
      if(record.version!==expectedVersion)return fail('stale_write',`expected ${expectedVersion}, stored ${record.version}`);
      if(!nonEmpty(reviewerRef))return fail('payload_rejected','a reviewer identity is required');
      // Separation of duties against the PERSISTED creator, not anything the caller sent.
      if(safeIdentifier(reviewerRef,'actor')===record.createdByRef)return fail('separation_of_duties',draftId);
      const next=deepFreeze({...record,assignedReviewerRef:safeIdentifier(reviewerRef,'actor'),state:'reviewer_assigned',version:record.version+1,updatedAt:at});
      drafts.set(draftId,next);
      const receipt=persistenceReceipt({draftId,action:'assign_reviewer',fromState:record.state,toState:next.state,fromVersion:record.version,toVersion:next.version,actorRef,at,contentDigest:record.contentDigest,commandId});
      receipts.push(receipt);
      return remember(commandId,guard.fingerprint,succeed(next,receipt));
    },

    /**
     * Apply a state transition. The digest is RECOMPUTED from the supplied current content and
     * must match what is stored: a transition on changed content is refused, not silently
     * re-based onto the new content.
     */
    transition({draftId,expectedVersion,action,toState,actorRef,at,currentBound,commandId,requireAssignedReviewer=false}){
      const payload={draftId,expectedVersion,action,toState,actorRef,at,currentBound};
      const guard=replayGuard(commandId,payload);
      if(guard.hit)return guard.mismatch?fail('replay_payload_mismatch',commandId):guard.result;
      const record=readRecord(draftId);
      if(!record)return fail('not_found',draftId);
      if(!Number.isInteger(expectedVersion))return fail('version_required',draftId);
      if(record.version!==expectedVersion)return fail('stale_write',`expected ${expectedVersion}, stored ${record.version}`);
      if(!nonEmpty(actorRef))return fail('payload_rejected','an actor identity is required');
      const actor=safeIdentifier(actorRef,'actor');
      if(action==='approve'&&actor===record.createdByRef)return fail('separation_of_duties',draftId);
      if(requireAssignedReviewer){
        if(!nonEmpty(record.assignedReviewerRef))return fail('reviewer_not_assigned',draftId);
        if(actor!==record.assignedReviewerRef)return fail('separation_of_duties','not the assigned reviewer');
      }
      // Changed-payload rejection: the recomputed digest must equal the persisted one.
      if(currentBound!==undefined){
        const recomputed=outreachContentDigest(currentBound);
        if(!recomputed.ok)return fail('payload_rejected',`${recomputed.error}:${recomputed.field}`);
        if(recomputed.digest!==record.contentDigest)return fail('payload_rejected','content digest no longer matches the persisted record');
      }
      const next=deepFreeze({...record,state:toState,version:record.version+1,updatedAt:at});
      drafts.set(draftId,next);
      const receipt=persistenceReceipt({draftId,action,fromState:record.state,toState,fromVersion:record.version,toVersion:next.version,actorRef,at,contentDigest:record.contentDigest,commandId});
      receipts.push(receipt);
      return remember(commandId,guard.fingerprint,succeed(next,receipt));
    },
  };
}

/**
 * The production store port. Deliberately unmounted: no adapter, no credentials, no endpoint.
 * Every operation fails closed until a server-side binding is separately approved and mounted.
 */
export const PRODUCTION_STORE_PORT=deepFreeze({
  schema:'golfriend.admin.outreach-store-port.v1',mounted:false,adapter:null,
  required:['createDraft','assignReviewer','transition','get','history'],
  notice:'No production store is mounted. The reference repository is in-process only and persists nothing beyond the current process.',
});

/**
 * Retention, deletion and legal-hold PORTS ONLY. No duration, policy or jurisdiction rule is
 * invented here — each is a decision with legal consequences that must be approved and
 * versioned before it can be encoded. Every port therefore refuses.
 */
export const RETENTION_PORT=deepFreeze({
  schema:'golfriend.admin.outreach-retention-port.v1',mounted:false,
  retentionPolicyVersion:null,retentionDurationDays:null,
  evaluate(){return{ok:false,error:'retention_policy_unavailable',notice:'No approved, versioned retention policy exists. No record may be expired on retention grounds.'};},
});
export const DELETION_PORT=deepFreeze({
  schema:'golfriend.admin.outreach-deletion-port.v1',mounted:false,deletionPolicyVersion:null,
  requestDeletion(){return{ok:false,error:'deletion_policy_unavailable',deleted:false,notice:'No approved deletion policy exists. Nothing is deleted, and no deletion is claimed.'};},
});
export const LEGAL_HOLD_PORT=deepFreeze({
  schema:'golfriend.admin.outreach-legal-hold-port.v1',mounted:false,holdAuthorityVersion:null,
  isHeld(){return{ok:false,error:'legal_hold_authority_unavailable',held:null,notice:'No legal-hold authority is mounted. Hold state is unknown, and unknown is never treated as "not held".'};},
});
