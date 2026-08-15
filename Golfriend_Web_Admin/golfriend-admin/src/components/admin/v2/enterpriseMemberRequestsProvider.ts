import { httpsCallable } from 'firebase/functions';
import {functions} from '../../../firebaseConfig';

export type AdminMemberDecision = 'mark_duplicate'|'link_existing'|'reject'|'request_correction'|'escalate_identity_consent'|'approve_delivery'|'cancel_before_delivery';
export type MemberRequestProjection = {requestId:string; organizationId:string; organizationLabel?:string; propertyId:string; propertyLabel?:string; courseId:string; courseLabel?:string; action:string; status:string; version:number; memberReference?:string; locale?:string; purpose?:string; expiresAt?:string; representativeReference?:string; createdAt?:string; evidenceReferences?:Array<{type:string;reference:string;digest:string}>; conflicts?:Array<{row:number;kind:string;existingMemberReference?:string}>};
export type ReceiptProjection = {receiptId:string; action:string; actorType:'representative'|'admin'|'provider'|'recipient'|'system'; status:string; at:string; reference?:string};
export type DeliveryProjection = {outboxId:string; channel:'email'|'sms'|'push'; locale:string; templateId:string; templateVersion:string; providerState:string; attempts:number; maxAttempts:number; suppressed:boolean; expiresAt:string; receiptIds:string[]};
export type MemberRequestDetail = {request:MemberRequestProjection; history:ReceiptProjection[]; delivery?:DeliveryProjection|null; consent?:{status:string;version:number;receiptIds:string[]}; lifecycle?:{status:string;version:number}; csv?:{previewId:string;rowDigest:string;rows:Array<{row:number;status:string;memberReference:string;conflict?:string}>}};
export type QueueResult = {contract:'golfriend.enterprise-member-admin-resolution.v1'; requests:MemberRequestProjection[]; nextCursor?:string; stale?:boolean};
export type CommandResult = {requestId:string;status:string;version:number;receiptId:string;replayed:boolean};
export interface EnterpriseMemberAdminProvider {
  list(input:{filter?:Record<string,string>;limit:number;cursor?:string}):Promise<QueueResult>;
  detail(requestId:string):Promise<MemberRequestDetail>;
  decide(input:{commandId:string;requestId:string;expectedVersion:number;decision:AdminMemberDecision;reason?:string;existingMemberReference?:string;policyVersion:string;evidenceDigest:string}):Promise<CommandResult>;
  resolveCsv(input:{commandId:string;requestId:string;expectedVersion:number;previewId:string;rowDigest:string;policyVersion:string;resolutions:Array<{row:number;decision:'approve_delivery'|'mark_duplicate'|'reject';existingMemberReference?:string}>}):Promise<CommandResult>;
  prepareDelivery(input:{commandId:string;requestId:string;expectedVersion:number;channel:'email'|'sms'|'push';templateId:string;templateVersion:string;locale:string;legalBasisReference:string}):Promise<CommandResult>;
  outbox(requestId:string):Promise<{delivery:DeliveryProjection|null}>;
}
const call=<T>(name:string,data:unknown)=>httpsCallable<unknown,T>(functions,name)(data).then(result=>result.data);
const request=(raw:any):MemberRequestProjection=>({...raw,organizationLabel:raw.organizationLabel||raw.organizationId,propertyLabel:raw.propertyLabel||raw.propertyId,courseLabel:raw.courseLabel||raw.courseId});
const delivery=(raw:any):DeliveryProjection=>({...raw,providerState:raw.providerState||raw.status||'unconfigured',maxAttempts:Number(raw.maxAttempts||5),suppressed:Boolean(raw.suppressed),receiptIds:Array.isArray(raw.receiptIds)?raw.receiptIds:[]});
export const firebaseEnterpriseMemberAdminProvider:EnterpriseMemberAdminProvider={
  list:async(input)=>{const raw:any=await call('getEnterpriseMemberRequestsAdminV1',input);return{contract:raw.schema,requests:(raw.items||[]).map(request),nextCursor:raw.nextCursor||undefined,stale:raw.state==='stale'}},
  detail:async(requestId)=>{const raw:any=await call('getEnterpriseMemberRequestAdminV1',{requestId});return{...raw,request:request(raw.request),history:(raw.history||[]).map((item:any)=>({receiptId:item.receiptId,action:item.action,status:item.status||'recorded',actorType:item.reviewerRole?'admin':'system',at:item.occurredAt,reference:item.reference})),delivery:Array.isArray(raw.delivery)&&raw.delivery.length?delivery(raw.delivery[0]):null}},
  decide:(input)=>call('decideEnterpriseMemberRequestAdminV1',input), resolveCsv:(input)=>call('resolveEnterpriseMemberCsvConflictsAdminV1',input),
  prepareDelivery:(input)=>call('prepareEnterpriseMemberDeliveryAdminV1',input), outbox:async(requestId)=>{const raw:any=await call('getEnterpriseMemberDeliveryOutboxAdminV1',{requestId});return{delivery:raw.items?.length?delivery(raw.items[0]):null}},
};
export const newAdminCommandId=()=>globalThis.crypto.randomUUID();
