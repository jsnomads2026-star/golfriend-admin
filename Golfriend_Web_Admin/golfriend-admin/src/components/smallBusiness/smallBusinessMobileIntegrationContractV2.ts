import {LOCALE_CODES,type CanonicalLocale} from '../../i18n/locales';

export const SMALL_BUSINESS_MOBILE_SCHEMA_V2='golfriend.small-business.mobile-integration.v2' as const;
export type MobileBusinessStateV2='current'|'empty'|'unavailable'|'tombstone'|'stale';
export type MobileInquiryStateV2='prepared'|'awaiting_provider'|'transmitted'|'failed'|'cancelled'|'expired';
export type MobileBusinessErrorV2='UNAUTHENTICATED'|'APP_CHECK_REQUIRED'|'FORBIDDEN'|'INVALID_ARGUMENT'|'STALE_VERSION'|'REPLAY_PAYLOAD_CHANGED'|'BUSINESS_UNAVAILABLE'|'BUSINESS_SUSPENDED'|'LOCATION_UNAVAILABLE'|'MEMBER_BINDING_MISMATCH'|'PROJECTION_EXPIRED'|'INQUIRY_TRANSITION_DENIED'|'HANDOFF_NOT_COMMISSIONED'|'UNAVAILABLE';
export type MobileProjectionEvidenceV2={schema:typeof SMALL_BUSINESS_MOBILE_SCHEMA_V2;version:2;state:MobileBusinessStateV2;locale:CanonicalLocale;issuedAt:string;freshUntil:string;memberBinding:string;authoritativeStatus:'active'|'unavailable'};
export type MobileBusinessCardV2={businessId:string;profileVersion:number;profileDigest:string;locationId:string;locationVersion:number;displayName:string;category:string;city:string;country:string;description:string;availability:'known'|'unknown';partner:boolean;sponsored:boolean;disclosure:string;authoritativeStatus:'active';returnRoute:'/v2'};
export type MobileBusinessProjectionV2=MobileProjectionEvidenceV2&{items:MobileBusinessCardV2[];nextCursor?:string;rawLocationPersisted:false;returnRoute:'/v2'};
export type MobileEngagementCommandV2={commandId:string;businessId:string;expectedProfileVersion:number;locationId:string;expectedLocationVersion:number;kind:'favorite'|'unfavorite'|'view';payloadFingerprint:string};
export type MobileInquiryCommandV2={commandId:string;businessId:string;expectedProfileVersion:number;locationId:string;expectedLocationVersion:number;locale:CanonicalLocale;payloadFingerprint:string};
export type MobileInquiryProjectionV2=MobileProjectionEvidenceV2&{inquiryId:string;inquiryVersion:number;inquiryState:MobileInquiryStateV2;businessId:string;profileVersion:number;locationId:string;locationVersion:number;preview:string;providerState:'not_commissioned'|'awaiting_provider'|'approved_receipt'|'failed_evidence';expiresAt:string;transmission:false|{receiptId:string};returnRoute:'/v2'};
export const SMALL_BUSINESS_MOBILE_CALLABLES_V2={list:'discoverSmallBusinessesV2',detail:'getSmallBusinessDetailV2',engagement:'recordSmallBusinessEngagementV2',favorites:'listSmallBusinessFavoritesV2',recentViews:'listSmallBusinessRecentViewsV2',prepareInquiry:'prepareSmallBusinessInquiryV2',getInquiry:'getSmallBusinessInquiryV2',inquiryHistory:'listSmallBusinessInquiryHistoryV2',cancelInquiry:'cancelSmallBusinessInquiryV2'} as const;
export const SMALL_BUSINESS_MOBILE_LOCALES_V2=LOCALE_CODES;
export const SMALL_BUSINESS_MOBILE_PRIVACY_V2={rawUid:false,rawLocationPersisted:false,providerCredentials:false,privateEvidence:false,staffData:false,subscriptionData:false,jhccData:false} as const;
