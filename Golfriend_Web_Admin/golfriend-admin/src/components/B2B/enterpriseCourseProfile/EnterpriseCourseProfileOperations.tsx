import {useCallback,useEffect,useId,useRef,useState} from "react";
import {useLocale} from "../../../i18n/hooks";
import {ENTERPRISE_COURSE_PROFILE_COPY,ENTERPRISE_COURSE_PROFILE_LOCALES,type EnterpriseCourseProfileLocale} from "../../../i18n/partner/enterpriseCourseProfile";
import {CourseProfileOperationsService,courseProfileOperationsService} from "../enterprise/courseProfileOperationsService";
import type {CourseProfileAuthorityContext,CourseProfileProjection,LocalizedCourseProfile} from "../enterprise/courseProfileOperationsModel";
const blankProfile=():LocalizedCourseProfile=>Object.fromEntries(ENTERPRISE_COURSE_PROFILE_LOCALES.map(locale=>[locale,{name:"",description:""}])) as unknown as LocalizedCourseProfile;
type Props={context:CourseProfileAuthorityContext|null;service?:CourseProfileOperationsService};
export default function EnterpriseCourseProfileOperations({context,service=courseProfileOperationsService}:Props){
 const locale=useLocale() as EnterpriseCourseProfileLocale,copy=ENTERPRISE_COURSE_PROFILE_COPY[ENTERPRISE_COURSE_PROFILE_LOCALES.includes(locale)?locale:"en"],id=useId();
 const [projection,setProjection]=useState<CourseProfileProjection|null>(null),[loading,setLoading]=useState(true),[draft,setDraft]=useState<LocalizedCourseProfile|null>(null);
 const commandId=useRef(crypto.randomUUID());
 const read=useCallback(async()=>{setLoading(true);try{setProjection(context?await service.read(context):null)}finally{setLoading(false)}},[context,service]);useEffect(()=>{void read()},[read]);
 useEffect(()=>{if(projection?.approvedProfile)setDraft(projection.approvedProfile.content);else if(projection&&projection.state!=="unavailable"&&projection.state!=="suspended")setDraft(blankProfile())},[projection]);
 const submit=async()=>{if(!context||!projection||!draft)return;setLoading(true);try{const next=await service.submit(context,{commandId:commandId.current,canonicalCourseId:context.courseId,baseVersion:projection.approvedProfile?.version||0,attemptVersion:(projection.editAttempt?.attemptVersion||0)+1,content:draft});setProjection(next);if(next.state!=="unavailable")commandId.current=crypto.randomUUID()}finally{setLoading(false)}};
 const state=projection?.state||"unavailable",message=state==="review"?copy.review:state==="pending"?copy.pending:state==="approved"?copy.approvedState:state==="rejected"?copy.rejected:state==="stale"?copy.stale:state==="suspended"?copy.suspended:state==="empty"?copy.empty:copy.unavailable;
 return <section aria-labelledby={`${id}-title`} style={{display:"grid",gap:16}}><header><h2 id={`${id}-title`}>{copy.title}</h2><p>{copy.intro}</p></header><p role="note">{copy.boundary}</p><p><strong>{copy.canonical}:</strong> <code>{context?.courseId||"—"}</code></p>
 {loading?<p role="status" aria-live="polite">{copy.loading}</p>:<p role={state==="suspended"||state==="unavailable"?"alert":"status"}>{message}</p>}
 {projection?.approvedProfile&&<section aria-labelledby={`${id}-approved`}><h3 id={`${id}-approved`}>{copy.approved}</h3><p>{projection.approvedProfile.content[locale]?.name}</p><p>{projection.approvedProfile.content[locale]?.description}</p><small><time dateTime={projection.approvedProfile.approvedAt}>{projection.approvedProfile.approvedAt}</time> · v{projection.approvedProfile.version}</small></section>}
 {draft&&<form onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={loading||state==="suspended"||state==="unavailable"||state==="stale"}><legend>{copy.attempt}</legend>{ENTERPRISE_COURSE_PROFILE_LOCALES.map(l=><fieldset key={l}><legend>{copy.locale}: {l}</legend><label>{copy.name}<input required value={draft[l].name} onChange={e=>setDraft({...draft,[l]:{...draft[l],name:e.target.value}})}/></label><label>{copy.description}<textarea required value={draft[l].description} onChange={e=>setDraft({...draft,[l]:{...draft[l],description:e.target.value}})}/></label></fieldset>)}<button type="submit">{copy.submit}</button></fieldset></form>}
 {(state==="stale"||state==="unavailable")&&<button type="button" disabled={!context||loading} onClick={()=>void read()}>{copy.retry}</button>}
 {!!projection?.references.length&&<section aria-labelledby={`${id}-receipts`}><h3 id={`${id}-receipts`}>{copy.receipts}</h3><ol>{projection.references.map(r=><li key={r.referenceId}><code>{r.referenceId}</code> · {r.action} · <time dateTime={r.occurredAt}>{r.occurredAt}</time></li>)}</ol></section>}
 {projection?.supportReference&&<aside><strong>{copy.support}:</strong> <code>{projection.supportReference}</code></aside>}</section>;
}
