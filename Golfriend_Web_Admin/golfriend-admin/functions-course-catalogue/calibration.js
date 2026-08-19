'use strict';

const d=require('./domain');
const MODES=Object.freeze({LIST_ONLY:'list_only',DETAIL_ONLY:'detail_only'});
const FRESH_PRIOR_MAX_AGE_MS=5*60*1000;
const CALIBRATION_RESERVATION_WEIGHT=1;

function mode(value){
  if(!Object.values(MODES).includes(value))throw Error('CALIBRATION_MODE_INVALID');
  return value;
}

function freshPriorEvidence(value,nowMs=Date.now(),maxAgeMs=FRESH_PRIOR_MAX_AGE_MS){
  const remaining=Number(value?.providerRemaining),observedMs=Date.parse(value?.observedAt||''),ageMs=nowMs-observedMs;
  if(value?.immutable!==true||!value?.evidenceId||!Number.isFinite(remaining)||!Number.isFinite(observedMs)||ageMs<0||ageMs>maxAgeMs||!/^[a-f0-9]{64}$/.test(String(value?.responseDigest||'')))throw Error('CALIBRATION_PRIOR_EVIDENCE_MISSING_OR_STALE');
  return{evidenceId:value.evidenceId,providerRemaining:remaining,observedAt:value.observedAt,responseDigest:value.responseDigest,immutable:true,ageMs};
}

function measuredProviderCost(beforeRemaining,afterRemaining){
  const before=Number(beforeRemaining),after=Number(afterRemaining),measured=Number((before-after).toFixed(6));
  if(!Number.isFinite(before)||!Number.isFinite(after)||measured<=0||measured>CALIBRATION_RESERVATION_WEIGHT)throw Error('CALIBRATION_MEASURED_COST_INVALID');
  return measured;
}

function detailTarget(value){
  const courseID=d.identifier(value?.providerCourseId),clubID=d.identifier(value?.providerClubId),documentId=d.identifier(value?.documentId);
  if(!courseID||!clubID||documentId!==courseID||value?.schema!=='golfriend.v2.course.v2'||value?.needsReview===true)throw Error('CALIBRATION_CANONICAL_TARGET_UNAVAILABLE');
  return{documentId,providerCourseId:courseID,providerClubId:clubID,schema:value.schema};
}

function endpointFor(selectedMode,target){
  return selectedMode===MODES.LIST_ONLY
    ?{kind:'list_page',path:d.withPageSize('/api/v2.3/clubs'),pageSize:d.PAGE_SIZE,details:0}
    :{kind:'club_detail',path:`/api/v2.3/clubs/${encodeURIComponent(target.providerClubId)}`,pageSize:null,details:1,target};
}

function receiptPayload(value){
  return{schema:value.schema,projectId:value.projectId,runId:value.runId,mode:value.mode,bindingReceiptId:value.bindingReceiptId,endpoint:value.endpoint,requestCount:value.requestCount,beforeObservation:value.beforeObservation,afterObservation:value.afterObservation,responseValidation:value.responseValidation,reservationId:value.reservationId,providerEvidenceId:value.providerEvidenceId,measuredCost:value.measuredCost,recordCountsBefore:value.recordCountsBefore,recordCountsAfter:value.recordCountsAfter,zeroCatalogueWrites:value.zeroCatalogueWrites,settlementState:value.settlementState,recoverable:value.recoverable,startedAt:value.startedAt,completedAt:value.completedAt,failure:value.failure};
}

const receiptMatches=value=>typeof value?.digest==='string'&&d.digest(receiptPayload(value))===value.digest;

function completedMeasurement(value,expectedMode){
  if(!receiptMatches(value)||value.mode!==expectedMode||value.failure!==null||value.settlementState!=='completed'||value.zeroCatalogueWrites!==true||value.requestCount!==1||!Number.isFinite(Number(value.measuredCost))||Number(value.measuredCost)<=0)throw Error(`CALIBRATION_${expectedMode.toUpperCase()}_MEASUREMENT_MISSING`);
  return value;
}

function buildCalibrationProposal(listReceipt,detailReceipt,slo=d.REFRESH_SLO){
  const list=completedMeasurement(listReceipt,MODES.LIST_ONLY),detail=completedMeasurement(detailReceipt,MODES.DETAIL_ONLY);
  if(detail.beforeObservation.evidenceId!==list.afterObservation.evidenceId||detail.beforeObservation.providerRemaining!==list.afterObservation.providerRemaining)throw Error('CALIBRATION_MEASUREMENTS_NOT_SUCCESSIVE');
  const listWeight=Number(list.measuredCost),detailWeight=Number(detail.measuredCost),maxDailyWeight=Number((slo.pagesPerRun*listWeight+slo.detailsPerRun*detailWeight).toFixed(6)),maxMonthlyWeight=Number((maxDailyWeight*31).toFixed(6));
  if(maxMonthlyWeight>slo.maxMonthlyWeight||maxMonthlyWeight>d.MONTHLY_BUDGET-d.EMERGENCY_RESERVE)throw Error('CALIBRATION_REFRESH_SLO_EXCEEDS_AUTHORITY');
  return{schema:'golfriend.golf-api-calibration-proposal.v1',sourceReceipts:{listOnly:list.runId,detailOnly:detail.runId},measuredWeights:{list:listWeight,detail:detailWeight},refreshSlo:{...slo,maxDailyWeight,maxMonthlyWeight},validated:true};
}

