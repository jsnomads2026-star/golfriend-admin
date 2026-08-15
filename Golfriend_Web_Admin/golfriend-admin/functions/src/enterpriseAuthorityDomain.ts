import {createHash} from "node:crypto";
export const AUTHORITY_SCHEMA="golfriend.enterprise-organization-authority.v1" as const;
export const AUTHORITY_COMMAND_SCHEMA="golfriend.enterprise-organization-authority.command.v1" as const;
export const ROLES=["organization_owner","organization_admin","course_manager","booking_staff","tournament_staff","marketing_content_staff","analyst_viewer"] as const;
export const STATUSES=["pending","active","suspended","expired","revoked"] as const;
export type EnterpriseRole=typeof ROLES[number];
export type AuthorityStatus=typeof STATUSES[number];
export type AuthorityScope={kind:"organization";organizationId:string}|{kind:"course";organizationId:string;propertyId:string;courseId:string};
export type AuthorityRecord={membershipId:string;bindingUid:string;organizationId:string;role:EnterpriseRole;scope:AuthorityScope;status:AuthorityStatus;effectiveAt:string;expiresAt:string|null;version:number;grantIds:string[]};
export type GrantRecord={grantId:string;membershipId:string;organizationId:string;propertyId:string|null;courseId:string|null;capabilities:string[];status:AuthorityStatus;effectiveAt:string;expiresAt:string|null;version:number};
export type Hierarchy={organizations:any[];properties:any[];courses:any[]};
const digest=(...parts:string[])=>createHash("sha256").update(parts.join("|")).digest("hex").slice(0,32);
export const authorityReceiptId=(uid:string,kind:string,sourceVersion:string)=>`ear_${digest(uid,kind,sourceVersion)}`;
export const authorityDecisionVersion=(memberships:AuthorityRecord[],grants:GrantRecord[])=>digest(JSON.stringify(memberships.map(x=>[x.membershipId,x.version,x.status])),JSON.stringify(grants.map(x=>[x.grantId,x.version,x.status])));
export function stableId(value:unknown,label="ID"){const v=String(value||"");if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(v))throw new Error(`${label}_INVALID`);return v}
const instant=(value:unknown,label:string)=>{const v=typeof value==="string"?value:"";if(!v||!Number.isFinite(Date.parse(v)))throw new Error(`${label}_INVALID`);return v};
const status=(v:unknown)=>{if(!STATUSES.includes(v as any))throw new Error("STATUS_INVALID");return v as AuthorityStatus};
const role=(v:unknown)=>{if(!ROLES.includes(v as any))throw new Error("ROLE_INVALID");return v as EnterpriseRole};
export function normalizeMembership(raw:any):AuthorityRecord{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("MEMBERSHIP_MALFORMED");
 const organizationId=stableId(raw.organizationId,"ORGANIZATION"),kind=raw.scope?.kind;
 const scope:AuthorityScope=kind==="organization"?{kind,organizationId}:kind==="course"?{kind,organizationId,propertyId:stableId(raw.scope.propertyId,"PROPERTY"),courseId:stableId(raw.scope.courseId,"COURSE")}:(()=>{throw new Error("SCOPE_INVALID")})();
 if(raw.scope.organizationId!==organizationId)throw new Error("SCOPE_ORGANIZATION_MISMATCH");
 const grantIds=Array.isArray(raw.grantIds)?raw.grantIds.map((x:unknown)=>stableId(x,"GRANT")):[];
 if(new Set(grantIds).size!==grantIds.length)throw new Error("DUPLICATE_GRANT");
 const version=Number(raw.version);if(!Number.isSafeInteger(version)||version<1)throw new Error("VERSION_INVALID");
 return{membershipId:stableId(raw.membershipId,"MEMBERSHIP"),bindingUid:stableId(raw.bindingUid,"UID"),organizationId,role:role(raw.role),scope,status:status(raw.status),effectiveAt:instant(raw.effectiveAt,"EFFECTIVE_AT"),expiresAt:raw.expiresAt==null?null:instant(raw.expiresAt,"EXPIRES_AT"),version,grantIds};
}
export function normalizeGrant(raw:any):GrantRecord{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("GRANT_MALFORMED");const capabilities=Array.isArray(raw.capabilities)?raw.capabilities.map(String):[];if(!capabilities.length||new Set(capabilities).size!==capabilities.length)throw new Error("CAPABILITIES_INVALID");const version=Number(raw.version);if(!Number.isSafeInteger(version)||version<1)throw new Error("VERSION_INVALID");return{grantId:stableId(raw.grantId,"GRANT"),membershipId:stableId(raw.membershipId,"MEMBERSHIP"),organizationId:stableId(raw.organizationId,"ORGANIZATION"),propertyId:raw.propertyId==null?null:stableId(raw.propertyId,"PROPERTY"),courseId:raw.courseId==null?null:stableId(raw.courseId,"COURSE"),capabilities,status:status(raw.status),effectiveAt:instant(raw.effectiveAt,"EFFECTIVE_AT"),expiresAt:raw.expiresAt==null?null:instant(raw.expiresAt,"EXPIRES_AT"),version};}
export function effective(statusValue:AuthorityStatus,effectiveAt:string,expiresAt:string|null,now:string){const t=Date.parse(now);return statusValue==="active"&&Date.parse(effectiveAt)<=t&&(!expiresAt||Date.parse(expiresAt)>t)}
export function activeCourseAuthority(m:AuthorityRecord,g:GrantRecord[],hierarchy:Hierarchy,now:string,capability:string){
 if(m.scope.kind!=="course"||!effective(m.status,m.effectiveAt,m.expiresAt,now))return false;
 const scope=m.scope,org=hierarchy.organizations.find(x=>x.organizationId===m.organizationId),property=hierarchy.properties.find(x=>x.propertyId===scope.propertyId&&x.organizationId===m.organizationId),course=hierarchy.courses.find(x=>x.courseId===scope.courseId&&x.propertyId===scope.propertyId&&x.organizationId===m.organizationId);
 if(!org||!property||!course||org.status!=="active"||property.status!=="active"||course.status!=="active")return false;
 const matched=g.filter(x=>m.grantIds.includes(x.grantId));if(matched.length!==m.grantIds.length)return false;
 return matched.some(x=>x.membershipId===m.membershipId&&x.organizationId===m.organizationId&&x.propertyId===scope.propertyId&&x.courseId===scope.courseId&&effective(x.status,x.effectiveAt,x.expiresAt,now)&&x.capabilities.includes(capability));
}
export function resolveAuthority(uid:string,rawMemberships:any[],rawGrants:any[],hierarchy:Hierarchy,now:string){
 const memberships=rawMemberships.map(normalizeMembership);if(memberships.some(x=>x.bindingUid!==uid))throw new Error("BINDING_UID_MISMATCH");
 if(new Set(memberships.map(x=>x.membershipId)).size!==memberships.length)throw new Error("DUPLICATE_MEMBERSHIP");
 const grants=rawGrants.map(normalizeGrant);if(new Set(grants.map(x=>x.grantId)).size!==grants.length)throw new Error("DUPLICATE_GRANT_RECORD");
 for(const m of memberships){if(!hierarchy.organizations.some(x=>x.organizationId===m.organizationId))throw new Error("MISSING_ORGANIZATION");if(m.scope.kind==="course"){const scope=m.scope;if(!hierarchy.properties.some(x=>x.propertyId===scope.propertyId&&x.organizationId===m.organizationId)||!hierarchy.courses.some(x=>x.courseId===scope.courseId&&x.propertyId===scope.propertyId&&x.organizationId===m.organizationId))throw new Error("MISSING_HIERARCHY")}}
 return{memberships,grants,sourceVersion:authorityDecisionVersion(memberships,grants)};
}
