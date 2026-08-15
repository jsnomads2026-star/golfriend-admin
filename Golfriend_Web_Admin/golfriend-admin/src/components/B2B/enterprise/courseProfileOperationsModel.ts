import type {AuthorityScope, EnterpriseRole} from "./organizationAuthorityModel.ts";

export const COURSE_PROFILE_OPERATIONS_SCHEMA = "golfriend.enterprise-course-profile.v1" as const;
export const COURSE_PROFILE_LOCALES = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"] as const;
export type CourseProfileLocale = typeof COURSE_PROFILE_LOCALES[number];
export type CourseProfileState = "loading" | "empty" | "review" | "pending" | "approved" | "rejected" | "stale" | "suspended" | "unavailable";

export interface CourseProfileAuthorityContext {
  actorMembershipId: string; organizationId: string; propertyId: string; courseId: string;
  role: EnterpriseRole; scope: AuthorityScope;
  organizationStatus: "pending" | "active" | "suspended" | "unavailable";
  courseStatus: "pending" | "active" | "suspended" | "unavailable";
}
export type LocalizedCourseProfile = Readonly<Record<CourseProfileLocale, {name:string; description:string}>>;
export interface ApprovedCourseProfile {courseId:string; organizationId:string; propertyId:string; version:number; content:LocalizedCourseProfile; approvedAt:string;}
export interface CourseProfileEditAttempt {attemptId:string; courseId:string; organizationId:string; propertyId:string; baseVersion:number; attemptVersion:number; state:Exclude<CourseProfileState,"loading"|"empty"|"suspended"|"unavailable">; submittedAt:string; content:LocalizedCourseProfile; rejectionReason?:string;}
export interface ImmutableCourseProfileReference {referenceId:string; attemptId:string; organizationId:string; propertyId:string; courseId:string; action:string; occurredAt:string; immutable:true;}
export interface CourseProfileProjection {schema:typeof COURSE_PROFILE_OPERATIONS_SCHEMA; producerSchema:typeof COURSE_PROFILE_OPERATIONS_SCHEMA; state:CourseProfileState; canonicalCourseId:string; sourceUpdatedAt:string|null; retryable:boolean; supportReference:string|null; approvedProfile:ApprovedCourseProfile|null; editAttempt:CourseProfileEditAttempt|null; references:readonly ImmutableCourseProfileReference[];}
export interface SubmitCourseProfileEdit {commandId:string; canonicalCourseId:string; baseVersion:number; attemptVersion:number; content:LocalizedCourseProfile;}

export function hasExactCourseProfileScope(context:CourseProfileAuthorityContext):boolean {
  return context.organizationStatus === "active" && context.courseStatus === "active"
    && (context.role === "course_manager" || context.role === "marketing_content_staff")
    && context.scope.kind === "course" && context.scope.organizationId === context.organizationId
    && context.scope.propertyId === context.propertyId && context.scope.courseId === context.courseId;
}
export function hasCompleteLocalizedProfile(content:LocalizedCourseProfile):boolean {
  return COURSE_PROFILE_LOCALES.every(locale => typeof content?.[locale]?.name === "string" && content[locale].name.trim().length > 0 && typeof content[locale].description === "string" && content[locale].description.trim().length > 0);
}
export function unavailableCourseProfile(courseId:string, supportReference="GF-EN-005:COURSE_PROFILE_PRODUCER_UNAVAILABLE"):CourseProfileProjection {
  return Object.freeze({schema:COURSE_PROFILE_OPERATIONS_SCHEMA,producerSchema:COURSE_PROFILE_OPERATIONS_SCHEMA,state:"unavailable",canonicalCourseId:courseId,sourceUpdatedAt:null,retryable:true,supportReference,approvedProfile:null,editAttempt:null,references:Object.freeze([])});
}
