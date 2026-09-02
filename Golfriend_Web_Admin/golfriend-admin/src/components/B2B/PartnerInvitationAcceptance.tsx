import {useState} from "react";
import {httpsCallable} from "firebase/functions";
import { functions } from '../../firebaseConfig';
import {useLocale} from "../../i18n/hooks";
import EnterpriseInvitationAcceptance from "./enterpriseAuthority/EnterpriseInvitationAcceptance";

const EN = {title:"Partner staff invitation", lead:"This invitation binds your verified identity to the approved organization. It cannot be transferred.", accept:"Accept invitation", busy:"Verifying…", error:"The invitation is invalid, stale, or belongs to another verified identity.", done:"Invitation accepted. Reloading your authorized Portal…"};
const COPY:any = {en:EN, th:{...EN,title:"คำเชิญพนักงานพันธมิตร",lead:"คำเชิญนี้จะผูกบัญชีที่ยืนยันแล้วกับองค์กรที่อนุมัติ และโอนให้ผู้อื่นไม่ได้",accept:"ยอมรับคำเชิญ",busy:"กำลังตรวจสอบ…",error:"คำเชิญไม่ถูกต้อง หมดอายุ หรือเป็นของบัญชีอื่น",done:"ยอมรับคำเชิญแล้ว กำลังเปิดพอร์ทัล…"}, ko:{...EN,title:"파트너 직원 초대"}, ja:{...EN,title:"パートナースタッフ招待"}, zh:{...EN,title:"合作伙伴员工邀请"}, es:{...EN,title:"Invitación de personal socio"}, fr:{...EN,title:"Invitation du personnel partenaire"}, de:{...EN,title:"Partnermitarbeiter-Einladung"}};

export default function PartnerInvitationAcceptance() {
  const params = new URLSearchParams(location.search);
  if (params.get("enterpriseInvitation")) return <EnterpriseInvitationAcceptance/>;
  return <LegacyPartnerInvitation invitationId={params.get("invitation")}/>;
}

function LegacyPartnerInvitation({invitationId}:{invitationId:string|null}) {
  const copy=COPY[useLocale()]||EN;
  const [state,setState]=useState<"idle"|"busy"|"done"|"error">("idle");
  if(!invitationId)return null;
  const accept=async()=>{setState("busy");try{await httpsCallable(functions,"acceptPartnerInvitation")({invitationId,commandId:crypto.randomUUID().replaceAll("-","_")});setState("done");location.assign("/partner")}catch{setState("error")}};
  return <section className="partner-status" aria-live="polite"><h2>{copy.title}</h2><p>{copy.lead}</p>{state==="error"&&<p role="alert">{copy.error}</p>}{state==="done"?<p role="status">{copy.done}</p>:<button disabled={state==="busy"} onClick={()=>void accept()}>{state==="busy"?copy.busy:copy.accept}</button>}</section>;
}
