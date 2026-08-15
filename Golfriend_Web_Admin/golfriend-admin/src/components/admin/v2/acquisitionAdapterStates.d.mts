export type AdapterUiState='unconfigured'|'unavailable'|'preview_only'|'awaiting_human_approval'|'rejected'|'accepted_by_adapter'|'delivery_confirmed';
export type ExecutionMode='preview'|'production';
export interface DeliverabilityState{deliverable:boolean;conditions:{screenValid:boolean;authorized:boolean;transmitterMounted:boolean};unmet:string[];notice:string}
export const ADAPTER_UI_STATES:readonly AdapterUiState[];export const REJECTION_CODES:readonly string[];export const EXECUTION_MODES:readonly ExecutionMode[];export const PREVIEW_PERMITTED_STATES:readonly AdapterUiState[];export const ADAPTER_STATE_COPY:Record<string,Record<string,string>>;
export function classifyAdapterOutcome(input?:{resolution?:any;result?:any;mode?:string;deliveryConfirmed?:boolean}):AdapterUiState;
export function deliverabilityState(input?:{screenValid?:boolean;authorized?:boolean;transmitterMounted?:boolean}):DeliverabilityState;
export function claimsProductionEffect(state:string):boolean;
export function adapterStateLabel(state:string,locale:string):string;
