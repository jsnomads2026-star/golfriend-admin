import {useState}from "react";
import {getFunctions, httpsCallable}from "firebase/functions";
import {isCanonicalLocale, LOCALE_CODES, type CanonicalLocale}from "../../i18n/locales.ts";
import {useLocale}from "../../i18n/hooks.ts";
import EnterpriseInvitationAcceptance from "./enterpriseAuthority/EnterpriseInvitationAcceptance";

const COPY = {
  en: {
    title: "Partner staff invitation",
    lead: "This invitation binds your verified identity to the approved organization. It cannot be transferred.",
    accept: "Accept invitation",
    accepting: "Accepting…",
    retry: "Retry",
    success: "Invitation accepted. Reloading your authorized Portal…",
    error: "The invitation is invalid, stale, or belongs to another verified identity.",
    retryHint: "Please retry if you want to try again.",
    stateIdle: "Ready to accept the invitation.",
    stateBusy: "Accepting your invitation…",
    stateDone: "Invitation accepted. Redirecting…",
    sectionLabel: "Partner invitation acceptance",
    acceptAria: "Accept partner invitation",
    retryAria: "Retry partner invitation acceptance",
  },
  th: {
    title: "คำเชิญพนักงานพันธมิตร",
    lead: "คำเชิญนี้จะผูกบัญชีที่ยืนยันแล้วกับองค์กรที่อนุมัติ และโอนให้ผู้อื่นไม่ได้",
    accept: "ยอมรับคำเชิญ",
    accepting: "กำลังยอมรับ…",
    retry: "ลองอีกครั้ง",
    success: "ยอมรับคำเชิญแล้ว กำลังเปิดพอร์ทัล…",
    error: "คำเชิญไม่ถูกต้อง หมดอายุ หรือเป็นของบัญชีอื่น",
    retryHint: "ลองอีกครั้งหากคุณต้องการดำเนินการอีกครั้ง",
    stateIdle: "พร้อมรับคำเชิญ",
    stateBusy: "กำลังยอมรับคำเชิญ…",
    stateDone: "ยอมรับคำเชิญสำเร็จ กำลังเปลี่ยนเส้นทาง…",
    sectionLabel: "การยืนยันคำเชิญพันธมิตร",
    acceptAria: "ยอมรับคำเชิญพนักงานพันธมิตร",
    retryAria: "ลองใหม่เพื่อยอมรับคำเชิญอีกครั้ง",
  },
  ko: {
    title: "파트너 직원 초대",
    lead: "이 초대는 승인된 조직에 대해 확인된 사용자를 연결합니다. 다른 사용자에게 양도할 수 없습니다.",
    accept: "초대 수락",
    accepting: "수락 중…",
    retry: "다시 시도",
    success: "초대를 수락했습니다. 승인된 포털을 다시 불러오는 중…",
    error: "초대가 유효하지 않거나 만료되었거나 다른 인증된 계정에 속해 있습니다.",
    retryHint: "필요할 경우 다시 시도해 주세요.",
    stateIdle: "초대를 수락할 준비가 되었습니다.",
    stateBusy: "초대를 수락하고 있습니다…",
    stateDone: "초대가 수락되었습니다. 리디렉션 중…",
    sectionLabel: "파트너 초대 수락",
    acceptAria: "파트너 초대 수락",
    retryAria: "파트너 초대 수락 다시 시도",
  },
  ja: {
    title: "パートナースタッフ招待",
    lead: "この招待は、認証された本人のIDを承認済み組織に紐づけます。譲渡はできません。",
    accept: "招待を承諾",
    accepting: "承諾中…",
    retry: "再試行",
    success: "招待が承認されました。認証済みポータルへ再読み込み中…",
    error: "招待が無効、期限切れ、または別の認証済みIDに属しています。",
    retryHint: "再度お試しください。",
    stateIdle: "招待を承諾する準備が完了しました。",
    stateBusy: "招待を承認しています…",
    stateDone: "招待が承認されました。リダイレクト中…",
    sectionLabel: "パートナー招待の承認",
    acceptAria: "パートナー招待を承認する",
    retryAria: "パートナー招待の承認を再試行",
  },
  zh: {
    title: "合作伙伴员工邀请",
    lead: "该邀请会将您已验证的身份绑定到已审批的组织，不可转让。",
    accept: "接受邀请",
    accepting: "正在接受…",
    retry: "重试",
    success: "已接受邀请。正在重新加载授权门户…",
    error: "该邀请无效、已过期或属于其他已验证身份。",
    retryHint: "如需可重试此操作。",
    stateIdle: "已准备好接受邀请。",
    stateBusy: "正在接受邀请…",
    stateDone: "邀请已接受。正在跳转…",
    sectionLabel: "合作伙伴邀请接收",
    acceptAria: "接受合作伙伴邀请",
    retryAria: "重试合作伙伴邀请接受",
  },
  es: {
    title: "Invitación de personal socio",
    lead: "Esta invitación vincula tu identidad verificada con la organización aprobada. No se puede transferir.",
    accept: "Aceptar invitación",
    accepting: "Aceptando…",
    retry: "Reintentar",
    success: "Invitación aceptada. Recargando tu portal autorizado…",
    error: "La invitación no es válida, está vencida o pertenece a otra identidad verificada.",
    retryHint: "Vuelve a intentarlo si quieres probar de nuevo.",
    stateIdle: "Listo para aceptar la invitación.",
    stateBusy: "Aceptando la invitación…",
    stateDone: "Invitación aceptada. Redirigiendo…",
    sectionLabel: "Aceptación de invitación de socio",
    acceptAria: "Aceptar invitación de socio",
    retryAria: "Reintentar aceptación de invitación de socio",
  },
  fr: {
    title: "Invitation du personnel partenaire",
    lead: "Cette invitation lie votre identité vérifiée à l’organisation approuvée. Elle ne peut pas être transférée.",
    accept: "Accepter l’invitation",
    accepting: "Acceptation…",
    retry: "Réessayer",
    success: "Invitation acceptée. Rechargement de votre portail autorisé…",
    error: "L’invitation est invalide, périmée ou appartient à une autre identité vérifiée.",
    retryHint: "Réessayez si vous souhaitez renouveler l’opération.",
    stateIdle: "Prêt·e à accepter l’invitation.",
    stateBusy: "Acceptation de l’invitation…",
    stateDone: "Invitation acceptée. Redirection…",
    sectionLabel: "Acceptation de l’invitation partenaire",
    acceptAria: "Accepter l’invitation partenaire",
    retryAria: "Réessayer l’acceptation de l’invitation partenaire",
  },
  de: {
    title: "Partnermitarbeiter-Einladung",
    lead: "Diese Einladung verknüpft Ihre verifizierte Identität mit der genehmigten Organisation. Sie ist nicht übertragbar.",
    accept: "Einladung annehmen",
    accepting: "Wird angenommen…",
    retry: "Erneut versuchen",
    success: "Einladung angenommen. Ihr berechtigtes Portal wird neu geladen…",
    error: "Die Einladung ist ungültig, abgelaufen oder gehört zu einer anderen verifizierten Identität.",
    retryHint: "Bitte versuchen Sie es erneut, wenn Sie fortfahren möchten.",
    stateIdle: "Bereit, die Einladung anzunehmen.",
    stateBusy: "Einladung wird angenommen…",
    stateDone: "Einladung angenommen. Weiterleitung…",
    sectionLabel: "Annahme der Partnereinladung",
    acceptAria: "Partnereinladung annehmen",
    retryAria: "Partnereinladungsannahme erneut versuchen",
  },
} satisfies Record<CanonicalLocale, {
  title: string;
  lead: string;
  accept: string;
  accepting: string;
  retry: string;
  success: string;
  error: string;
  retryHint: string;
  stateIdle: string;
  stateBusy: string;
  stateDone: string;
  sectionLabel: string;
  acceptAria: string;
  retryAria: string;
}>;

