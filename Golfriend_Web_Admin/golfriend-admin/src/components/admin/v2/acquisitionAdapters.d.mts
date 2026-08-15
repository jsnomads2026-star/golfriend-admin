export interface AdapterResult{ok:boolean;adapterId:string;error:{code:string;retryable:boolean;message:string}|null;delivered:false;value:any}
export interface AdapterResolution{available:boolean;adapter:unknown;reason:string}
export const ADAPTER_IDS:readonly string[];export const ADAPTER_ERROR_CODES:readonly string[];export const ADAPTER_REQUIRED_METHOD:Readonly<Record<string,string>>;export const DEFAULT_ACQUISITION_ADAPTERS:Readonly<Record<string,null>>;
export function isProductionApproved(adapter:unknown):boolean;
export function resolveAdapter(adapters:unknown,adapterId:string|null):AdapterResolution;
export function loadAcquisitionSource(adapters:unknown,options?:{limit?:number}):Promise<AdapterResult>;
export function deliverOutreach(adapters:unknown,input?:{draft?:any;recipientSelected?:boolean;humanApproved?:boolean}):Promise<AdapterResult>;
export function submitConversionHandoff(adapters:unknown,input?:{prospect?:unknown;idempotencyKey?:string}):Promise<AdapterResult>;
export function transmitJhccAcquisition(adapters:unknown,input:{payload?:unknown;authorization?:unknown;confirmed?:boolean;idempotencyKey?:string;evaluationDate:string}):Promise<AdapterResult>;
