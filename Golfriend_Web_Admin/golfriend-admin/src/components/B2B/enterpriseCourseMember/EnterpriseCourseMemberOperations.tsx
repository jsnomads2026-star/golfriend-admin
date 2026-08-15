import {useEffect,useMemo,useState} from "react";
import {organizationAuthorityService} from "../enterprise/organizationAuthorityService";
import type {CourseProfileAuthorityContext} from "../enterprise/courseProfileOperationsModel";
import type {EnterpriseAuthorityProjection} from "../enterprise/organizationAuthorityModel";
import {ENTERPRISE_AUTHORITY_COPY,ENTERPRISE_AUTHORITY_LOCALES,type EnterpriseAuthorityLocale} from "../../../i18n/partner/enterpriseAuthority";
import {useLocale} from "../../../i18n/hooks";
import EnterpriseCourseProfileOperations from "../enterpriseCourseProfile/EnterpriseCourseProfileOperations";
import EnterpriseMemberLinking from "../enterpriseMemberLinking/EnterpriseMemberLinking";

export default function EnterpriseCourseMemberOperations(){
  const locale=useLocale() as EnterpriseAuthorityLocale;
  const copy=ENTERPRISE_AUTHORITY_COPY[ENTERPRISE_AUTHORITY_LOCALES.includes(locale)?locale:"en"];
  const [authority,setAuthority]=useState<EnterpriseAuthorityProjection|null>(null);
  const [organizationId,setOrganizationId]=useState("");
  const [propertyId,setPropertyId]=useState("");
  const [courseId,setCourseId]=useState("");
  useEffect(()=>{void organizationAuthorityService.load().then(value=>{setAuthority(value);setOrganizationId(value.selectedOrganizationId||"")})},[]);
  const organizations=authority?.organizations.filter(org=>authority.actorMembershipIds.some(id=>authority.memberships.some(member=>member.membershipId===id&&member.organizationId===org.organizationId&&member.status==="active")))||[];
  const organization=organizations.find(item=>item.organizationId===organizationId);
  const properties=organization?.properties||[];
  const property=properties.find(item=>item.propertyId===propertyId);
  const courses=property?.courses||[];
  const course=courses.find(item=>item.courseId===courseId);
  useEffect(()=>{if(!properties.some(item=>item.propertyId===propertyId))setPropertyId(properties[0]?.propertyId||"")},[properties,propertyId]);
  useEffect(()=>{if(!courses.some(item=>item.courseId===courseId))setCourseId(courses[0]?.courseId||"")},[courses,courseId]);
  const membership=authority?.memberships.find(member=>authority.actorMembershipIds.includes(member.membershipId)&&member.status==="active"&&member.organizationId===organizationId&&member.scope.kind==="course"&&member.scope.propertyId===propertyId&&member.scope.courseId===courseId&&(member.role==="course_manager"||member.role==="marketing_content_staff"));
  const context=useMemo<CourseProfileAuthorityContext|null>(()=>membership&&course?{actorMembershipId:membership.membershipId,organizationId,propertyId,courseId,role:membership.role,scope:membership.scope,organizationStatus:organization?.status||"unavailable",courseStatus:course.status}:null,[membership,organizationId,propertyId,courseId,organization?.status,course]);
  return <div style={{display:"grid",gap:24}}>
    <fieldset><legend>{copy.select}</legend>
      <label>{copy.organization}<select value={organizationId} onChange={event=>{setOrganizationId(event.target.value);setPropertyId("");setCourseId("")}}><option value="">—</option>{organizations.map(item=><option key={item.organizationId} value={item.organizationId}>{item.displayName} · {item.organizationId}</option>)}</select></label>
      <label>{copy.property}<select value={propertyId} onChange={event=>{setPropertyId(event.target.value);setCourseId("")}}><option value="">—</option>{properties.map(item=><option key={item.propertyId} value={item.propertyId}>{item.displayName} · {item.propertyId}</option>)}</select></label>
      <label>{copy.course}<select value={courseId} onChange={event=>setCourseId(event.target.value)}><option value="">—</option>{courses.map(item=><option key={item.courseId} value={item.courseId}>{item.displayName} · {item.courseId}</option>)}</select></label>
    </fieldset>
    <EnterpriseCourseProfileOperations context={context}/>
    <EnterpriseMemberLinking/>
  </div>;
}
