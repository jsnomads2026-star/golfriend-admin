import {httpsCallable} from 'firebase/functions';
import {functions} from '../../firebaseConfig';
import {SMALL_BUSINESS_SCHEMA,isPortalProjection,isSafeCard,type AdminQueueProjection,type DiscoveryProjection,type PortalProjection,type SmallBusinessLocale} from './smallBusinessModel';
const invoke=async<T>(name:string,input:Record<string,unknown>={})=>(await httpsCallable(functions,name)(input)).data as T;
const unavailablePortal=(ref:string):PortalProjection=>({schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',locations:[],plans:[],promotions:[],receipts:[],supportReference:ref});
export interface SmallBusinessProvider {
 portal(locale:SmallBusinessLocale):Promise<PortalProjection>;
 submitProfile(input:Record<string,unknown>):Promise<void>;
 submitApplication(input:Record<string,unknown>):Promise<void>;
 withdraw(input:Record<string,unknown>):Promise<void>;
 preparePromotion(input:Record<string,unknown>):Promise<void>;
 createSubscriptionIntent(input:Record<string,unknown>):Promise<void>;
 discover(input:Record<string,unknown>):Promise<DiscoveryProjection>;
 adminQueue(input:Record<string,unknown>):Promise<AdminQueueProjection>;
 adminDecision(input:Record<string,unknown>):Promise<void>;
 adminDetail(businessId:string):Promise<any>;
 reviewPromotion(input:Record<string,unknown>):Promise<void>;
 reporting():Promise<any>;
 prepareJhcc(batchId:string):Promise<any>;
}
function portalResult(value:unknown){const v=value as any;if(v?.schema===SMALL_BUSINESS_SCHEMA&&v?.state==='current'&&v.business&&Array.isArray(v.locations))return{...v,plans:(v.plans||[]).map((x:any)=>({planId:x.planId,version:x.version??x.planVersion,effectiveFrom:x.effectiveFrom||'',features:x.features||[],status:x.status??'unavailable',priceDisplay:x.accountingState||undefined})),receipts:(v.receipts||[]).map((x:any)=>({...x,version:x.version??x.businessVersion}))};if(isPortalProjection(value))return value;const p=v?.profile;if(v?.schema!==SMALL_BUSINESS_SCHEMA||v?.state!=='current'||!v.businessId||!p)return unavailablePortal('INVALID_SERVER_PROJECTION');return{schema:SMALL_BUSINESS_SCHEMA,state:'current',business:{businessId:v.businessId,version:v.version,displayName:p.publicName,category:p.category,status:v.status,serviceArea:p.serviceArea||'',supportedLocales:p.supportedLocales||[]},locations:(p.locations||[]).map((x:any)=>({locationId:x.locationId,label:x.name,city:x.city,country:x.countryCode,hours:x.operatingHours||[]})),plans:[],promotions:[],receipts:[]};}
export const firebaseSmallBusinessProvider:SmallBusinessProvider={
 async portal(locale){try{return portalResult(await invoke('getSmallBusinessPortalV1',{locale}))}catch{return unavailablePortal('SMALL_BUSINESS_PORTAL_UNAVAILABLE')}},
 async submitProfile(input){const v:any=await invoke('saveSmallBusinessProfileV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async submitApplication(input){const v:any=await invoke('submitSmallBusinessApplicationV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async withdraw(input){const v:any=await invoke('withdrawSmallBusinessApplicationV1',input);if(v?.schema!==SMALL_BUSINESS_SCHEMA||!Number.isSafeInteger(v.version)||!v.businessId)throw new Error('INVALID_COMMAND_RESULT')},
 async preparePromotion(input){const v:any=await invoke('prepareSmallBusinessPromotionV1',input);if(v?.schema!=='golfriend.small-business.promotion.v1'||!Number.isSafeInteger(v.version)||!v.promotionId)throw new Error('INVALID_COMMAND_RESULT')},
 async createSubscriptionIntent(input){const v:any=await invoke('createSmallBusinessSubscriptionIntentV1',input);if(v?.schema!=='golfriend.small-business.subscription-intent.v1'||v.state!=='prepared'||v.entitlementState!=='not_granted'||v.revenueState!=='not_recognized')throw new Error('INVALID_COMMAND_RESULT')},
 async discover(input){try{const value=await invoke<DiscoveryProjection>('discoverSmallBusinessesV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items)||!value.items.every(isSafeCard))throw new Error();return value}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'DISCOVERY_UNAVAILABLE'}}},
 async adminQueue(input){try{const value:any=await invoke('listSmallBusinessApplicationsAdminV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items))throw new Error();return{...value,items:value.items.map((x:any)=>({...x,displayName:x.displayName||x.publicName,country:x.country||x.countryCode}))}}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'ADMIN_QUEUE_UNAVAILABLE'}}},
 async adminDecision(input){const value:any=await invoke('decideSmallBusinessApplicationAdminV1',{...input,action:input.decision==='reactivate'?'activate':input.decision});if(value?.schema!==SMALL_BUSINESS_SCHEMA||!value.receiptId)throw new Error('INVALID_SERVER_PROJECTION')},
 async adminDetail(businessId){const v:any=await invoke('getSmallBusinessApplicationAdminV1',{businessId});if(v?.schema!==SMALL_BUSINESS_SCHEMA||!v.business||!Array.isArray(v.evidenceReferences)||!Array.isArray(v.history))throw new Error('INVALID_SERVER_PROJECTION');return v},
 async reviewPromotion(input){const v:any=await invoke('reviewSmallBusinessPromotionAdminV1',input);if(v?.schema!=='golfriend.small-business.promotion.v1'||!Number.isSafeInteger(v.version))throw new Error('INVALID_COMMAND_RESULT')},
 async reporting(){const v:any=await invoke('getSmallBusinessReportingAdminV1');if(v?.schema!=='golfriend.small-business.reporting.v1'||!v.semantics||v.semantics.teeCirculationIsCashRevenue!==false)throw new Error('INVALID_REPORT');return v},
 async prepareJhcc(batchId){const v:any=await invoke('prepareSmallBusinessJhccReportAdminV1',{batchId});if(v?.schema!=='golfriend.small-business.jhcc-report.v1'||v.transmission!=='disabled')throw new Error('INVALID_JHCC_PREPARATION');return v},
};
