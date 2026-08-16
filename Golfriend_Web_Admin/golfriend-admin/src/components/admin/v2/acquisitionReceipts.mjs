// Immutable, minimum-necessary, idempotent receipts for acquisition adapter commands.
//
// A receipt records THAT a command ran and what it resolved to. It deliberately carries no
// prospect identity, no course identity, no contact detail and no free text: an operator
// auditing the ledger needs the capability, the state and the mode, not the subject.
// Every receipt states explicitly whether it was preview or production.
import{ADAPTER_UI_STATES,claimsProductionEffect,EXECUTION_MODES}from'./acquisitionAdapterStates.mjs';
import{containsPersonalData,surrogateRef}from'./courseAcquisitionModel.mjs';

export const RECEIPT_SCHEMA='golfriend.admin.acquisition-command-receipt.v1';
export const RECEIPT_VERSION=1;
/** The complete field set of a receipt. Anything else is out of the minimum-necessary set. */
export const RECEIPT_FIELDS=Object.freeze(['schema','version','receiptId','capabilityId','state','mode','previewOnly','productionDeliveryClaimed','commandRef','issuedAt','replayed','notice']);

const deepFreeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};

/**
 * Issue a receipt. The idempotency key is NEVER stored verbatim — an operator may put a
 * course or person into it, so only a non-identifying surrogate of it is recorded.
 */
/** A capability id is a machine identifier, never operator prose. */
const CAPABILITY_ID_SHAPE=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
export function issueReceipt({capabilityId,state,mode='preview',idempotencyKey,issuedAt,replayed=false}){
  if(!ADAPTER_UI_STATES.includes(state))throw new Error('Unknown adapter state.');
  if(typeof capabilityId!=='string'||!CAPABILITY_ID_SHAPE.test(capabilityId))throw new Error('Capability id must be a machine identifier.');
  const executionMode=EXECUTION_MODES.includes(mode)?mode:'preview';
  const previewOnly=executionMode!=='production';
  // A preview run may never record a production effect, whatever the caller passes.
  if(previewOnly&&claimsProductionEffect(state))throw new Error('A preview command may not record a production effect.');
  const commandRef=surrogateRef(String(idempotencyKey??''),'cmd');
  return deepFreeze({schema:RECEIPT_SCHEMA,version:RECEIPT_VERSION,receiptId:surrogateRef(`${capabilityId}|${commandRef}|${state}|${executionMode}`,'rcpt'),capabilityId,state,mode:executionMode,previewOnly,productionDeliveryClaimed:executionMode==='production'&&state==='delivery_confirmed',commandRef,issuedAt,replayed:replayed===true,
    // Precise rather than flattering: in preview a LOCAL preview adapter may well have been
    // invoked. What is guaranteed is that no production-approved adapter was, so nothing left
    // this system. Claiming "nothing happened" would be false.
    notice:previewOnly?'Preview only. Any adapter invoked was a local preview double; no production-approved adapter was called, so no message, transmission, production write or partner status resulted.':'Production command. Delivery is claimed only when the state is delivery_confirmed.'});
}

/** True when a receipt carries only the minimum-necessary fields and no personal data. */
export function receiptIsMinimal(receipt){
  if(!receipt||typeof receipt!=='object')return false;
  const keys=Object.keys(receipt);
  if(keys.length!==RECEIPT_FIELDS.length||!keys.every((key)=>RECEIPT_FIELDS.includes(key)))return false;
  return !Object.values(receipt).some((value)=>containsPersonalData(value));
}

/**
 * An append-only receipt ledger. Replaying the same command returns the ORIGINAL receipt
 * marked `replayed`, so a duplicated click or a retried command can never double-count.
 */
export function createReceiptLedger(){
  const entries=new Map();
  const log=[];
  return{
    /**
     * Idempotency deduplicates EFFECTS, not outcomes. A replay of the same command that
     * resolved the same way returns the original receipt. A replay that now resolves
     * DIFFERENTLY is not the same outcome: returning the earlier one would let the ledger
     * assert a delivery for a command that was just refused. Such a replay issues a fresh
     * receipt marked as superseding the earlier one, and both are retained.
     */
    record({capabilityId,state,mode='preview',idempotencyKey,issuedAt}){
      const key=`${capabilityId}|${mode}|${String(idempotencyKey??'')}`;
      const original=entries.get(key);
      if(original&&original.state===state){const replay=deepFreeze({...original,replayed:true});log.push(replay);return replay;}
      const receipt=issueReceipt({capabilityId,state,mode,idempotencyKey,issuedAt});
      const stamped=original?deepFreeze({...receipt,supersedesReceiptId:original.receiptId}):receipt;
      entries.set(key,stamped);
      log.push(stamped);
      return stamped;
    },
    /** A defensive copy: a caller must not be able to mutate the ledger through its readout. */
    list(){return deepFreeze([...entries.values()].map((receipt)=>({...receipt})));},
    /** Append-only history, including superseded receipts and replays. */
    history(){return deepFreeze(log.map((receipt)=>({...receipt})));},
    size(){return entries.size;},
  };
}
