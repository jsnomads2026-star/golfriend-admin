export interface CommandReceipt{schema:string;version:number;receiptId:string;capabilityId:string;state:string;mode:string;previewOnly:boolean;productionDeliveryClaimed:boolean;commandRef:string;issuedAt:string;replayed:boolean;notice:string}
export interface ReceiptLedger{record(input:{capabilityId:string;state:string;mode?:string;idempotencyKey?:unknown;issuedAt?:string}):CommandReceipt;list():readonly CommandReceipt[];history():readonly CommandReceipt[];size():number}
export const RECEIPT_SCHEMA:string;export const RECEIPT_VERSION:number;export const RECEIPT_FIELDS:readonly string[];
export function issueReceipt(input:{capabilityId:string;state:string;mode?:string;idempotencyKey?:unknown;issuedAt?:string;replayed?:boolean}):CommandReceipt;
export function receiptIsMinimal(receipt:unknown):boolean;
export function createReceiptLedger():ReceiptLedger;
