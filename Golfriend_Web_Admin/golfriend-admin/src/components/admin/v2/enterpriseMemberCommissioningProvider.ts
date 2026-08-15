import {httpsCallable} from 'firebase/functions';
import {functions} from '../../../firebaseConfig';

export const ENTERPRISE_MEMBER_COMMISSIONING_SCHEMA='golfriend.enterprise-member-commissioning.v1' as const;
export const JHCC_OPERATIONS_REPORT_SCHEMA='golfriend.admin.operations-report.v1' as const;
export const COMMISSIONING_LOCALES=['en','th','ko','ja','zh','es','fr','de'] as const;
export const TEMPLATE_KINDS=['invitation','resend','correction_requested','request_rejected','request_expired','support_response'] as const;
export type CommissioningLocale=(typeof COMMISSIONING_LOCALES)[number];
export type TemplateKind=(typeof TEMPLATE_KINDS)[number];
export type ApprovalKind='legal'|'customer';

export type TemplateApprovalProjection={
 templateApprovalId:string;templateId:string;templateVersion:string;kind:TemplateKind;locale:CommissioningLocale;jurisdiction:string;
 contentDigest:string;policyVersion:string;status:'pending_approval'|'active'|'rejected'|'retired';version:number;
 legalApproved:boolean;customerApproved:boolean;createdAt:string|null;updatedAt:string|null;
};
export type CommissioningReceiptProjection={receiptId:string;templateApprovalId:string|null;subjectId:string|null;action:string;version:number|null;createdAt:string|null;immutable:true};
export type DryRunProjection={dryRunId:string;templateApprovalId:string;requestId:string;status:string;providerConfigured:false;transmitted:false;createdAt:string|null};
export type ReportValidationProjection={validationId:string;eventCount:number;status:string;commissioned:false;transmitted:false;createdAt:string|null};
export type CommissioningSnapshot={
 schema:typeof ENTERPRISE_MEMBER_COMMISSIONING_SCHEMA;state:'empty'|'current';templates:TemplateApprovalProjection[];dryRuns:DryRunProjection[];
 reportValidations:ReportValidationProjection[];commissioningReceipts:CommissioningReceiptProjection[];
 boundaries:{legalTextStored:false;providerConfigured:false;jhccCommissioned:false;notificationsSent:false;economyWrites:false};
};
export type CommissioningCommandResult={templateApprovalId?:string;dryRunId?:string;validationId?:string;receiptId:string;status:string;version?:number;replayed:boolean;providerConfigured?:false;transmitted?:false};

export interface EnterpriseMemberCommissioningProvider{
 read():Promise<CommissioningSnapshot>;
 propose(input:{commandId:string;templateId:string;templateVersion:string;kind:TemplateKind;locale:CommissioningLocale;jurisdiction:string;contentDigest:string;policyVersion:string;effectiveAt:string;expiresAt:string}):Promise<CommissioningCommandResult>;
 recordApproval(input:{commandId:string;templateApprovalId:string;expectedVersion:number;approvalKind:ApprovalKind;approvalReceiptRef:string;approvalDigest:string}):Promise<CommissioningCommandResult>;
 activate(input:{commandId:string;templateApprovalId:string;expectedVersion:number}):Promise<CommissioningCommandResult>;
 reject(input:{commandId:string;templateApprovalId:string;expectedVersion:number;reason:string;policyVersion:string}):Promise<CommissioningCommandResult>;
 retire(input:{commandId:string;templateApprovalId:string;expectedVersion:number;reason:string;policyVersion:string}):Promise<CommissioningCommandResult>;
 dryRun(input:{commandId:string;templateApprovalId:string;expectedVersion:number;requestId:string;providerCompositionId:string;channel:'email'|'sms'|'push'}):Promise<CommissioningCommandResult>;
 validateJhcc(input:{commandId:string;eventIds:string[];expectedSchemaVersion:typeof JHCC_OPERATIONS_REPORT_SCHEMA}):Promise<CommissioningCommandResult>;
}

