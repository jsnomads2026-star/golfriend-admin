import Stripe from "stripe";
import {normalizeProviderEvent,type CheckoutRequest,type SubscriptionProvider,type ProviderEvent} from "./smallBusinessSubscriptionDomain.js";

const isoSeconds=(value:unknown)=>new Date(Number(value)*1000).toISOString();
const stringId=(value:unknown)=>typeof value==="string"?value:(value as {id?:unknown})?.id?String((value as {id:unknown}).id):null;

export function createStripeSubscriptionProvider(input:{secretKey?:string;webhookSecret?:string;priceId?:string;stripe?:Stripe}):SubscriptionProvider{
  const secretKey=String(input.secretKey||""),webhookSecret=String(input.webhookSecret||""),priceId=String(input.priceId||"");
  if(!secretKey||!webhookSecret||!/^price_[A-Za-z0-9]+$/.test(priceId))return Object.freeze({configured:false,async createCheckout(){throw Error("PROVIDER_UNCONFIGURED")},verifyWebhook(){throw Error("PROVIDER_UNCONFIGURED")}});
  const stripe=input.stripe||new Stripe(secretKey,{apiVersion:"2026-06-24.dahlia"});
  return Object.freeze({
    configured:true,
    async createCheckout(request:CheckoutRequest){
      const price=await stripe.prices.retrieve(priceId);
      if(price.active!==true||price.type!=="recurring"||price.unit_amount!==request.amountMinor||String(price.currency).toUpperCase()!==request.currency||price.recurring?.interval!=="month"||price.recurring.interval_count!==1)throw Error("PROVIDER_PRICE_MISMATCH");
      const trialEnd=Math.floor(Date.parse(request.trialEndsAt)/1000);if(!Number.isSafeInteger(trialEnd)||trialEnd<=Math.floor(Date.now()/1000))throw Error("TRIAL_EXPIRED");
      const session=await stripe.checkout.sessions.create({mode:"subscription",line_items:[{price:priceId,quantity:1}],success_url:request.successUrl,cancel_url:request.cancelUrl,client_reference_id:request.organizationId,metadata:{organizationId:request.organizationId,intentId:request.intentId,policyVersion:request.policyVersion,pricingDigest:request.pricingDigest},subscription_data:{trial_end:trialEnd,metadata:{organizationId:request.organizationId,intentId:request.intentId,policyVersion:request.policyVersion,pricingDigest:request.pricingDigest}}},{idempotencyKey:request.idempotencyKey});
      if(!session.id||!session.url)throw Error("PROVIDER_SESSION_INVALID");
      return Object.freeze({provider:"stripe" as const,sessionId:session.id,checkoutUrl:session.url,providerSubscriptionId:stringId(session.subscription),expiresAt:session.expires_at?isoSeconds(session.expires_at):null});
    },
    verifyWebhook(rawBody:Buffer,signature:string,toleranceSeconds:number):ProviderEvent{
      if(!signature)throw Error("WEBHOOK_SIGNATURE_REQUIRED");
      const event=stripe.webhooks.constructEvent(rawBody,signature,webhookSecret,toleranceSeconds),object:any=event.data.object,subscriptionObject=object.object==="subscription"?object:null,invoiceObject=object.object==="invoice"?object:null,chargeObject=object.object==="charge"?object:null,metadata=object.metadata||invoiceObject?.parent?.subscription_details?.metadata||{};
      let kind:string;
      if(event.type==="customer.subscription.created")kind="subscription_created";
      else if(event.type==="invoice.paid")kind=invoiceObject?.billing_reason==="subscription_cycle"?"subscription_renewed":"invoice_paid";
      else if(event.type==="invoice.payment_failed")kind="payment_failed";
      else if(event.type==="customer.subscription.deleted")kind="subscription_cancelled";
      else if(event.type==="charge.refunded")kind="refund_issued";
      else throw Error("WEBHOOK_EVENT_UNSUPPORTED");
      const subscriptionId=stringId(subscriptionObject?.id||invoiceObject?.subscription||chargeObject?.metadata?.subscriptionId),organizationId=String(metadata.organizationId||chargeObject?.metadata?.organizationId||""),intentId=String(metadata.intentId||chargeObject?.metadata?.intentId||"");
      const line=invoiceObject?.lines?.data?.find((item:any)=>stringId(item.subscription)===subscriptionId)||invoiceObject?.lines?.data?.[0],period=line?.period||subscriptionObject?.items?.data?.[0]?.current_period_start&&{start:subscriptionObject.items.data[0].current_period_start,end:subscriptionObject.items.data[0].current_period_end};
      return normalizeProviderEvent({providerEventId:event.id,kind,occurredAt:isoSeconds(event.created),organizationId,intentId,providerCustomerId:stringId(object.customer),providerSubscriptionId:subscriptionId,providerInvoiceId:invoiceObject?.id||null,providerRefundId:kind==="refund_issued"?String(chargeObject?.refunds?.data?.[0]?.id||""):null,amountMinor:kind==="refund_issued"?Number(chargeObject?.amount_refunded||0):Number(invoiceObject?.amount_paid??invoiceObject?.amount_due??0),currency:String(object.currency||""),periodStart:period?isoSeconds(period.start):null,periodEnd:period?isoSeconds(period.end):null,rawType:event.type});
    }
  });
}
