import {httpsCallable} from 'firebase/functions';
import {functions} from '../../firebaseConfig';
import {SMALL_BUSINESS_SCHEMA,isPortalProjection,isSafeCard,type AdminQueueProjection,type DiscoveryProjection,type PortalProjection,type SmallBusinessLocale} from './smallBusinessModel';
const invoke=async<T>(name:string,input:Record<string,unknown>={})=>(await httpsCallable(functions,name)(input)).data as T;
const unavailablePortal=(ref:string):PortalProjection=>({schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',locations:[],plans:[],promotions:[],receipts:[],supportReference:ref});
export interface SmallBusinessProvider {
 portal(locale:SmallBusinessLocale):Promise<PortalProjection>;
 submitProfile(input:Record<string,unknown>):Promise<PortalProjection>;
 submitApplication(input:Record<string,unknown>):Promise<PortalProjection>;
 withdraw(input:Record<string,unknown>):Promise<PortalProjection>;
 preparePromotion(input:Record<string,unknown>):Promise<PortalProjection>;
 createSubscriptionIntent(input:Record<string,unknown>):Promise<PortalProjection>;
 discover(input:Record<string,unknown>):Promise<DiscoveryProjection>;
 adminQueue(input:Record<string,unknown>):Promise<AdminQueueProjection>;
 adminDecision(input:Record<string,unknown>):Promise<void>;
}
function portalResult(value:unknown){if(isPortalProjection(value))return value;const v=value as any,p=v?.profile;if(v?.schema!==SMALL_BUSINESS_SCHEMA||v?.state!=='current'||!v.businessId||!p)return unavailablePortal('INVALID_SERVER_PROJECTION');return{schema:SMALL_BUSINESS_SCHEMA,state:'current',business:{businessId:v.businessId,version:v.version,displayName:p.publicName,category:p.category,status:v.status,serviceArea:p.serviceArea||'',supportedLocales:p.supportedLocales||[]},locations:(p.locations||[]).map((x:any)=>({locationId:x.locationId,label:x.name,city:x.city,country:x.countryCode,hours:x.operatingHours||[]})),plans:[],promotions:[],receipts:[]};}
export const firebaseSmallBusinessProvider:SmallBusinessProvider={
 async portal(locale){try{return portalResult(await invoke('getSmallBusinessPortalV1',{locale}))}catch{return unavailablePortal('SMALL_BUSINESS_PORTAL_UNAVAILABLE')}},
 async submitProfile(input){return portalResult(await invoke('saveSmallBusinessProfileV1',input))},
 async submitApplication(input){return portalResult(await invoke('submitSmallBusinessApplicationV1',input))},
 async withdraw(input){return portalResult(await invoke('withdrawSmallBusinessApplicationV1',input))},
 async preparePromotion(input){return portalResult(await invoke('prepareSmallBusinessPromotionV1',input))},
 async createSubscriptionIntent(input){return portalResult(await invoke('createSmallBusinessSubscriptionIntentV1',input))},
 async discover(input){try{const value=await invoke<DiscoveryProjection>('discoverSmallBusinessesV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items)||!value.items.every(isSafeCard))throw new Error();return value}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'DISCOVERY_UNAVAILABLE'}}},
 async adminQueue(input){try{const value:any=await invoke('listSmallBusinessApplicationsAdminV1',input);if(value?.schema!==SMALL_BUSINESS_SCHEMA||!Array.isArray(value.items))throw new Error();return{...value,items:value.items.map((x:any)=>({...x,displayName:x.displayName||x.publicName,country:x.country||x.countryCode}))}}catch{return{schema:SMALL_BUSINESS_SCHEMA,state:'unavailable',items:[],supportReference:'ADMIN_QUEUE_UNAVAILABLE'}}},
 async adminDecision(input){const value:any=await invoke('decideSmallBusinessApplicationAdminV1',{...input,action:input.decision==='reactivate'?'activate':input.decision});if(value?.schema!==SMALL_BUSINESS_SCHEMA||!value.receiptId)throw new Error('INVALID_SERVER_PROJECTION')},
};
