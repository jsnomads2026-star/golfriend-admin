import {getFunctions,httpsCallable} from "firebase/functions";

export const COURSE_MEMBER_SCHEMA="golfriend.enterprise-course-member-management.v1" as const;
export type MemberState="invitation_draft"|"awaiting_delivery_provider"|"invited"|"joined"|"active"|"inactive"|"change_requested"|"conflict_review"|"unavailable";
export type ChangeType="resend_request"|"deactivate"|"reactivate"|"role_change";
export interface MemberContext{membershipId:string;organizationId:string;propertyId:string;courseId:string}
export interface MemberProjection{memberReference:string;displayName:string;role:string|null;state:MemberState;locale:string;version:number;updatedAt:string}
export interface MemberReceipt{receiptId:string;action:string;occurredAt:string;immutable:true}
export interface MemberDirectory{schema:typeof COURSE_MEMBER_SCHEMA;courseVersion:number;items:MemberProjection[];nextCursor:string|null}
export interface MemberDetail{schema:typeof COURSE_MEMBER_SCHEMA;courseVersion:number;member:MemberProjection}
export interface MemberDraft{schema:typeof COURSE_MEMBER_SCHEMA;requestId:string;status:"invitation_draft";version:number;replayed:boolean;delivery:{status:"unavailable";sent:false}}
export interface InvitationDraft{commandId:string;intendedMemberReference:string;locale:string;purpose:string;currentCourseVersion:number;expiresAt:string}
export interface CsvPreviewRow{row:number;memberReference:string;displayName:string;contactReference:string;locale:string;purpose:string;result?:"valid"|"duplicate"|"conflict"|"rejected";reason?:string}
export interface CsvPreview{schema:typeof COURSE_MEMBER_SCHEMA;courseVersion:number;previewId:string;rows:CsvPreviewRow[];expiresAt:string;createsAuthAccounts:false;sendsInvitations:false;requiresConfirmation:true}

const call=async<T>(name:string,payload:Record<string,unknown>)=>(await httpsCallable(getFunctions(),name)(payload)).data as T;
export const newMemberCommandId=()=>crypto.randomUUID().replaceAll("-","_");
export const courseMemberService={
 read:(context:MemberContext,filter:{search?:string;state?:MemberState;role?:string;cursor?:string|null;limit:number})=>call<MemberDirectory>("getEnterpriseCourseMembersV1",{context,filter:{search:filter.search,state:filter.state,role:filter.role},cursor:filter.cursor,limit:filter.limit}),
 detail:(context:MemberContext,memberReference:string)=>call<MemberDetail>("getEnterpriseCourseMemberV1",{context,memberReference}),
 draftInvitation:(context:MemberContext,commandId:string,request:Record<string,unknown>)=>call<MemberDraft>("createEnterpriseMemberInvitationDraftV1",{context,commandId,request}),
 draftResend:(context:MemberContext,commandId:string,request:Record<string,unknown>)=>call<MemberDraft>("createEnterpriseMemberResendDraftV1",{context,commandId,request}),
 submitInvitation:(context:MemberContext,commandId:string,requestId:string,expectedVersion:number)=>call<unknown>("submitEnterpriseMemberInvitationRequestV1",{context,commandId,requestId,expectedVersion}),
 requestChange:(context:MemberContext,commandId:string,request:Record<string,unknown>)=>call<unknown>("submitEnterpriseMemberChangeRequestV1",{context,commandId,request}),
 previewCsv:(context:MemberContext,commandId:string,csv:string,currentCourseVersion:number)=>call<CsvPreview>("previewEnterpriseMemberCsvImportV1",{context,commandId,csv,currentCourseVersion}),
 confirmCsv:(context:MemberContext,command:Record<string,unknown>)=>call<unknown>("submitEnterpriseMemberCsvImportRequestV1",{context,...command}),
};
const ids=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=180;
export function validMemberDirectory(v:unknown,_c:MemberContext):v is MemberDirectory{if(!v||typeof v!=="object")return false;const p=v as MemberDirectory;return p.schema===COURSE_MEMBER_SCHEMA&&Number.isInteger(p.courseVersion)&&p.courseVersion>0&&Array.isArray(p.items)&&p.items.every(m=>ids(m.memberReference)&&ids(m.displayName)&&(m.role===null||ids(m.role))&&states.has(m.state)&&Number.isInteger(m.version)&&m.version>0&&!Number.isNaN(Date.parse(m.updatedAt)))&&(p.nextCursor===null||ids(p.nextCursor));}
const states=new Set<MemberState>(["invitation_draft","awaiting_delivery_provider","invited","joined","active","inactive","change_requested","conflict_review","unavailable"]);
