// Four fail-closed adapter interfaces for Enterprise Admin acquisition
// (Founder decision 5, 2026-08-15). Local preview / test adapters ONLY.
//
// Hard boundaries, enforced here and asserted by the gate:
//   - No real provider, credential, endpoint, email or transmission is authorized.
//   - The production adapter for every capability is null and resolves to unavailable.
//   - An adapter may never claim delivery, approval, partner status or JHCC receipt.
//   - Every refusal is an explicit, typed, non-retryable-by-default result — never a throw
//     that a caller might mistake for a transient failure, and never a silent success.
import{conversionHandoff,outboundProspect}from'./courseAcquisitionModel.mjs';
import{containsPersonalData}from'./courseAcquisitionModel.mjs';
import{jhccDeliveryState,validateJhccPayload}from'./acquisitionReportingModel.mjs';

export const ADAPTER_IDS=Object.freeze(['acquisition.data-source','acquisition.outreach-delivery','acquisition.portal-conversion','acquisition.jhcc-transmitter']);
export const ADAPTER_ERROR_CODES=Object.freeze(['ADAPTER_UNAVAILABLE','AUTHORIZATION_REQUIRED','VALIDATION_FAILED','PRIVACY_SCREEN_FAILED','IDEMPOTENCY_CONFLICT','NOT_ELIGIBLE','UPSTREAM_REJECTED']);
/**
 * An adapter declines a request by returning `{rejected:true, reason}`. A decline is a
 * decision about the request and is reported separately from a fault, which is an adapter
 * failure — conflating them would hide which side refused.
 */
// `Object.hasOwn` matches the resolveAdapter discipline: an inherited flag is not a decline.
const declined=(value)=>Boolean(value)&&typeof value==='object'&&Object.hasOwn(value,'rejected')&&value.rejected===true;
/**
 * Adapter-authored text is untrusted: it is screened and length-bounded before it can reach an
 * operator's screen, so a hostile adapter cannot echo personal data back into the Admin DOM.
 */
const safeAdapterMessage=(text,fallback)=>{const value=typeof text==='string'?text.trim():'';if(!value)return fallback;if(containsPersonalData(value))return `${fallback} (detail withheld — it failed privacy screening)`;return value.slice(0,200);};
const declineReason=(value)=>safeAdapterMessage(value?.reason,'The adapter declined the request.');
/** Production adapters are absent by construction. Mounting one is a separate approval. */
export const DEFAULT_ACQUISITION_ADAPTERS=Object.freeze(Object.fromEntries(ADAPTER_IDS.map((id)=>[id,null])));

const fail=(adapterId,code,message,retryable=false)=>Object.freeze({ok:false,adapterId,error:Object.freeze({code,retryable,message}),delivered:false,value:null});
const ok=(adapterId,value)=>Object.freeze({ok:true,adapterId,error:null,delivered:false,value});
const nonEmpty=(v)=>typeof v==='string'&&v.trim().length>0;

/**
 * Resolve an adapter. A null (absent) adapter always yields ADAPTER_UNAVAILABLE —
 * it never falls back to a permissive default.
 */
/**
 * An adapter is production-capable ONLY if it says so explicitly. A structural check ("has a
 * transmit function") cannot tell a preview double from an approved provider, so a preview
 * adapter would otherwise satisfy every gate and let the surface claim real delivery.
 */
export const isProductionApproved=(adapter)=>Boolean(adapter)&&(typeof adapter==='object'||typeof adapter==='function')&&adapter.productionApproved===true;

/** The method each adapter must expose to count as mounted. */
export const ADAPTER_REQUIRED_METHOD=Object.freeze({'acquisition.data-source':'load','acquisition.outreach-delivery':'queueForApproval','acquisition.portal-conversion':'submit','acquisition.jhcc-transmitter':'transmit'});

export function resolveAdapter(adapters,adapterId){
  if(!ADAPTER_IDS.includes(adapterId))return{available:false,adapter:null,reason:'unknown_adapter'};
  const adapter=adapters&&Object.hasOwn(adapters,adapterId)?adapters[adapterId]:null;
  if(adapter===null||adapter===undefined)return{available:false,adapter:null,reason:'adapter_unavailable'};
  // A non-null value is NOT an adapter. `0`, `''`, `false` and a bare string must fail closed
  // rather than be treated as mounted and then blow up at the call site.
  const method=ADAPTER_REQUIRED_METHOD[adapterId];
  if((typeof adapter!=='object'&&typeof adapter!=='function')||typeof adapter[method]!=='function')return{available:false,adapter:null,reason:'adapter_malformed'};
  return{available:true,adapter,reason:'adapter_mounted'};
}

