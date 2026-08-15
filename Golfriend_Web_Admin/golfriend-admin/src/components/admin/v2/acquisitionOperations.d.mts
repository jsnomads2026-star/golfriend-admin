import type{CommandReceipt,ReceiptLedger}from'./acquisitionReceipts.mjs';
import type{AdapterUiState}from'./acquisitionAdapterStates.mjs';
export interface MountedCapability{capabilityId:string;adapterId:string|null;operation:string}
export interface CapabilityAvailability{capabilityId:string;adapterId:string|null;operation:string;mounted:boolean;state:AdapterUiState;reason:string}
export function runConversionHandoff(input:{adapters:unknown;ledger?:ReceiptLedger|null;mode?:string;idempotencyKey?:unknown;issuedAt?:string;prospect?:unknown}):Promise<CommandOutcome>;
export interface CommandOutcome{[key:string]:any;capabilityId:string;state:AdapterUiState;ok:boolean;error:{code:string;retryable:boolean;message:string}|null;value:any;mode:string;receipt:CommandReceipt|null}
export const MOUNTED_CAPABILITIES:readonly MountedCapability[];export const PREVIEW_STATES:readonly AdapterUiState[];
export function capabilityAvailability(adapters:unknown):CapabilityAvailability[];
export function runCapabilityCommand(input:{capabilityId:string;adapters:unknown;ledger?:ReceiptLedger|null;mode?:string;idempotencyKey?:unknown;issuedAt?:string;input?:Record<string,unknown>}):Promise<CommandOutcome>;
