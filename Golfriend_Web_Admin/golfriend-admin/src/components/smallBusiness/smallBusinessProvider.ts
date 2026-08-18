import {httpsCallable} from 'firebase/functions';
import {functions} from '../../firebaseConfig';
import {SMALL_BUSINESS_SCHEMA,isPortalProjection,isSafeCard,type AdminQueueProjection,type DiscoveryProjection,type PortalProjection,type SmallBusinessLocale} from './smallBusinessModel';
const invoke=async<T>(name:string,input:Record<string,unknown>={})=>(await httpsCallable(functions,name)(input)).data as T;
const unavailablePortal=(ref:string):PortalProjection=>({schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',locations:[],plans:[],promotions:[],receipts:[],supportReference:ref});
export interface SmallBusinessProvider {
 portal(locale:SmallBusinessLocale):Promise<PortalProjection>;
 submitProfile(input:Record<string,unknown>):Promise<void>;
 submitProfileCorrection(input:Record<string,unknown>):Promise<void>;
 submitApplication(input:Record<string,unknown>):Promise<void>;
 withdraw(input:Record<string,unknown>):Promise<void>;
 preparePromotion(input:Record<string,unknown>):Promise<void>;
 createSubscriptionIntent(input:Record<string,unknown>):Promise<{intentId:string}>;
 createSubscriptionCheckout(input:Record<string,unknown>):Promise<{checkoutUrl:string;status:string}>;
 subscriptionState():Promise<any>;
 discover(input:Record<string,unknown>):Promise<DiscoveryProjection>;
 adminQueue(input:Record<string,unknown>):Promise<AdminQueueProjection>;
 adminDecision(input:Record<string,unknown>):Promise<void>;
 adminDetail(businessId:string):Promise<any>;
 reviewPromotion(input:Record<string,unknown>):Promise<void>;
 reporting():Promise<any>;
 prepareJhcc(batchId:string):Promise<any>;
 adminCorrection(businessId:string):Promise<any>;
 decideCorrection(input:Record<string,unknown>):Promise<void>;
}
function portalResult(value:unknown){const v=value as any;if(v?.schema===SMALL_BUSINESS_SCHEMA&&v?.state==='current'&&v.business&&Array.isArray(v.locations))return{...v,plans:(v.plans||[]).map((x:any)=>({planId:x.planId,version:x.version??x.planVersion,effectiveFrom:x.effectiveFrom||'',features:x.features||[],status:x.status??'unavailable',priceDisplay:x.accountingState||undefined})),receipts:(v.receipts||[]).map((x:any)=>({...x,version:x.version??x.businessVersion}))};if(isPortalProjection(value))return value;const p=v?.profile;if(v?.schema!==SMALL_BUSINESS_SCHEMA||v?.state!=='current'||!v.businessId||!p)return unavailablePortal('service_unavailable');return{schema:SMALL_BUSINESS_SCHEMA,state:'current',business:{businessId:v.businessId,version:v.version,displayName:p.publicName,category:p.category,status:v.status,serviceArea:p.serviceArea||'',supportedLocales:p.supportedLocales||[]},locations:(p.locations||[]).map((x:any)=>({locationId:x.locationId,label:x.name,city:x.city,country:x.countryCode,hours:x.operatingHours||[]})),plans:[],promotions:[],receipts:[]};}
export const firebaseSmallBusinessProvider:SmallBusinessProvider={
 // The reason travels as a TOKEN the UI localizes, never as a code the UI prints. A partner
 // who is simply not a Small Business partner deserves that sentence, not a raw failure.
 async portal(locale){try{return portalResult(await invoke('getSmallBusinessPortalV1',{locale}))}catch(error){const code=String((error as {code?:unknown})?.code||'');return unavailablePortal(code.includes('permission-denied')?'not_a_small_business_partner':code.includes('not-found')?'business_record_missing':code.includes('unauthenticated')?'sign_in_required':'service_unavailable')}},
 async submitProfile(input){const v:any=await invoke('saveSmallBusinessProfileV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async submitProfileCorrection(input){const current:any=await invoke('getSmallBusinessProfileCorrectionV1');const expected=current?.state==='current'&&Number.isSafeInteger(current.correction?.version)?current.correction.version:0;const saved:any=await invoke('saveSmallBusinessProfileCorrectionV1',{commandId:input.saveCommandId,expectedVersion:expected,profile:input.profile});if(saved?.schema!=='golfriend.small-business.profile-correction.v1'||saved.status!=='draft'||!Number.isSafeInteger(saved.version))throw new Error('INVALID_CORRECTION_DRAFT');const submitted:any=await invoke('submitSmallBusinessProfileCorrectionV1',{commandId:input.submitCommandId,expectedVersion:saved.version});if(submitted?.schema!=='golfriend.small-business.profile-correction.v1'||submitted.status!=='submitted')throw new Error('INVALID_CORRECTION_SUBMISSION')},
 async submitApplication(input){const v:any=await invoke('submitSmallBusinessApplicationV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async withdraw(input){const v:any=await invoke('withdrawSmallBusinessApplicationV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async preparePromotion(input){const v:any=await invoke('prepareSmallBusinessPromotionV1',input);if(v?.schema!=='golfriend.small-business.promotion.v1'||!Number.isSafeInteger(v.version)||!v.promotionId)throw new Error('INVALID_COMMAND_RESULT')},
 async createSubscriptionIntent(input){const v:any=await invoke('createSmallBusinessSubscriptionIntentV1',input);if(v?.schema!=='golfriend.small-business.subscription-intent.v1'||v.state!=='prepared'||v.entitlementState!=='not_granted'||v.revenueState!=='not_recognized')throw new Error('INVALID_COMMAND_RESULT');return{intentId:v.intentId}},
 async createSubscriptionCheckout(input){const v:any=await invoke('createSmallBusinessSubscriptionCheckoutV1',input);if(v?.schema!=='golfriend.small-business.checkout-session.v1'||v.status!=='checkout_pending'||!/^https:\/\//.test(v.checkoutUrl))throw new Error('INVALID_CHECKOUT_RESULT');return{checkoutUrl:v.checkoutUrl,status:v.status}},
 async subscriptionState(){const v:any=await invoke('getSmallBusinessSubscriptionStateV1');if(v?.schema!=='golfriend.small-business.subscription-state.v1'||!['trial_active','checkout_pending','paid','payment_failed','cancelled','provider_unavailable'].includes(v.status))throw new Error('INVALID_SUBSCRIPTION_STATE');return v},
 async discover(input){try{const value=await invoke<DiscoveryProjection>('discoverSmallBusinessesV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items)||!value.items.every(isSafeCard))throw new Error();return value}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'DISCOVERY_UNAVAILABLE'}}},
 async adminQueue(input){try{const value:any=await invoke('listSmallBusinessApplicationsAdminV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items))throw new Error();return{...value,items:value.items.map((x:any)=>({...x,displayName:x.displayName||x.publicName,country:x.country||x.countryCode}))}}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'ADMIN_QUEUE_UNAVAILABLE'}}},
 async adminDecision(input){const value:any=await invoke('decideSmallBusinessApplicationAdminV1',{...input,action:input.decision==='reactivate'?'activate':input.decision});if(value?.schema!==SMALL_BUSINESS_SCHEMA||!value.receiptId)throw new Error('INVALID_SERVER_PROJECTION')},
 async adminDetail(businessId){const v:any=await invoke('getSmallBusinessApplicationAdminV1',{businessId});if(v?.schema!==SMALL_BUSINESS_SCHEMA||!v.business||!Array.isArray(v.evidenceReferences)||!Array.isArray(v.history))throw new Error('INVALID_SERVER_PROJECTION');return v},
 async reviewPromotion(input){const v:any=await invoke('reviewSmallBusinessPromotionAdminV1',input);if(v?.schema!=='golfriend.small-business.promotion.v1'||!Number.isSafeInteger(v.version))throw new Error('INVALID_COMMAND_RESULT')},
 async reporting(){const v:any=await invoke('getSmallBusinessReportingAdminV1');if(v?.schema!=='golfriend.small-business.reporting.v1'||!v.semantics||v.semantics.teeCirculationIsCashRevenue!==false)throw new Error('INVALID_REPORT');return v},
 async prepareJhcc(batchId){const v:any=await invoke('prepareSmallBusinessJhccReportAdminV1',{batchId});if(v?.schema!=='golfriend.small-business.jhcc-report.v1'||v.transmission!=='disabled')throw new Error('INVALID_JHCC_PREPARATION');return v},
 async adminCorrection(businessId){const v:any=await invoke('getSmallBusinessProfileCorrectionAdminV1',{businessId});if(v?.schema!=='golfriend.small-business.profile-correction.v1'||v?.state!=='current'||!v.correction||!v.canonical)throw new Error('INVALID_CORRECTION_PROJECTION');return v},
 async decideCorrection(input){const v:any=await invoke('decideSmallBusinessProfileCorrectionAdminV1',input);if(v?.schema!=='golfriend.small-business.profile-correction.v1'||!v.receiptId||!Number.isSafeInteger(v.version))throw new Error('INVALID_CORRECTION_DECISION')},
};
