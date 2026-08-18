import {createHash} from "node:crypto";
import {economyPolicyByVersion, economyPolicyFor, PRICING_PROJECTION_DIGEST} from "./generated/pricingProjection.js";

export const SUBSCRIPTION_STATE_SCHEMA = "golfriend.small-business.provider-subscription.v1" as const;
export const SUBSCRIPTION_EVENT_SCHEMA = "golfriend.small-business.subscription-event-receipt.v1" as const;
export const POST_TRIAL_STATEMENT_SCHEMA = "golfriend.small-business.post-trial-statement.v1" as const;
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export type SubscriptionStatus = "trial_active"|"checkout_pending"|"paid"|"payment_failed"|"cancelled"|"provider_unavailable";
export type SubscriptionEventKind = "subscription_created"|"invoice_paid"|"payment_failed"|"subscription_renewed"|"subscription_cancelled"|"refund_issued";

const id=(v:unknown,label:string)=>{const x=String(v||"");if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(x))throw Error(`${label}_INVALID`);return x};
const iso=(v:unknown,label:string)=>{const x=String(v||""),n=Date.parse(x);if(!Number.isFinite(n)||new Date(n).toISOString()!==x)throw Error(`${label}_INVALID`);return x};
const minor=(v:unknown,label:string)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error(`${label}_INVALID`);return n};
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
export function verifyImmutableEventReplay(existingDigest:unknown,event:ProviderEvent){const eventDigest=digest(event);if(existingDigest!==eventDigest)throw Error("WEBHOOK_REPLAY_CONFLICT");return Object.freeze({accepted:true,replayed:true,eventDigest})}

export function authoritativeSmallBusinessPrice(at:string|Date=new Date()){
  const raw=at instanceof Date?at.toISOString():String(at),policy=economyPolicyFor(raw.slice(0,10));
  const price=policy?.smallBusinessSubscription;
  if(!policy||!price||price.period!=="monthly"||!Number.isSafeInteger(price.amountMinor)||price.amountMinor<=0||!/^[A-Z]{3}$/.test(price.currency))throw Error("SMALL_BUSINESS_PRICE_UNAVAILABLE");
  return Object.freeze({policyVersion:policy.version,pricingDigest:PRICING_PROJECTION_DIGEST,amountMinor:price.amountMinor,currency:price.currency,period:"monthly" as const});
}

export interface CheckoutRequest {organizationId:string;intentId:string;idempotencyKey:string;policyVersion:string;pricingDigest:string;amountMinor:number;currency:string;period:"monthly";trialEndsAt:string;successUrl:string;cancelUrl:string}
export interface CheckoutResult {provider:"stripe";sessionId:string;checkoutUrl:string;providerSubscriptionId:string|null;expiresAt:string|null}
export interface SubscriptionProvider {readonly configured:boolean;createCheckout(request:CheckoutRequest):Promise<CheckoutResult>;verifyWebhook(rawBody:Buffer,signature:string,toleranceSeconds:number):ProviderEvent}
export function failClosedSubscriptionProvider(reason="PROVIDER_UNCONFIGURED"):SubscriptionProvider{return Object.freeze({configured:false,async createCheckout(){throw Error(reason)},verifyWebhook(){throw Error(reason)}})}

export interface ProviderEvent {provider:"stripe";providerEventId:string;kind:SubscriptionEventKind;occurredAt:string;organizationId:string;intentId:string;providerCustomerId:string|null;providerSubscriptionId:string;providerInvoiceId:string|null;providerRefundId:string|null;amountMinor:number;currency:string;periodStart:string|null;periodEnd:string|null;rawType:string}
export function normalizeProviderEvent(raw:any):ProviderEvent{
  const kind=String(raw?.kind||"") as SubscriptionEventKind;if(!["subscription_created","invoice_paid","payment_failed","subscription_renewed","subscription_cancelled","refund_issued"].includes(kind))throw Error("EVENT_KIND_INVALID");
  const periodStart=raw.periodStart==null?null:iso(raw.periodStart,"PERIOD_START"),periodEnd=raw.periodEnd==null?null:iso(raw.periodEnd,"PERIOD_END");if((periodStart===null)!==(periodEnd===null)||periodStart&&periodEnd&&Date.parse(periodStart)>=Date.parse(periodEnd))throw Error("PERIOD_INVALID");
  return Object.freeze({provider:"stripe",providerEventId:id(raw.providerEventId,"EVENT"),kind,occurredAt:iso(raw.occurredAt,"OCCURRED"),organizationId:id(raw.organizationId,"ORGANIZATION"),intentId:id(raw.intentId,"INTENT"),providerCustomerId:raw.providerCustomerId? id(raw.providerCustomerId,"CUSTOMER"):null,providerSubscriptionId:id(raw.providerSubscriptionId,"SUBSCRIPTION"),providerInvoiceId:raw.providerInvoiceId?id(raw.providerInvoiceId,"INVOICE"):null,providerRefundId:raw.providerRefundId?id(raw.providerRefundId,"REFUND"):null,amountMinor:minor(raw.amountMinor,"AMOUNT"),currency:String(raw.currency||"").toUpperCase(),periodStart,periodEnd,rawType:id(raw.rawType,"RAW_TYPE")});
}