/** Contain an adapter fault: a throw or rejection becomes a typed refusal, never an escape. */
async function callAdapter(adapterId,invoke){
  try{return{ok:true,value:await invoke()};}
  catch(error){return{ok:false,message:error&&typeof error.message==='string'?error.message:'The adapter failed.'};}
}
/** Adapter return values are untrusted: only a plain string identifier is ever carried through. */
const adapterString=(value)=>{if(typeof value!=='string')return null;const trimmed=value.trim();if(!trimmed||containsPersonalData(trimmed))return null;return trimmed.slice(0,120);};

// --- 1. acquisition data source ------------------------------------------
/** Load prospects through an approved source. Rows are projected to the outbound allowlist. */
export async function loadAcquisitionSource(adapters,{limit=100}={}){
  const id='acquisition.data-source';
  const {available,adapter}=resolveAdapter(adapters,id);
  if(!available)return fail(id,'ADAPTER_UNAVAILABLE','No approved acquisition data source is configured.');
  if(!Number.isInteger(limit)||limit<1||limit>1000)return fail(id,'VALIDATION_FAILED','Limit must be an integer between 1 and 1000.');
  // Projection and label reads are INSIDE containment: a hostile row can throw on property
  // access, and that must become a typed refusal rather than escape to the caller.
  const call=await callAdapter(id,async()=>{const rows=await adapter.load({limit});return{rows,label:adapterString(adapter.label)};});
  if(!call.ok)return fail(id,'ADAPTER_UNAVAILABLE',safeAdapterMessage(call.message,'The acquisition source failed.'));
  if(declined(call.value?.rows))return fail(id,'UPSTREAM_REJECTED',declineReason(call.value.rows));
  if(!Array.isArray(call.value?.rows))return fail(id,'VALIDATION_FAILED','The source did not return a row array.');
  const projected=await callAdapter(id,()=>call.value.rows.slice(0,limit).map(outboundProspect));
  if(!projected.ok)return fail(id,'VALIDATION_FAILED',`A source row could not be projected: ${projected.message}`);
  return ok(id,{source:call.value.label||'unlabelled source',prospects:projected.value});
}

// --- 2. outreach delivery -------------------------------------------------
/**
 * Outreach delivery. No real email is authorized, so even a mounted preview adapter
 * refuses to send: it may only queue a draft for human approval.
 */
export async function deliverOutreach(adapters,{draft,recipientSelected=false,humanApproved=false}={}){
  const id='acquisition.outreach-delivery';
  const {available,adapter}=resolveAdapter(adapters,id);
  if(!available)return fail(id,'ADAPTER_UNAVAILABLE','No approved outreach delivery adapter is configured. Drafts remain local.');
  if(!draft||!nonEmpty(draft.subject)||!nonEmpty(draft.body))return fail(id,'VALIDATION_FAILED','A draft with a subject and body is required.');
  if(draft.deliveryAvailable!==false)return fail(id,'VALIDATION_FAILED','A draft claiming delivery availability is rejected.');
  if(!recipientSelected)return fail(id,'NOT_ELIGIBLE','No recipient has been explicitly selected.');
  if(!humanApproved)return fail(id,'AUTHORIZATION_REQUIRED','A draft requires explicit human approval before any delivery step.');
  const call=await callAdapter(id,()=>adapter.queueForApproval({subject:draft.subject,body:draft.body,locale:draft.locale}));
  if(!call.ok)return fail(id,'ADAPTER_UNAVAILABLE',safeAdapterMessage(call.message,'The outreach adapter failed.'));
  if(declined(call.value))return fail(id,'UPSTREAM_REJECTED',declineReason(call.value));
  return ok(id,{queuedId:adapterString(call.value?.queuedId),state:'queued_for_human_approval',sent:false,notice:'Queued for human approval only. No message has been transmitted.'});
}

