// The mounted-capability orchestrator: one place where the Admin surface turns an operator
// command into an adapter call, an honest state and an immutable receipt.
//
// The UI holds no policy. It renders what this returns, so the preview/production boundary,
// the three delivery conditions and the receipt rules cannot drift between model and screen.
import{deliverOutreach,isProductionApproved,loadAcquisitionSource,resolveAdapter,submitConversionHandoff,transmitJhccAcquisition}from'./acquisitionAdapters.mjs';
import{classifyAdapterOutcome,claimsProductionEffect,deliverabilityState,PREVIEW_PERMITTED_STATES}from'./acquisitionAdapterStates.mjs';
import{buildJhccAcquisitionPayload,isTransmitter,jhccDeliveryState,validateJhccPayload}from'./acquisitionReportingModel.mjs';
import{surrogateRef}from'./courseAcquisitionModel.mjs';

// Each capability declares the adapter it uses AND the operation it performs, so a card can
// never be labelled as one thing while doing another. `acquisition.opportunity-report`
// deliberately has NO adapter: evidence is generated locally and there is no approved way to
// distribute it, so the card must not quietly submit a conversion handoff instead.
export const MOUNTED_CAPABILITIES=Object.freeze([
  {capabilityId:'acquisition.prospect-registry',adapterId:'acquisition.data-source',operation:'load_registry_rows'},
  {capabilityId:'acquisition.opportunity-report',adapterId:null,operation:'generate_evidence_locally'},
  {capabilityId:'acquisition.analytics',adapterId:'acquisition.jhcc-transmitter',operation:'transmit_aggregate_to_jhcc'},
  {capabilityId:'acquisition.outreach-tracking',adapterId:'acquisition.outreach-delivery',operation:'queue_draft_for_approval'},
]);

/** Report the mounted/unmounted state of every capability without calling anything. */
export function capabilityAvailability(adapters){
  return MOUNTED_CAPABILITIES.map(({capabilityId,adapterId,operation})=>{
    if(adapterId===null)return{capabilityId,adapterId:null,operation,mounted:true,state:'preview_only',reason:'local_generation_no_adapter'};
    const resolution=resolveAdapter(adapters,adapterId);
    return{capabilityId,adapterId,operation,mounted:resolution.available,state:classifyAdapterOutcome({resolution}),reason:resolution.reason};
  });
}

/**
 * Preview and production must agree with what is actually mounted, or the surface would claim
 * one thing while doing another:
 *   - a production run requires a production-APPROVED adapter (a structural "has a transmit
 *     function" check cannot tell a local double from an approved provider);
 *   - a preview run requires that the mounted adapter is NOT production-approved, so the
 *     "nothing left this system" claim stays true.
 */
function modeMismatch(mode,adapter){
  const approved=isProductionApproved(adapter);
  if(mode==='production'&&!approved)return'No production-approved adapter is mounted, so a production command cannot run.';
  if(mode!=='production'&&approved)return'A production-approved adapter is mounted; it may not be exercised in preview mode.';
  return null;
}

const settle=(capabilityId,resolution,result,mode,deliveryConfirmed=false)=>{
  const state=classifyAdapterOutcome({resolution,result,mode,deliveryConfirmed});
  // Belt and braces: a preview run may never surface a state that asserts real-world effect.
  if(mode!=='production'&&claimsProductionEffect(state))throw new Error('A preview command produced a production state.');
  return{capabilityId,state,ok:result?.ok===true,error:result?.error??null,value:result?.value??null};
};

/**
 * Execute one capability command end to end and record a receipt.
 * `mode` defaults to preview; production requires an explicit caller decision AND a mounted
 * transmitter for the JHCC path, so no default can drift into claiming delivery.
 */
export async function runCapabilityCommand({capabilityId,adapters,ledger,mode='preview',idempotencyKey,issuedAt,input={}}){
  const mounted=MOUNTED_CAPABILITIES.find((entry)=>entry.capabilityId===capabilityId);
  if(!mounted)throw new Error(`Unknown mounted capability: ${capabilityId}`);
  // The idempotency key is operator-influenced, so adapters receive a stable SURROGATE of it.
  // An adapter needs a key that is the same across retries, not one that is readable.
  const adapterKey=surrogateRef(String(idempotencyKey??''),'cmd');
  const refuse=(code,message)=>settle(capabilityId,{available:true},{ok:false,error:{code,retryable:false,message}},mode);
  let outcome;
  try{
    if(mounted.adapterId===null){
      // Local generation: no adapter is involved, so nothing can leave this system.
      outcome=settle(capabilityId,{available:true},{ok:true,value:{operation:mounted.operation,generatedLocally:true,distributionAvailable:false}},mode);
    }else{
      const resolution=resolveAdapter(adapters,mounted.adapterId);
      const mismatch=resolution.available?modeMismatch(mode,resolution.adapter):null;
      if(!resolution.available)outcome=settle(capabilityId,resolution,null,mode);
      else if(mismatch)outcome=refuse('AUTHORIZATION_REQUIRED',mismatch);
      else if(capabilityId==='acquisition.prospect-registry')outcome=settle(capabilityId,resolution,await loadAcquisitionSource(adapters,{limit:input.limit??10}),mode);
      else if(capabilityId==='acquisition.outreach-tracking')outcome=settle(capabilityId,resolution,await deliverOutreach(adapters,{draft:input.draft,recipientSelected:input.recipientSelected===true,humanApproved:input.humanApproved===true}),mode);
      else outcome=await runJhccCommand({resolution,adapters,mode,adapterKey,input});
    }
  }catch(error){
    // Nothing may escape into the UI as an unhandled rejection.
    outcome=refuse('ADAPTER_UNAVAILABLE',`The command could not be completed: ${error&&typeof error.message==='string'?error.message:'unknown failure'}`);
  }
  const receipt=ledger?ledger.record({capabilityId,state:outcome.state,mode,idempotencyKey,issuedAt}):null;
  return Object.freeze({...outcome,capabilityId,operation:mounted.operation,mode,receipt});
}

