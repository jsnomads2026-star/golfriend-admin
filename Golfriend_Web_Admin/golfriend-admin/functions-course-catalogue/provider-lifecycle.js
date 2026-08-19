'use strict';

class PostResponseSettlementError extends Error{
  constructor(classification,observation,fallbackRetained,cause){super(classification,{cause});this.name='PostResponseSettlementError';this.classification=classification;this.observation=observation;this.fallbackRetained=fallbackRetained;}
}

async function executeProviderRequest({cost,runId,path,reserve,markInFlight,transport,digest,recordObservation,settleCompleted,persistPending,settleTransportFailure,measureCost=null,limit=async()=>{},now=()=>new Date().toISOString()}){
  const reservation=await reserve(cost,runId,path);if(!reservation.reserved)return{deferred:true,state:reservation.state,reason:reservation.reason};
  await markInFlight(reservation);await limit();let body,providerRemaining,responseDigest;
  try{
    const response=await transport();if(response.status>=300&&response.status<400)throw Error('PROVIDER_REDIRECT_DENIED');const raw=await response.text();try{body=JSON.parse(raw);}catch{throw Error('PROVIDER_JSON_INVALID');}if(!response.ok)throw Error(`PROVIDER_${response.status}`);providerRemaining=Number(body.apiRequestsLeft);if(!Number.isFinite(providerRemaining))throw Error('PROVIDER_QUOTA_UNCONFIRMED');responseDigest=digest(raw);
  }catch(error){await settleTransportFailure(reservation,{cost,runId,path,errorClass:String(error.message).slice(0,160)});throw error;}
  const rawObservation={reservationId:reservation.reservationId,runId,path,cost:measureCost?null:cost,reservedCost:cost,providerRemaining,responseDigest,observedAt:now()};let measuredCost=cost;try{if(measureCost)measuredCost=measureCost({providerRemaining,responseDigest});if(!Number.isFinite(measuredCost)||measuredCost<=0||measuredCost>cost)throw Error('MEASURED_PROVIDER_COST_INVALID');}catch(error){try{await persistPending(reservation,rawObservation,'COST_MEASUREMENT_FAILED',error);}catch(fallback){throw new PostResponseSettlementError('PENDING_SETTLEMENT_FALLBACK_FAILED',rawObservation,true,fallback);}throw new PostResponseSettlementError('COST_MEASUREMENT_PENDING',rawObservation,true,error);}
  const observation={reservationId:reservation.reservationId,runId,path,cost:measuredCost,reservedCost:cost,providerRemaining,responseDigest,observedAt:now()};
  try{await recordObservation(reservation,observation);}catch(error){try{await persistPending(reservation,observation,'RESPONSE_OBSERVATION_PERSIST_FAILED',error);}catch(fallback){throw new PostResponseSettlementError('PENDING_SETTLEMENT_FALLBACK_FAILED',observation,true,fallback);}throw new PostResponseSettlementError('RESPONSE_OBSERVATION_PENDING',observation,true,error);}
  try{await settleCompleted(reservation,observation);}catch(error){try{await persistPending(reservation,observation,'COMPLETED_SETTLEMENT_FAILED',error);}catch(fallback){throw new PostResponseSettlementError('PENDING_SETTLEMENT_FALLBACK_FAILED',observation,true,fallback);}throw new PostResponseSettlementError('COMPLETED_SETTLEMENT_PENDING',observation,true,error);}
  return{body,retrievedAt:observation.observedAt,responseDigest,providerRemaining,reservationId:reservation.reservationId,settlementState:'completed',measuredCost,reservedCost:cost};
}

async function reconcilePendingSettlement({pendingId,loadPending,settlePending}){const pending=await loadPending(pendingId);if(!pending)return{state:'missing'};if(pending.state==='completed')return{state:'completed',idempotent:true,providerRequests:0};if(pending.state!=='pending')return{state:'blocked',reason:'PENDING_STATE_INVALID',providerRequests:0};if(!pending.responseDigest||!Number.isFinite(Number(pending.providerRemaining))||pending.cost===null||!Number.isFinite(Number(pending.cost))||Number(pending.cost)<=0)return{state:'blocked',reason:'PENDING_EVIDENCE_INVALID',providerRequests:0};const result=await settlePending(pending);return{state:'completed',idempotent:result?.idempotent===true,providerRequests:0};}

module.exports={PostResponseSettlementError,executeProviderRequest,reconcilePendingSettlement};
