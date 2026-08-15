import{createHash}from"node:crypto";
export const BOOKING_RECONCILIATION_SCHEMA="golfriend.partner-booking-reconciliation.v1" as const;
export const BOOKING_RECONCILIATION_OUTCOMES=["completed_verified_receipt","failed_no_effect","released_without_execution","external_review"]as const;
export type BookingReconciliationOutcome=typeof BOOKING_RECONCILIATION_OUTCOMES[number];
export type BookingReconciliationRequest=Readonly<{actorUid:string;role:"primary_owner"|"manager";organizationId:string;bookingId:string;operationId:string;commandId:string;outcome:BookingReconciliationOutcome;evidence:Readonly<Record<string,unknown>>}>;
const ID=/^[A-Za-z0-9_-]{1,200}$/,SHA=/^[a-f0-9]{64}$/;const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
function evidence(outcome:BookingReconciliationOutcome,value:Record<string,unknown>){
 if(outcome==="completed_verified_receipt"&&exact(value,["receiptId","evidenceDigest"])&&ID.test(String(value.receiptId))&&SHA.test(String(value.evidenceDigest)))return value;
 if(outcome==="failed_no_effect"&&exact(value,["noEffect","evidenceDigest"])&&value.noEffect===true&&SHA.test(String(value.evidenceDigest)))return value;
 if(outcome==="released_without_execution"&&exact(value,["releaseReceiptId","noExecution"])&&ID.test(String(value.releaseReceiptId))&&value.noExecution===true)return value;
 if(outcome==="external_review"&&exact(value,["externalReviewId","evidenceDigest"])&&ID.test(String(value.externalReviewId))&&SHA.test(String(value.evidenceDigest)))return value;
 throw new Error("RECONCILIATION_EVIDENCE_INVALID");
}
export function validateBookingReconciliationRequest(raw:Record<string,unknown>):BookingReconciliationRequest{
 const keys=["actorUid","role","organizationId","bookingId","operationId","commandId","outcome","evidence"];if(!exact(raw,keys))throw new Error("RECONCILIATION_FIELDS_INVALID");const outcome=String(raw.outcome)as BookingReconciliationOutcome,role=String(raw.role);if(!ID.test(String(raw.actorUid))||!ID.test(String(raw.organizationId))||!ID.test(String(raw.bookingId))||!ID.test(String(raw.operationId))||!ID.test(String(raw.commandId))||!["primary_owner","manager"].includes(role)||!BOOKING_RECONCILIATION_OUTCOMES.includes(outcome)||!raw.evidence||typeof raw.evidence!=="object"||Array.isArray(raw.evidence))throw new Error("RECONCILIATION_INVALID");
 return Object.freeze({...raw,role:role as BookingReconciliationRequest["role"],outcome,evidence:Object.freeze({...evidence(outcome,raw.evidence as Record<string,unknown>)})})as BookingReconciliationRequest;
}
export function bookingReconciliationOperationId(input:Pick<BookingReconciliationRequest,"actorUid"|"bookingId"|"operationId"|"commandId">){return`pbrc_${hash(`${input.actorUid}|${input.bookingId}|${input.operationId}|${input.commandId}`).slice(0,40)}`}
export function bookingReconciliationDigest(input:BookingReconciliationRequest){return hash(JSON.stringify({actorUid:input.actorUid,role:input.role,organizationId:input.organizationId,bookingId:input.bookingId,operationId:input.operationId,commandId:input.commandId,outcome:input.outcome,evidence:input.evidence}))}
export function buildBookingReconciliationReceipt(input:BookingReconciliationRequest){return Object.freeze({schema:BOOKING_RECONCILIATION_SCHEMA,reconciliationId:bookingReconciliationOperationId(input),requestDigest:bookingReconciliationDigest(input),bookingId:input.bookingId,operationId:input.operationId,commandId:input.commandId,outcome:input.outcome,evidence:Object.freeze({...input.evidence}),immutable:true as const})}
export function replayBookingReconciliation(stored:unknown,input:BookingReconciliationRequest){const value=stored as ReturnType<typeof buildBookingReconciliationReceipt>;if(!value||value.schema!==BOOKING_RECONCILIATION_SCHEMA||value.reconciliationId!==bookingReconciliationOperationId(input)||value.requestDigest!==bookingReconciliationDigest(input)||value.immutable!==true)throw new Error("RECONCILIATION_CONFLICT");return value}
