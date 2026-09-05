'use strict';

const d=require('./domain');

const SECRET_NAME='GOLF_API_KEY';
const ACTIVATION_REVISION_SERVICES=Object.freeze([
  'scheduledcoursecountryingestionworker',
  'scheduledgolfapicourseacquisitionworker',
]);
const ACTIVATION_REVISION_FUNCTIONS=Object.freeze({
  scheduledcoursecountryingestionworker:'scheduledCourseCountryIngestionWorker',
  scheduledgolfapicourseacquisitionworker:'scheduledGolfApiCourseAcquisitionWorker',
});

function bindingInput({projectId,secretVersion,functionRevisions}) {
  return {projectId,secretName:SECRET_NAME,secretVersion,secretVersionState:'ENABLED',functionRevisions};
}

function receiptId(input) {
  const binding=bindingInput(input);
  return `activation-${d.digest(binding).slice(0,40)}`;
}

function receiptPayload({projectId,secretVersion,functionRevisions,verifiedAt}) {
  return {...bindingInput({projectId,secretVersion,functionRevisions}),verifiedAt};
}

function receiptMatches(receipt,input) {
  if (!receipt || receipt.state!=='verified' || receipt.immutable!==true) return false;
  const payload=receiptPayload({...input,verifiedAt:receipt.verifiedAt});
  return d.activationReceiptMatches(payload,receipt.digest)
    && receipt.projectId===input.projectId
    && receipt.secretName===SECRET_NAME
    && receipt.secretVersion===input.secretVersion
    && receipt.secretVersionState==='ENABLED'
    && ACTIVATION_REVISION_SERVICES.every(service=>receipt.functionRevisions?.[service]===input.functionRevisions?.[service])
    && d.activationRevisionBindingsMatch(receipt.functionRevisions,ACTIVATION_REVISION_SERVICES,ACTIVATION_REVISION_SERVICES[0],input.functionRevisions[ACTIVATION_REVISION_SERVICES[0]]);
}

module.exports=Object.freeze({ACTIVATION_REVISION_FUNCTIONS,ACTIVATION_REVISION_SERVICES,SECRET_NAME,bindingInput,receiptId,receiptPayload,receiptMatches});
