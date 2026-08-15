import {useCallback, useEffect, useId, useState} from "react";
import {useLocale} from "../../i18n/hooks";
import {VERIFIED_COURSE_COPY, VERIFIED_COURSE_LOCALES, type VerifiedCourseLocale} from "../../i18n/partner/verifiedCourseOnboarding";
import {verifiedCourseOnboardingService, type CourseOnboardingDraft} from "./verifiedCourseOnboardingService";

const empty: CourseOnboardingDraft = {
  representative:{fullName:"",jobTitle:"",authorityBasis:"",authorityEvidenceId:"",businessEmail:"",phone:""},
  organization:{legalName:"",registrationNumber:"",country:"",registeredAddress:""},
  course:{courseId:"",legalName:"",publicName:"",address:"",website:""},
  profile:{description:"",holes:"",timezone:"",contactEmail:"",contactPhone:""},
  catalogue:{facilities:"",accessibility:"",dressCode:"",cancellationPolicy:""},
};

export default function VerifiedCourseOnboarding(){
  const locale = useLocale() as VerifiedCourseLocale;
  const copy = VERIFIED_COURSE_COPY[VERIFIED_COURSE_LOCALES.includes(locale) ? locale : "en"];
  const prefix = useId();
  const [draft,setDraft]=useState<CourseOnboardingDraft>(empty),[view,setView]=useState<any>(null);
  const [state,setState]=useState<"loading"|"ready"|"error">("loading"),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [acceptChecked,setAcceptChecked]=useState(false);
  const load=useCallback(async()=>{setState("loading");try{const result=await verifiedCourseOnboardingService.load(),app=result?.application||{};setView(result);setDraft(current=>({...current,representative:{...current.representative,fullName:app.representative?.name||app.contactName||"",jobTitle:app.representative?.title||"",authorityEvidenceId:app.representative?.authorityEvidenceId||"",businessEmail:app.representative?.email||app.contactEmail||"",phone:app.contactPhone||""},organization:{...current.organization,legalName:app.organizationIdentity?.legalName||app.organization||"",registrationNumber:app.organizationIdentity?.registrationId||"",country:app.organizationIdentity?.jurisdiction||app.country||"",registeredAddress:app.region||""},course:{...current.course,courseId:app.courseProfile?.canonicalCourseId||"",legalName:app.courseProfile?.legalName||app.course?.name||"",publicName:app.courseProfile?.name||app.course?.name||"",address:app.courseProfile?.address||app.course?.address||"",website:app.courseProfile?.website||app.course?.website||""},profile:{...current.profile,description:app.courseProfile?.description||"",holes:String(app.courseProfile?.holes||""),timezone:app.courseProfile?.timeZone||"",contactEmail:app.courseProfile?.contactEmail||app.contactEmail||"",contactPhone:app.courseProfile?.contactPhone||app.contactPhone||""},catalogue:{...current.catalogue,facilities:app.courseProfile?.facilities||"",accessibility:app.courseProfile?.accessibility||"",dressCode:app.courseProfile?.dressCode||"",cancellationPolicy:app.courseProfile?.cancellationPolicy||""}}));setState("ready")}catch{setState("error")}},[]);
  useEffect(()=>{void load()},[load]);
  const run=async(task:()=>Promise<any>)=>{setBusy(true);setNotice("");try{const result=await task();setNotice(`OK · ${result.receipt?.receiptId||result.status||result.version}`);await load()}catch{setNotice(copy.unavailable)}finally{setBusy(false)}};
  const set=(section:keyof CourseOnboardingDraft,key:string,value:string)=>setDraft(current=>({...current,[section]:{...current[section],[key]:value}}));
  const field=(section:keyof CourseOnboardingDraft,key:string,label:string,props:Record<string,unknown>={})=>{const id=`${prefix}-${section}-${key}`;return <label htmlFor={id}>{label}<input id={id} value={(draft[section] as any)[key]} onChange={event=>set(section,key,event.target.value)} {...props}/></label>};
  if(state==="loading")return <section aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{copy.title}</h2><p role="status" aria-live="polite">{copy.saving}</p></section>;
  if(state==="error")return <section aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{copy.title}</h2><p role="alert">{copy.unavailable}</p><button type="button" onClick={()=>void load()}>{copy.retry}</button></section>;
  const application=view?.application||{},status=String(application.status||"draft"),locked=["submitted","under_review","pending_verification","approved","suspended"].includes(status),agreementVersion="golfriend.course-partner.v1",agreementDigest="e16d5070c66bbf4b89beade4407b415def779076c71dbb48237db7b1157adc11";
  const statusLabel=status==="approved"?copy.approved:status==="rejected"?copy.rejected:status==="suspended"?copy.suspended:status==="info_needed"?copy.infoNeeded:status==="draft"?copy.draft:copy.pending;
  return <section className="partner-application" aria-labelledby={`${prefix}-title`}>
    <header><h2 id={`${prefix}-title`}>{copy.title}</h2><p>{copy.intro}</p></header>
    <aside role="status" aria-live="polite"><strong>{copy.truthful}</strong><p>{copy.commission}</p><p>{copy.pilot}</p></aside>
    <section aria-labelledby={`${prefix}-status`}><h3 id={`${prefix}-status`}>{copy.status}</h3><p><strong>{statusLabel}</strong></p>{view?.reviewNote&&<p>{view.reviewNote}</p>}</section>
    <form onSubmit={event=>{event.preventDefault();void run(()=>verifiedCourseOnboardingService.save(draft,Number(application.version||0),locale))}}>
      <fieldset disabled={busy||locked}><legend>{copy.representative}</legend>{field("representative","fullName",copy.fullName,{required:true})}{field("representative","jobTitle",copy.jobTitle,{required:true})}{field("representative","authorityBasis",copy.authorityBasis,{required:true})}<label>{copy.authorityBasis}<select required value={draft.representative.authorityEvidenceId} onChange={event=>set("representative","authorityEvidenceId",event.target.value)}><option value="">—</option>{(view.evidence||[]).map((item:any)=><option key={item.evidenceId} value={item.evidenceId}>{item.fileName}</option>)}</select></label>{field("representative","businessEmail",copy.businessEmail,{required:true,type:"email"})}{field("representative","phone",copy.phone,{required:true,type:"tel"})}</fieldset>
      <fieldset disabled={busy||locked}><legend>{copy.organization}</legend>{field("organization","legalName",copy.legalName,{required:true})}{field("organization","registrationNumber",copy.registrationNumber,{required:true})}{field("organization","country",copy.country,{required:true,pattern:"[A-Za-z]{2}",maxLength:2})}{field("organization","registeredAddress",copy.registeredAddress,{required:true})}</fieldset>
      <fieldset disabled={busy||locked}><legend>{copy.course}</legend>{field("course","courseId",copy.courseId,{required:true})}{field("course","legalName",copy.legalName,{required:true})}{field("course","publicName",copy.publicName,{required:true})}{field("course","address",copy.courseAddress,{required:true})}{field("course","website",copy.website,{type:"url"})}</fieldset>
      <fieldset disabled={busy||locked}><legend>{copy.profile}</legend><label htmlFor={`${prefix}-description`}>{copy.description}<textarea id={`${prefix}-description`} required value={draft.profile.description} onChange={event=>set("profile","description",event.target.value)}/></label>{field("profile","holes",copy.holes,{required:true,type:"number",min:1,max:108})}{field("profile","timezone",copy.timezone,{required:true})}{field("profile","contactEmail",copy.contactEmail,{required:true,type:"email"})}{field("profile","contactPhone",copy.contactPhone,{type:"tel"})}</fieldset>
      <fieldset disabled={busy||locked}><legend>{copy.catalogue}</legend>{field("catalogue","facilities",copy.facilities,{required:true})}{field("catalogue","accessibility",copy.accessibility,{required:true})}{field("catalogue","dressCode",copy.dressCode,{required:true})}{field("catalogue","cancellationPolicy",copy.cancellationPolicy,{required:true})}</fieldset>
      <button disabled={busy||locked} type="submit">{busy?copy.saving:copy.save}</button>
    </form>
    <section aria-labelledby={`${prefix}-agreement`}><h3 id={`${prefix}-agreement`}>{copy.agreement}</h3><p>{copy.agreementLead}</p><article tabIndex={0} aria-label={`${copy.agreement} ${agreementVersion}`}><h4>{agreementVersion}</h4><code>{agreementDigest}</code><p>{copy.truthful}</p><p>{copy.commission}</p><p>{copy.pilot}</p></article>{application.agreement?<p role="status">{copy.accepted}</p>:<><p role="status">{copy.pending}. {copy.truthful}</p><label><input type="checkbox" checked={acceptChecked} onChange={event=>setAcceptChecked(event.target.checked)}/>{copy.accept}</label><button type="button" disabled={busy||!acceptChecked||!draft.representative.authorityEvidenceId} onClick={()=>void run(()=>verifiedCourseOnboardingService.acceptAgreement(draft))}>{copy.acceptButton}</button></>}</section>
    <button type="button" disabled={busy||locked||!application.agreement} onClick={()=>void run(()=>verifiedCourseOnboardingService.submit())}>{copy.submit}</button>
    {notice&&<p role={notice.startsWith("OK")?"status":"alert"} aria-live="polite">{notice}</p>}
  </section>;
}