export function applyProviderEvent(previous:any,eventInput:ProviderEvent,trial:any){
  const event=normalizeProviderEvent(eventInput),price=authoritativeSmallBusinessPrice(event.occurredAt),trialEnd=iso(trial?.endsAt,"TRIAL_END");
  if(trial?.tier!=="small_business"||trial?.cancelledAt||event.currency!==price.currency||event.organizationId!==trial.organizationId)throw Error("SUBSCRIPTION_AUTHORITY_MISMATCH");
  if(["invoice_paid","subscription_renewed"].includes(event.kind)&&event.amountMinor!==price.amountMinor)throw Error("PROVIDER_PRICE_MISMATCH");
  if(event.kind==="refund_issued"&&event.amountMinor>price.amountMinor)throw Error("PROVIDER_REFUND_MISMATCH");
  if(previous&&(previous.organizationId!==event.organizationId||previous.intentId!==event.intentId||previous.providerSubscriptionId&&previous.providerSubscriptionId!==event.providerSubscriptionId||previous.providerCustomerId&&event.providerCustomerId&&previous.providerCustomerId!==event.providerCustomerId))throw Error("SUBSCRIPTION_SCOPE_MISMATCH");
  if(previous?.lastProviderEventAt&&Date.parse(event.occurredAt)<Date.parse(previous.lastProviderEventAt))throw Error("OUT_OF_ORDER_PROVIDER_EVENT");
  if(previous?.status==="cancelled"&&event.kind!=="refund_issued")throw Error("TERMINAL_SUBSCRIPTION_STATE");
  const base={schema:SUBSCRIPTION_STATE_SCHEMA,organizationId:event.organizationId,provider:"stripe",providerCustomerId:event.providerCustomerId??previous?.providerCustomerId??null,providerSubscriptionId:event.providerSubscriptionId,intentId:event.intentId,policyVersion:price.policyVersion,pricingDigest:price.pricingDigest,amountMinor:price.amountMinor,currency:price.currency,period:price.period,lastProviderEventId:event.providerEventId,lastProviderEventAt:event.occurredAt};
  let status:SubscriptionStatus=previous?.status||"checkout_pending",paidThrough=previous?.paidThrough??null,entitlementState=previous?.entitlementState||"not_granted",revenueState=previous?.revenueState||"not_recognized";
  if(event.kind==="subscription_created")status="checkout_pending";
  if(event.kind==="invoice_paid"||event.kind==="subscription_renewed"){status="paid";paidThrough=event.periodEnd;entitlementState=Date.parse(event.occurredAt)>=Date.parse(trialEnd)?"active":"scheduled_after_trial";revenueState="provider_confirmed"}
  if(event.kind==="payment_failed")status="payment_failed";
  if(event.kind==="subscription_cancelled")status="cancelled";
  if(event.kind==="refund_issued"){status="cancelled";entitlementState="revoked_after_refund";revenueState="refunded"}
  return Object.freeze({...base,status,paidThrough,entitlementState,revenueState,version:Number(previous?.version||0)+1});
}

export function entitlementAt(subscription:any,trial:any,nowIso:string){const now=Date.parse(iso(nowIso,"NOW")),end=Date.parse(iso(trial.endsAt,"TRIAL_END"));if(trial.cancelledAt)return Object.freeze({active:false,state:"cancelled",reason:"trial_cancelled"});if(now<end)return Object.freeze({active:true,state:"trial_active",reason:"trial_window"});if(subscription?.status!=="paid"||!subscription.paidThrough||Date.parse(subscription.paidThrough)<=now)return Object.freeze({active:false,state:subscription?.status==="payment_failed"?"payment_failed":"expired_unpaid",reason:"confirmed_payment_required"});return Object.freeze({active:true,state:"paid",reason:"provider_confirmed_payment"})}

export function postTrialStatement(eventInput:ProviderEvent,subscription:any,trial:any){const event=normalizeProviderEvent(eventInput),price=economyPolicyByVersion(subscription.policyVersion)?.smallBusinessSubscription;if(!price||!["invoice_paid","subscription_renewed"].includes(event.kind)||event.amountMinor!==price.amountMinor||Date.parse(event.periodEnd||"")<=Date.parse(trial.endsAt))throw Error("POST_TRIAL_STATEMENT_NOT_AUTHORIZED");const body={schema:POST_TRIAL_STATEMENT_SCHEMA,statementId:`sbps_${digest({event:event.providerEventId,organizationId:event.organizationId}).slice(0,32)}`,organizationId:event.organizationId,providerEventId:event.providerEventId,providerInvoiceId:event.providerInvoiceId,policyVersion:subscription.policyVersion,pricingDigest:subscription.pricingDigest,periodStart:event.periodStart,periodEnd:event.periodEnd,currency:price.currency,subscriptionAmountMinor:price.amountMinor,paidMinor:event.amountMinor,status:"paid",immutable:true,taxInvoiceAuthorized:false,taxStatus:"legal_tax_configuration_required",invoiceAuthority:"provider_payment_receipt_only",issuedAt:event.occurredAt};return Object.freeze({...body,statementDigest:digest(body)})}
