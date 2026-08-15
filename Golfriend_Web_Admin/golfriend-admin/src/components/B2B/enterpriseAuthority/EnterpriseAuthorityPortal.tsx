import {useCallback, useEffect, useId, useMemo, useRef, useState} from "react";
import {useLocale} from "../../../i18n/hooks";
import {ENTERPRISE_AUTHORITY_COPY, ENTERPRISE_AUTHORITY_LOCALES, type EnterpriseAuthorityLocale} from "../../../i18n/partner/enterpriseAuthority";
import {newAuthorityCommandId, organizationAuthorityService} from "../enterprise/organizationAuthorityService";
import {canGrantRole, type AuthorityScope, type EnterpriseAuthorityProjection, type EnterpriseRole} from "../enterprise/organizationAuthorityModel";

const roles = ["organization_owner","organization_admin","course_manager","booking_staff","tournament_staff","marketing_content_staff","analyst_viewer"] as const;
const roleKeys = {organization_owner:"organizationOwner",organization_admin:"organizationAdmin",course_manager:"courseManager",booking_staff:"bookingStaff",tournament_staff:"tournamentStaff",marketing_content_staff:"marketingStaff",analyst_viewer:"analyst"} as const;

export default function EnterpriseAuthorityPortal(){
  const rawLocale=useLocale(),locale:EnterpriseAuthorityLocale=ENTERPRISE_AUTHORITY_LOCALES.includes(rawLocale as EnterpriseAuthorityLocale)?rawLocale as EnterpriseAuthorityLocale:"en",copy=ENTERPRISE_AUTHORITY_COPY[locale];
  const prefix=useId(),retry=useRef<null|(()=>Promise<unknown>)>(null);
  const [view,setView]=useState<EnterpriseAuthorityProjection|null>(null),[state,setState]=useState<"loading"|"ready"|"unavailable">("loading"),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [organizationId,setOrganizationId]=useState(""),[propertyId,setPropertyId]=useState(""),[courseId,setCourseId]=useState("");
  const [email,setEmail]=useState(""),[role,setRole]=useState<(typeof roles)[number]>("analyst_viewer");
  const load=useCallback(async()=>{setState("loading");const next=await organizationAuthorityService.load();if(next.producerStatus!=="available"){setState("unavailable");return}const allowed=next.organizations.filter(org=>next.memberships.some(member=>next.actorMembershipIds.includes(member.membershipId)&&member.organizationId===org.organizationId&&member.status==="active"));setView({...next,organizations:allowed});setOrganizationId((current:string)=>allowed.some(org=>org.organizationId===current)?current:allowed.some(org=>org.organizationId===next.selectedOrganizationId)?next.selectedOrganizationId||"":allowed[0]?.organizationId||"");setState("ready")},[]);
  useEffect(()=>{void load()},[load]);
  const organization=useMemo(()=>view?.organizations?.find((item:any)=>item.organizationId===organizationId),[view,organizationId]);
  const properties=organization?.properties||[],property=properties.find((item:any)=>item.propertyId===propertyId),courses=property?.courses||[];
  useEffect(()=>{if(propertyId&&!properties.some((item:any)=>item.propertyId===propertyId)){setPropertyId("");setCourseId("")}},[organizationId,propertyId,properties]);
  useEffect(()=>{if(courseId&&!courses.some((item:any)=>item.courseId===courseId))setCourseId("")},[propertyId,courseId,courses]);
  const scoped=<T extends {organizationId:string;scope?:AuthorityScope}>(items:T[]=[])=>items.filter(item=>item.organizationId===organizationId&&(!courseId||item.scope?.kind==="course"&&item.scope.propertyId===propertyId&&item.scope.courseId===courseId));
  const run=async(task:()=>Promise<any>)=>{setBusy(true);setNotice("");retry.current=task;try{const result=await task();setNotice(`${copy.accepted} · ${result.receipt?.receiptId||result.operationId||result.status}`);retry.current=null;await load()}catch{setNotice(`${copy.unavailable} ${copy.safeRetry}`)}finally{setBusy(false)}};
  const suspended=organization?.status==="suspended";
  const authorityReady=organization?.status==="active"&&(!propertyId||property?.status==="active")&&(!courseId||courses.find(item=>item.courseId===courseId)?.status==="active");
  const scope:AuthorityScope=courseId?{kind:"course",organizationId,propertyId,courseId}:{kind:"organization",organizationId};
  const actor=view?.memberships.find(item=>view.actorMembershipIds.includes(item.membershipId)&&item.organizationId===organizationId&&item.status==="active");
  const availableRoles=actor?roles.filter(item=>canGrantRole(actor,item,scope)):[];
  const selectedRole=availableRoles.includes(role)?role:availableRoles[0];
  if(state==="loading")return <section aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{copy.title}</h2><p role="status" aria-live="polite">{copy.loading}</p></section>;
  if(state==="unavailable")return <section aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{copy.title}</h2><p role="alert">{copy.unavailable}</p><button type="button" onClick={()=>void load()}>{copy.retry}</button><Support copy={copy}/></section>;
  return <section aria-labelledby={`${prefix}-title`} style={{maxWidth:1100,margin:"0 auto",color:"#eee"}}>
    <header><h2 id={`${prefix}-title`} style={{color:"#d4af37"}}>{copy.title}</h2><p>{copy.intro}</p></header>
    <aside role="note" style={card}><strong>{copy.namesWarning}</strong><p>{copy.scopeWarning}</p></aside>
    {!view?.organizations?.length?<><p role="status">{copy.noOrganizations}</p><Support copy={copy}/></>:<>
      <fieldset style={card} disabled={busy}><legend>{copy.select}</legend>
        <label htmlFor={`${prefix}-org`}>{copy.organization}<select id={`${prefix}-org`} value={organizationId} onChange={e=>{setOrganizationId(e.target.value);setPropertyId("");setCourseId("")}}>{view.organizations.map((item:any)=><option key={item.organizationId} value={item.organizationId}>{item.displayName} · {copy.stableId}: {item.organizationId}</option>)}</select></label>
        <label htmlFor={`${prefix}-property`}>{copy.property}<select id={`${prefix}-property`} value={propertyId} onChange={e=>{setPropertyId(e.target.value);setCourseId("")}}><option value="">—</option>{properties.map((item:any)=><option key={item.propertyId} value={item.propertyId}>{item.displayName} · {copy.stableId}: {item.propertyId}</option>)}</select></label>
        <label htmlFor={`${prefix}-course`}>{copy.course}<select id={`${prefix}-course`} value={courseId} onChange={e=>setCourseId(e.target.value)}><option value="">{copy.allCourses}</option>{courses.map((item:any)=><option key={item.courseId} value={item.courseId}>{item.displayName} · {copy.stableId}: {item.courseId}</option>)}</select></label>
      </fieldset>
      {!authorityReady&&<p role="alert" style={alert}>{suspended?copy.operationalBlocked:copy.unavailable}</p>}
      <section aria-labelledby={`${prefix}-members`} style={card}><h3 id={`${prefix}-members`}>{copy.memberships}</h3>{scoped(view.memberships).length===0?<p>{copy.empty}</p>:<div style={{overflowX:"auto"}}><table><thead><tr><th>{copy.email}</th><th>{copy.role}</th><th>{copy.stableId}</th><th>{copy.status}</th><th>{copy.action}</th></tr></thead><tbody>{scoped(view.memberships).map(item=><tr key={item.membershipId}><td><code>{item.verifiedStaffId}</code></td><td>{copy[roleKeys[item.role]]}</td><td><code>{item.membershipId}</code></td><td>{copy[item.status]}</td><td><button type="button" disabled={busy||!authorityReady||item.role==="organization_owner"} onClick={()=>{const id=newAuthorityCommandId();void run(()=>organizationAuthorityService.revokeMembership(organizationId,organization!.version,item.membershipId,item.version,id))}}>{copy.revoke}</button></td></tr>)}</tbody></table></div>}</section>
      <section aria-labelledby={`${prefix}-invite`} style={card}><h3 id={`${prefix}-invite`}>{copy.invite}</h3><form onSubmit={e=>{e.preventDefault();if(!selectedRole||!authorityReady)return;const id=newAuthorityCommandId();void run(()=>organizationAuthorityService.invite(organizationId,organization!.version,email.trim().toLowerCase(),selectedRole,scope,id))}}><label htmlFor={`${prefix}-email`}>{copy.email}<input id={`${prefix}-email`} type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label htmlFor={`${prefix}-role`}>{copy.role}<select id={`${prefix}-role`} value={selectedRole||""} onChange={e=>setRole(e.target.value as EnterpriseRole)}>{availableRoles.map(item=><option key={item} value={item}>{copy[roleKeys[item]]}</option>)}</select></label><button disabled={busy||!authorityReady||!organizationId||!selectedRole} type="submit">{copy.send}</button></form>
        <h4>{copy.invitations}</h4><ul>{scoped(view.invitations).map(item=><li key={item.invitationId}><code>{item.invitationId}</code> · {copy[roleKeys[item.role]]} · {copy[item.status]} · {copy.expires}: <time dateTime={item.expiresAt}>{item.expiresAt}</time> {item.status==="pending"&&<button type="button" disabled={busy||!authorityReady} onClick={()=>{const id=newAuthorityCommandId();void run(()=>organizationAuthorityService.revokeInvitation(organizationId,organization!.version,item.invitationId,item.version,id))}}>{copy.revoke}</button>}</li>)}</ul>
      </section>
      <section aria-labelledby={`${prefix}-transfer`} style={card}><h3 id={`${prefix}-transfer`}>{copy.transfer}</h3><p>{copy.supportBody}</p><ul>{view.ownershipTransfers.filter(item=>item.organizationId===organizationId).map(item=><li key={item.transferId}><code>{item.transferId}</code> · {item.status} {item.actorApproval&&<button disabled={busy||!authorityReady} type="button" onClick={()=>{const id=newAuthorityCommandId();void run(()=>organizationAuthorityService.approveOwnershipTransfer(organizationId,organization!.version,item.transferId,item.version,id))}}>{copy.requestTransfer}</button>}</li>)}</ul></section>
      <section aria-labelledby={`${prefix}-receipts`} style={card}><h3 id={`${prefix}-receipts`}>{copy.receipts}</h3><ol>{view.receipts.filter(item=>item.organizationId===organizationId).map(item=><li key={item.receiptId}><code>{item.receiptId}</code> · {item.action} · <code>{item.actorMembershipId}</code> · <time dateTime={item.occurredAt}>{item.occurredAt}</time></li>)}</ol></section>
      <Support copy={copy}/>
    </>}
    {notice&&<p role={notice.startsWith(copy.accepted)?"status":"alert"} aria-live="polite" style={notice.startsWith(copy.accepted)?undefined:alert}>{notice} {retry.current&&<button type="button" disabled={busy} onClick={()=>void run(retry.current!)}>{copy.retry}</button>}</p>}
  </section>;
}

function Support({copy}:{copy:typeof ENTERPRISE_AUTHORITY_COPY.en}){return <aside aria-labelledby="enterprise-admin-support" style={card}><h3 id="enterprise-admin-support">{copy.support}</h3><p>{copy.supportBody}</p></aside>}
const card={border:"1px solid #444",borderRadius:8,padding:16,marginBottom:16,background:"#111"};
const alert={border:"1px solid #ff6b6b",padding:12,borderRadius:6,color:"#ffd5d5"};