async function runCalibration(options){
  const selectedMode=mode(options.mode),startedAt=options.now(),runId=options.runId;
  let claimed=false,requestCount=0,beforeCounts=null,prior=null,endpoint=null,response=null,receiptWritten=false,finalFailure=null;
  try{
    prior=freshPriorEvidence(await options.loadPriorEvidence(),options.nowMs(),options.freshMaxAgeMs);
    const target=selectedMode===MODES.DETAIL_ONLY?detailTarget(await options.selectDetailTarget()):null;
    endpoint=endpointFor(selectedMode,target);
    await options.claim({mode:selectedMode,runId});
    claimed=true;
    beforeCounts=await options.countRecords();
    requestCount=1;
    response=await options.executeProvider({mode:selectedMode,runId,path:endpoint.path,reservationWeight:CALIBRATION_RESERVATION_WEIGHT,priorProviderRemaining:prior.providerRemaining,measureCost:({providerRemaining})=>measuredProviderCost(prior.providerRemaining,providerRemaining)});
    if(response.deferred)throw Error(response.reason||'CALIBRATION_DEFERRED');
    const measuredCost=measuredProviderCost(prior.providerRemaining,response.providerRemaining);
    if(response.measuredCost!==measuredCost||response.settlementState!=='completed')throw Error('CALIBRATION_SETTLEMENT_INVALID');
    const validation=options.validateResponse({mode:selectedMode,body:response.body,target,pageSize:d.PAGE_SIZE});
    if(validation?.valid!==true)throw Error(validation?.reason||'CALIBRATION_RESPONSE_INVALID');
    const afterCounts=await options.countRecords(),zeroCatalogueWrites=d.canonicalJson(beforeCounts)===d.canonicalJson(afterCounts);
    if(!zeroCatalogueWrites)throw Error('CALIBRATION_CATALOGUE_WRITE_DETECTED');
    const completedAt=options.now(),payload={schema:'golfriend.golf-api-calibration-receipt.v1',projectId:options.projectId,runId,mode:selectedMode,bindingReceiptId:options.bindingReceiptId,endpoint,requestCount,beforeObservation:prior,afterObservation:{evidenceId:response.providerEvidenceId,providerRemaining:response.providerRemaining,observedAt:response.retrievedAt,responseDigest:response.responseDigest,immutable:true},responseValidation:validation,reservationId:response.reservationId,providerEvidenceId:response.providerEvidenceId,measuredCost,recordCountsBefore:beforeCounts,recordCountsAfter:afterCounts,zeroCatalogueWrites,settlementState:'completed',recoverable:false,startedAt,completedAt,failure:null};
    const receipt={...payload,digest:d.digest(payload),immutable:true};
    await options.writeReceipt(receipt);
    receiptWritten=true;
    let proposal=null;
    const measurements=await options.loadMeasurements(receipt);
    if(measurements.listOnly&&measurements.detailOnly){
      proposal=buildCalibrationProposal(measurements.listOnly,measurements.detailOnly,options.refreshSlo);
      proposal={...proposal,createdAt:completedAt,digest:d.digest(proposal),immutable:true};
      await options.writeProposal(proposal);
    }
    return{receipt,proposal};
  }catch(error){
    finalFailure=String(error?.classification||error?.message||error).slice(0,160);
    if(claimed&&!receiptWritten){
      const afterCounts=await options.countRecords(),observation=error?.observation||response||{};
      const payload={schema:'golfriend.golf-api-calibration-receipt.v1',projectId:options.projectId,runId,mode:selectedMode,bindingReceiptId:options.bindingReceiptId,endpoint,requestCount,beforeObservation:prior,afterObservation:observation.providerRemaining===undefined?null:{evidenceId:observation.providerEvidenceId??null,providerRemaining:observation.providerRemaining,observedAt:observation.observedAt??observation.retrievedAt,responseDigest:observation.responseDigest,immutable:true},responseValidation:{valid:false,reason:finalFailure},reservationId:observation.reservationId??null,providerEvidenceId:observation.providerEvidenceId??null,measuredCost:null,recordCountsBefore:beforeCounts,recordCountsAfter:afterCounts,zeroCatalogueWrites:d.canonicalJson(beforeCounts)===d.canonicalJson(afterCounts),settlementState:observation.settlementState??(error?.observation?'pending_reconciliation':'failed'),recoverable:Boolean(error?.observation||response?.responseDigest),startedAt,completedAt:options.now(),failure:finalFailure};
      const receipt={...payload,digest:d.digest(payload),immutable:true};
      await options.writeReceipt(receipt);
      error.calibrationReceipt=receipt;
    }
    throw error;
  }finally{
    await options.relock({mode:selectedMode,runId,claimed,failure:finalFailure});
  }
}

module.exports={CALIBRATION_RESERVATION_WEIGHT,FRESH_PRIOR_MAX_AGE_MS,MODES,buildCalibrationProposal,detailTarget,endpointFor,freshPriorEvidence,measuredProviderCost,receiptMatches,receiptPayload,runCalibration};
