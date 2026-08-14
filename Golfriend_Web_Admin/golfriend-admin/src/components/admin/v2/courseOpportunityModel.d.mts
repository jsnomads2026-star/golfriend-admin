export interface OpportunityMetric{id:string;claimType:'interest'|'transaction';requiresAuthoritativeAttribution:boolean;disclosed:boolean;value:number|null;reason:string}
export interface OpportunityReport{[key:string]:any;schema:string;version:number;generatedAt:string;metrics:OpportunityMetric[];claims:string[];withheld:Array<{id:string;reason:string}>;invoice:{included:false;permitted:boolean;entitlement:string;notice:string};privacy:{memberIdentityIncluded:false;preciseMovementIncluded:false;internalNotesIncluded:false;minimumAggregate:number};delivery:{status:string;notice:string}}
export interface OutreachDraft{kind:string;locale:string;subject:string;body:string;disclaimer:string;evidenceIncluded:boolean;deliveryAvailable:false;notice:string}
export const OPPORTUNITY_SCHEMA:string;export const OPPORTUNITY_VERSION:number;export const OUTREACH_TEMPLATE_KINDS:readonly string[];export const INTEREST_METRICS:readonly string[];export const TRANSACTION_METRICS:readonly string[];export const DELIVERY_NOTICE:string;export const OUTREACH_COPY:Record<string,any>;
export function buildOpportunityReport(input:{prospect:Record<string,unknown>;generatedAt:string;evaluationDate:string}):OpportunityReport;
export function renderOutreachTemplate(input:{kind:string;locale:string;prospect:Record<string,unknown>;report?:OpportunityReport|null}):OutreachDraft;
export function opportunityToJson(report:OpportunityReport):string;
export function opportunityToText(report:OpportunityReport):string;