// --- 3. Portal conversion handoff ----------------------------------------
/** Hand a prospect to the recorded intake pipeline. Never grants partner status. */
export async function submitConversionHandoff(adapters,{prospect,idempotencyKey}={}){
  const id='acquisition.portal-conversion';
  const {available,adapter}=resolveAdapter(adapters,id);
  if(!available)return fail(id,'ADAPTER_UNAVAILABLE','No approved Portal conversion handoff service is configured.');
  if(!nonEmpty(idempotencyKey))return fail(id,'VALIDATION_FAILED','A stable idempotency key is required.');
  const handoff=conversionHandoff(prospect);
  if(!handoff.eligible)return fail(id,'NOT_ELIGIBLE',handoff.blockedReason||'Prospect is not handoff-eligible.');
  const call=await callAdapter(id,()=>adapter.submit({prospectId:handoff.prospectId,courseId:handoff.courseId,targetPipeline:handoff.targetPipeline,targetStatus:handoff.targetStatus,idempotencyKey}));
  if(!call.ok)return fail(id,'ADAPTER_UNAVAILABLE',safeAdapterMessage(call.message,'The conversion adapter failed.'));
  if(declined(call.value))return fail(id,'UPSTREAM_REJECTED',declineReason(call.value));
  // A handoff result can never confer partner status, whatever the adapter returns, and only a
  // plain string identifier is carried through — never an arbitrary object.
  return ok(id,{handoffId:adapterString(call.value?.handoffId),targetPipeline:handoff.targetPipeline,targetStatus:handoff.targetStatus,partnerStatusGranted:false,provisioningAuthority:'staff',notice:'Handoff recorded for staff provisioning. No partner status, account or notification was created.'});
}

// --- 4. JHCC transmitter --------------------------------------------------
/**
 * Transmit an aggregate acquisition payload to JHCC. Fail-closed on all four conditions:
 * a mounted transmitter, an approved effective-dated authorization, a clean privacy screen,
 * and an explicit confirmation. Absent any one of them, nothing is transmitted.
 */
export async function transmitJhccAcquisition(adapters,{payload,authorization,confirmed=false,idempotencyKey,evaluationDate}={}){
  const id='acquisition.jhcc-transmitter';
  const {available,adapter}=resolveAdapter(adapters,id);
  if(!available)return fail(id,'ADAPTER_UNAVAILABLE','No approved JHCC transmitter is mounted. Transmission remains disabled.');
  // Input validity is checked before authorization, so a malformed call reports a validation
  // problem rather than masquerading as an authorization refusal.
  if(!nonEmpty(idempotencyKey))return fail(id,'VALIDATION_FAILED','A stable idempotency key is required.');
  if(!nonEmpty(evaluationDate))return fail(id,'VALIDATION_FAILED','An evaluation date is required to check the authorization window.');
  if(!authorization||authorization.approved!==true||!nonEmpty(authorization.contractRef))return fail(id,'AUTHORIZATION_REQUIRED','An approved JHCC authorization record with a contract reference is required.');
  // Defence in depth: this function is exported, so it re-checks effective dating rather than
  // trusting that every caller gated it first.
  const window=jhccDeliveryState(authorization,evaluationDate);
  if(!window.authorized)return fail(id,'AUTHORIZATION_REQUIRED',window.notice);
  const screen=validateJhccPayload(payload);
  if(!screen.valid)return fail(id,'PRIVACY_SCREEN_FAILED',`Payload failed the JHCC privacy screen: ${screen.prohibitedKeys.join(', ')||`${screen.prohibitedValueCount} personal value(s)`}.`);
  if(confirmed!==true)return fail(id,'AUTHORIZATION_REQUIRED','Explicit confirmation is required before transmission.');
  // Transmit the SCREENED copy, never the caller's object: an unstable `toJSON` would otherwise
  // serialize different content than the screen inspected.
  const call=await callAdapter(id,()=>adapter.transmit({payload:screen.screened,contractRef:authorization.contractRef,idempotencyKey}));
  if(!call.ok)return fail(id,'ADAPTER_UNAVAILABLE',safeAdapterMessage(call.message,'The JHCC transmitter failed.'));
  if(declined(call.value))return fail(id,'UPSTREAM_REJECTED',declineReason(call.value));
  const receiptId=adapterString(call.value?.receiptId);
  return ok(id,{receiptId,contractRef:authorization.contractRef,acceptedByJhcc:receiptId!==null,notice:'Transmission attempted through the mounted transmitter. Acceptance is asserted only when the trusted receipt carries an identifier.'});
}