type Locale = CanonicalLocale;
type InviteState = "idle" | "busy" | "done" | "error";

export default function PartnerInvitationAcceptance() {
  const params = new URLSearchParams(location.search);
  if (params.get("enterpriseInvitation")) return <EnterpriseInvitationAcceptance/>;
  return <LegacyPartnerInvitation invitationId={params.get("invitation")}/>;
}

function usePartnerInvitationLocale(): Locale {
  const locale = useLocale();
  return isCanonicalLocale(locale) ? locale : LOCALE_CODES[0];
}

function stateCopy(copy: (typeof COPY)[Locale], state: InviteState): string {
  if (state === "busy") return copy.stateBusy;
  if (state === "done") return copy.stateDone;
  if (state === "error") return copy.error;
  return copy.stateIdle;
}

function LegacyPartnerInvitation({invitationId}: {invitationId: string | null}) {
  const copy = COPY[usePartnerInvitationLocale()];
  const [state, setState] = useState<InviteState>("idle");

  if (!invitationId) return null;

  const accept = async () => {
    setState("busy");
    try {
      await httpsCallable(getFunctions(), "acceptPartnerInvitation")({invitationId, commandId: crypto.randomUUID().replaceAll("-", "_")});
      setState("done");
      location.assign("/partner");
    } catch {
      setState("error");
    }
  };

  return (
    <section className="partner-status" aria-live="polite" aria-label={copy.sectionLabel}>
      <h2>{copy.title}</h2>
      <p>{copy.lead}</p>
      <p role={state === "busy" ? "status" : "note"}>{stateCopy(copy, state)}</p>
      {state === "done" ? (
        <p role="status">{copy.success}</p>
      ) : state === "error" ? (
        <>
          <p role="alert">{copy.error}</p>
          <p>{copy.retryHint}</p>
          <button type="button" aria-label={copy.retryAria} onClick={() => void accept()}>{copy.retry}</button>
        </>
      ) : (
        <button type="button" aria-label={copy.acceptAria} disabled={state === "busy"} onClick={() => void accept()}>
          {state === "busy" ? copy.accepting : copy.accept}
        </button>
      )}
    </section>
  );
}