const call=(name:string,data:unknown)=>httpsCallable<unknown,unknown>(functions,name)(data).then(result=>result.data);
const object=(value:unknown,label:string):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label}_MALFORMED`);return value as Record<string,unknown>};
const text=(value:unknown,label:string)=>{if(typeof value!=='string'||!value||value.length>256)throw new Error(`${label}_MALFORMED`);return value};
const nullableText=(value:unknown,label:string)=>value===null?null:text(value,label);
const number=(value:unknown,label:string)=>{if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error(`${label}_MALFORMED`);return Number(value)};
const exactFalse=(value:unknown,label:string):false=>{if(value!==false)throw new Error(`${label}_BOUNDARY_VIOLATION`);return false};
const parseTemplate=(value:unknown):TemplateApprovalProjection=>{const x=object(value,'TEMPLATE');if(!TEMPLATE_KINDS.includes(x.kind as TemplateKind)||!COMMISSIONING_LOCALES.includes(x.locale as CommissioningLocale)||!['pending_approval','active','rejected','retired'].includes(String(x.status)))throw new Error('TEMPLATE_ENUM_MALFORMED');if(x.legalApproved!==true&&x.legalApproved!==false)throw new Error('LEGAL_APPROVAL_MALFORMED');if(x.customerApproved!==true&&x.customerApproved!==false)throw new Error('CUSTOMER_APPROVAL_MALFORMED');return{templateApprovalId:text(x.templateApprovalId,'TEMPLATE_APPROVAL_ID'),templateId:text(x.templateId,'TEMPLATE_ID'),templateVersion:text(x.templateVersion,'TEMPLATE_VERSION'),kind:x.kind as TemplateKind,locale:x.locale as CommissioningLocale,jurisdiction:text(x.jurisdiction,'JURISDICTION'),contentDigest:text(x.contentDigest,'CONTENT_DIGEST'),policyVersion:text(x.policyVersion,'POLICY_VERSION'),status:x.status as TemplateApprovalProjection['status'],version:number(x.version,'VERSION'),legalApproved:x.legalApproved,customerApproved:x.customerApproved,createdAt:nullableText(x.createdAt,'CREATED_AT'),updatedAt:nullableText(x.updatedAt,'UPDATED_AT')}};
const parseSnapshot=(value:unknown):CommissioningSnapshot=>{const x=object(value,'SNAPSHOT'),boundaries=object(x.boundaries,'BOUNDARIES');if(x.schema!==ENTERPRISE_MEMBER_COMMISSIONING_SCHEMA||!['empty','current'].includes(String(x.state))||!Array.isArray(x.templates)||!Array.isArray(x.dryRuns)||!Array.isArray(x.reportValidations)||!Array.isArray(x.commissioningReceipts))throw new Error('COMMISSIONING_CONTRACT_MALFORMED');const dryRuns=x.dryRuns.map(item=>{const d=object(item,'DRY_RUN');return{dryRunId:text(d.dryRunId,'DRY_RUN_ID'),templateApprovalId:text(d.templateApprovalId,'TEMPLATE_APPROVAL_ID'),requestId:text(d.requestId,'REQUEST_ID'),status:text(d.status,'DRY_RUN_STATUS'),providerConfigured:exactFalse(d.providerConfigured,'PROVIDER_CONFIGURED'),transmitted:exactFalse(d.transmitted,'TRANSMITTED'),createdAt:nullableText(d.createdAt,'CREATED_AT')}});const reportValidations=x.reportValidations.map(item=>{const d=object(item,'REPORT_VALIDATION');return{validationId:text(d.validationId,'VALIDATION_ID'),eventCount:number(d.eventCount,'EVENT_COUNT'),status:text(d.status,'VALIDATION_STATUS'),commissioned:exactFalse(d.commissioned,'COMMISSIONED'),transmitted:exactFalse(d.transmitted,'TRANSMITTED'),createdAt:nullableText(d.createdAt,'CREATED_AT')}});const commissioningReceipts=x.commissioningReceipts.map(item=>{const d=object(item,'RECEIPT');if(d.immutable!==true)throw new Error('RECEIPT_IMMUTABILITY_VIOLATION');return{receiptId:text(d.receiptId,'RECEIPT_ID'),templateApprovalId:nullableText(d.templateApprovalId,'TEMPLATE_APPROVAL_ID'),subjectId:nullableText(d.subjectId,'SUBJECT_ID'),action:text(d.action,'ACTION'),version:d.version===null?null:number(d.version,'VERSION'),createdAt:nullableText(d.createdAt,'CREATED_AT'),immutable:true as const}});return{schema:ENTERPRISE_MEMBER_COMMISSIONING_SCHEMA,state:x.state as CommissioningSnapshot['state'],templates:x.templates.map(parseTemplate),dryRuns,reportValidations,commissioningReceipts,boundaries:{legalTextStored:exactFalse(boundaries.legalTextStored,'LEGAL_TEXT'),providerConfigured:exactFalse(boundaries.providerConfigured,'PROVIDER'),jhccCommissioned:exactFalse(boundaries.jhccCommissioned,'JHCC'),notificationsSent:exactFalse(boundaries.notificationsSent,'NOTIFICATIONS'),economyWrites:exactFalse(boundaries.economyWrites,'ECONOMY')}}};
const parseCommand=(value:unknown):CommissioningCommandResult=>{const x=object(value,'COMMAND_RESULT');if(x.schema!==ENTERPRISE_MEMBER_COMMISSIONING_SCHEMA||typeof x.replayed!=='boolean')throw new Error('COMMAND_RESULT_MALFORMED');return{templateApprovalId:typeof x.templateApprovalId==='string'?text(x.templateApprovalId,'TEMPLATE_APPROVAL_ID'):undefined,dryRunId:typeof x.dryRunId==='string'?text(x.dryRunId,'DRY_RUN_ID'):undefined,validationId:typeof x.validationId==='string'?text(x.validationId,'VALIDATION_ID'):undefined,receiptId:text(x.receiptId,'RECEIPT_ID'),status:text(x.status,'STATUS'),version:x.version===undefined?undefined:number(x.version,'VERSION'),replayed:x.replayed,providerConfigured:x.providerConfigured===false?false:undefined,transmitted:x.transmitted===false?false:undefined}};
export const firebaseEnterpriseMemberCommissioningProvider:EnterpriseMemberCommissioningProvider={
 read:()=>call('getEnterpriseMemberCommissioningAdminV1',{}).then(parseSnapshot),
 propose:input=>call('proposeEnterpriseMemberDeliveryTemplateAdminV1',input).then(parseCommand),
 recordApproval:input=>call('recordEnterpriseMemberTemplateApprovalAdminV1',input).then(parseCommand),
 activate:input=>call('activateEnterpriseMemberDeliveryTemplateAdminV1',input).then(parseCommand),
 reject:input=>call('rejectEnterpriseMemberDeliveryTemplateAdminV1',input).then(parseCommand),
 retire:input=>call('retireEnterpriseMemberDeliveryTemplateAdminV1',input).then(parseCommand),
 dryRun:input=>call('runEnterpriseMemberDeliveryDryRunAdminV1',input).then(parseCommand),
 validateJhcc:input=>call('validateEnterpriseMemberJHCCPortAdminV1',input).then(parseCommand),
};

export const newCommissioningCommandId=()=>globalThis.crypto.randomUUID();
