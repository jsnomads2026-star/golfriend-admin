export interface Disclosure{disclosed:boolean;value:number|null;reason:string}
export interface DemandRollup{attribution:string;searchInterest:Disclosure;savedCourse:Disclosure;bookingInterest:Disclosure;confirmedBookings:Disclosure;playedRounds:Disclosure}
export interface CountryRow{country:string;prospects:number;signed:number;byStage:Record<string,number>;byContract:Record<string,number>;demand:DemandRollup}
export interface CourseRow{[key:string]:any;prospectId:string;courseName:string;country:string;region:string;stage:string;contractState:string;commissionEffective:boolean;commissionReason:string;contactCount:number;demand:DemandRollup}
export interface AcquisitionAnalytics{evaluationDate:string|null;totals:{prospects:number;countries:number;commissionEffective:number;opportunityEvidenceOnly:number};countries:CountryRow[];courses:CourseRow[];minimumAggregate:number}
export interface JhccDelivery{authorized:boolean;status:string;reason:string;contractRef:string|null;notice:string;transmitter:null;deliverable:boolean;lastSuccessfulAt:null}
export interface JhccValidation{valid:boolean;prohibitedKeys:string[];prohibitedValueCount:number;contract:string}
export interface AcquisitionReport{[key:string]:any;schema:string;version:number;generatedAt:string;period:{start:string;end:string};analytics:AcquisitionAnalytics;validation:JhccValidation;delivery:JhccDelivery;boundary:string;limitations:string[]}
export const ACQUISITION_REPORT_SCHEMA:string;export const ACQUISITION_REPORT_VERSION:number;export const JHCC_TRANSMISSION_SCHEMA:string;export const JHCC_PROHIBITED_FIELDS:readonly string[];
export function acquisitionAnalytics(prospects:Array<Record<string,unknown>>,options?:{evaluationDate?:string}):AcquisitionAnalytics;
export function jhccDeliveryState(authorization:Record<string,unknown>|null,at:string):Omit<JhccDelivery,'transmitter'|'deliverable'|'lastSuccessfulAt'>;
export function validateJhccPayload(payload:unknown):JhccValidation;
export function buildAcquisitionReport(input:{prospects:Array<Record<string,unknown>>;period:{start:string;end:string};generatedAt:string;evaluationDate:string;authorization?:Record<string,unknown>|null}):AcquisitionReport;
export function acquisitionReportToJson(report:AcquisitionReport):string;
export function acquisitionReportToText(report:AcquisitionReport):string;
export function acquisitionReportToCsv(report:AcquisitionReport):string;