/**
 * The JHCC path enforces all three delivery conditions before the transmitter is touched:
 * a clean privacy screen, an approved effective-dated authorization, and a mounted transmitter.
 * An approved authorization on its own can never reach `transmit`.
 */
async function runJhccCommand({resolution,adapters,mode,adapterKey,input}){
  const capabilityId='acquisition.analytics';
  const report=input.report;
  if(!report)return settle(capabilityId,resolution,{ok:false,error:{code:'VALIDATION_FAILED',retryable:false,message:'An acquisition report is required.'}},mode);
  const payload=buildJhccAcquisitionPayload(report,{opportunityReportsGenerated:input.opportunityReportsGenerated??0});
  const screen=validateJhccPayload(payload);
  const authorization=input.authorization??null;
  const authorizationState=jhccDeliveryState(authorization,input.evaluationDate);
  // The transmitter is taken from the SINGLE resolution already performed, not re-read from the
  // adapters map, so the object that is gated is the object that is called.
  const gate=deliverabilityState({screenValid:screen.valid,authorized:authorizationState.authorized,transmitterMounted:isTransmitter(resolution.adapter)});
  // Only the screen VERDICT travels onward. The materialized payload stays here rather than
  // being retained in component state beyond need.
  const verdict={valid:screen.valid,prohibitedKeys:screen.prohibitedKeys,prohibitedValueCount:screen.prohibitedValueCount};
  if(!gate.deliverable){
    const code=!screen.valid?'PRIVACY_SCREEN_FAILED':!authorizationState.authorized?'AUTHORIZATION_REQUIRED':'ADAPTER_UNAVAILABLE';
    return{...settle(capabilityId,resolution,{ok:false,error:{code,retryable:false,message:gate.notice}},mode),gate,screen:verdict,authorizationState};
  }
  const result=await transmitJhccAcquisition(adapters,{payload,authorization,confirmed:input.confirmed===true,idempotencyKey:adapterKey,evaluationDate:input.evaluationDate});
  // Delivery is confirmed only by a trusted receipt from a PRODUCTION-APPROVED transmitter.
  const deliveryConfirmed=result.ok===true&&typeof result.value?.receiptId==='string'&&isProductionApproved(resolution.adapter);
  return{...settle(capabilityId,resolution,result,mode,deliveryConfirmed),gate,screen:verdict,authorizationState};
}

/**
 * Conversion is its own explicit operation, reached from the Portal-handoff control rather
 * than from a capability card, so an operator can never think they are generating a report
 * while submitting an intake handoff.
 */
export async function runConversionHandoff({adapters,ledger,mode='preview',idempotencyKey,issuedAt,prospect}){
  const capabilityId='acquisition.prospect-registry';
  const resolution=resolveAdapter(adapters,'acquisition.portal-conversion');
  let outcome;
  try{
    const mismatch=resolution.available?modeMismatch(mode,resolution.adapter):null;
    if(!resolution.available)outcome=settle(capabilityId,resolution,null,mode);
    else if(mismatch)outcome=settle(capabilityId,{available:true},{ok:false,error:{code:'AUTHORIZATION_REQUIRED',retryable:false,message:mismatch}},mode);
    else outcome=settle(capabilityId,resolution,await submitConversionHandoff(adapters,{prospect,idempotencyKey:surrogateRef(String(idempotencyKey??''),'cmd')}),mode);
  }catch(error){
    outcome=settle(capabilityId,{available:true},{ok:false,error:{code:'ADAPTER_UNAVAILABLE',retryable:false,message:`The conversion handoff could not be completed: ${error&&typeof error.message==='string'?error.message:'unknown failure'}`}},mode);
  }
  const receipt=ledger?ledger.record({capabilityId:'acquisition.portal-conversion',state:outcome.state,mode,idempotencyKey,issuedAt}):null;
  return Object.freeze({...outcome,operation:'submit_portal_conversion_handoff',mode,receipt});
}

/** Every state a preview run is allowed to reach — used by the UI and asserted by the gate. */
export const PREVIEW_STATES=PREVIEW_PERMITTED_STATES;
