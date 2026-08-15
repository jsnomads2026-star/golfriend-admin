import {useCallback, useEffect, useId, useMemo, useState} from "react";
import {useLocale} from "../../../i18n/hooks";
import {ENTERPRISE_TOURNAMENT_COPY, ENTERPRISE_TOURNAMENT_LOCALES, type EnterpriseTournamentLocale} from "../../../i18n/partner/enterpriseTournament";
import {organizationAuthorityService} from "../enterprise/organizationAuthorityService";
import {EnterpriseTournamentOperationsService} from "../enterprise/tournamentOperationsService";
import type {EnterpriseAuthorityProjection, StaffMembershipProjection} from "../enterprise/organizationAuthorityModel";
import type {TournamentAuthorityContext, TournamentOperationsProjection} from "../enterprise/tournamentOperationsModel";

const unavailableService = new EnterpriseTournamentOperationsService(null);
type Props = {service?: EnterpriseTournamentOperationsService};

export default function EnterpriseTournamentOperations({service=unavailableService}: Props){
  const locale=useLocale() as EnterpriseTournamentLocale, copy=ENTERPRISE_TOURNAMENT_COPY[ENTERPRISE_TOURNAMENT_LOCALES.includes(locale)?locale:"en"], prefix=useId();
  const [authority,setAuthority]=useState<EnterpriseAuthorityProjection|null>(null),[projection,setProjection]=useState<TournamentOperationsProjection|null>(null);
  const [organizationId,setOrganizationId]=useState(""),[propertyId,setPropertyId]=useState(""),[courseId,setCourseId]=useState(""),[loading,setLoading]=useState(true);
  const organizations=authority?.organizations.filter(org=>authority.actorMembershipIds.some(id=>authority.memberships.some(m=>m.membershipId===id&&m.organizationId===org.organizationId&&m.status==="active")))||[];
  const organization=organizations.find(item=>item.organizationId===organizationId), properties=organization?.properties||[], property=properties.find(item=>item.propertyId===propertyId), courses=property?.courses||[];
  const membership: StaffMembershipProjection|undefined=authority?.memberships.find(item=>authority.actorMembershipIds.includes(item.membershipId)&&item.status==="active"&&item.organizationId===organizationId&&item.scope.kind==="course"&&item.scope.propertyId===propertyId&&item.scope.courseId===courseId&&(item.role==="course_manager"||item.role==="tournament_staff"));
  const context=useMemo<TournamentAuthorityContext|null>(()=>membership?{actorMembershipId:membership.membershipId,organizationId,propertyId,courseId,role:membership.role,scope:membership.scope,organizationStatus:organization?.status||"unavailable"}:null,[membership,organizationId,propertyId,courseId,organization?.status]);
  const loadAuthority=useCallback(async()=>{setLoading(true);const next=await organizationAuthorityService.load();setAuthority(next);const org=next.organizations.find(o=>next.actorMembershipIds.some(id=>next.memberships.some(m=>m.membershipId===id&&m.organizationId===o.organizationId&&m.status==="active")));setOrganizationId(current=>next.organizations.some(o=>o.organizationId===current)?current:org?.organizationId||"");setLoading(false)},[]);
  useEffect(()=>{void loadAuthority()},[loadAuthority]);
  useEffect(()=>{const first=properties[0];if(!properties.some(item=>item.propertyId===propertyId))setPropertyId(first?.propertyId||"")},[properties,propertyId]);
  useEffect(()=>{const first=courses[0];if(!courses.some(item=>item.courseId===courseId))setCourseId(first?.courseId||"")},[courses,courseId]);
  const read=useCallback(async()=>{if(!context){setProjection(null);return}setLoading(true);try{setProjection(await service.read(context))}finally{setLoading(false)}},[context,service]);
  useEffect(()=>{void read()},[read]);
  if(loading&&!authority)return <section aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{copy.title}</h2><p role="status" aria-live="polite">{copy.loading}</p></section>;
  const state=projection?.state||"unavailable";
  return <section aria-labelledby={`${prefix}-title`} style={{display:"grid",gap:16}}>
    <header><h2 id={`${prefix}-title`}>{copy.title}</h2><p>{copy.intro}</p></header>
    <p role="note"><strong>{copy.scope}</strong></p><p role="note">{copy.boundary}</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
      <label htmlFor={`${prefix}-org`}>{copy.organization}<select id={`${prefix}-org`} value={organizationId} onChange={event=>{setOrganizationId(event.target.value);setPropertyId("");setCourseId("")}}><option value="">— {copy.select} —</option>{organizations.map(item=><option key={item.organizationId} value={item.organizationId}>{item.displayName} · {item.organizationId}</option>)}</select></label>
      <label htmlFor={`${prefix}-property`}>{copy.property}<select id={`${prefix}-property`} value={propertyId} onChange={event=>{setPropertyId(event.target.value);setCourseId("")}}><option value="">— {copy.select} —</option>{properties.map(item=><option key={item.propertyId} value={item.propertyId}>{item.displayName} · {item.propertyId}</option>)}</select></label>
      <label htmlFor={`${prefix}-course`}>{copy.course}<select id={`${prefix}-course`} value={courseId} onChange={event=>setCourseId(event.target.value)}><option value="">— {copy.select} —</option>{courses.map(item=><option key={item.courseId} value={item.courseId}>{item.displayName} · {item.courseId}</option>)}</select></label>
    </div>
    {loading?<p role="status" aria-live="polite">{copy.loading}</p>:state==="suspended"?<p role="alert">{copy.suspended}</p>:state==="stale"?<><p role="status">{copy.stale}</p><button type="button" onClick={()=>void read()}>{copy.retry}</button></>:state==="unavailable"?<div role="alert"><p>{copy.unavailable}</p>{projection?.supportReference&&<p><code>{projection.supportReference}</code></p>}<button type="button" disabled={!context} onClick={()=>void read()}>{copy.retry}</button></div>:state==="empty"?<p>{copy.empty}</p>:<div style={{overflowX:"auto"}}><table><caption>{copy.title}</caption><thead><tr><th>{copy.title}</th><th>{copy.status}</th><th>{copy.starts}</th><th>{copy.updated}</th></tr></thead><tbody>{projection!.tournaments.map(item=><tr key={item.tournamentId}><td>{item.name}<br/><code>{item.tournamentId}</code></td><td>{item.state}</td><td><time dateTime={item.startsAt}>{item.startsAt}</time></td><td><time dateTime={item.updatedAt}>{item.updatedAt}</time></td></tr>)}</tbody></table></div>}
    {!!projection?.references.length&&<section aria-labelledby={`${prefix}-receipts`}><h3 id={`${prefix}-receipts`}>{copy.receipts}</h3><ol>{projection.references.map(item=><li key={item.referenceId}><code>{item.referenceId}</code> · {item.action} · <time dateTime={item.occurredAt}>{item.occurredAt}</time></li>)}</ol></section>}
    <aside aria-labelledby={`${prefix}-support`}><h3 id={`${prefix}-support`}>{copy.support}</h3><p>{copy.supportBody}</p><code>{projection?.supportReference||"GF-SB-005/GF-SB-006:TOURNAMENT_PRODUCER_UNAVAILABLE"}</code></aside>
  </section>;
}
