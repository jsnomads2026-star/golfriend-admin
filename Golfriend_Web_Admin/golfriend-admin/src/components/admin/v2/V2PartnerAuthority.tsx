import { useCallback, useEffect, useState } from "react";
import { partnerAuthorityAdminService } from "../../B2B/partnerAuthorityService";
import { useAdminLocale } from "./AdminLocaleContext";
import "./V2PartnerApplications.css";
import PartnerTrialReceipt from "../../B2B/PartnerTrialReceipt";

const EN = {
  title: "Partner activation & course authority",
  loading: "Loading partner authority…",
  emptyClaims: "No pending authority work.",
  emptyOrganizations: "No organizations found.",
  error: "Partner authority is unavailable.",
  retry: "Retry",
  retryAria: "Retry loading partner authority",
  activate: "Activate approved partner",
  application: "Approved application",
  course: "Existing course ID",
  review: "Course claim review",
  organizations: "Organizations",
  tierLabel: "Tier",
  statuses: "Status",
  actions: "Actions",
  appPlaceholder: "Select application",
  smallBusiness: "Small business",
  enterprise: "Enterprise",
  unknownTier: "Unknown tier",
  approve: "Approve",
  reject: "Reject",
  suspend: "Suspend",
  reactivate: "Reactivate",
  trialStatement: "Trial & statement",
  boundary:
    "Admin approval binds identities and course records. It never publishes course data to the app.",
  courseCountPrefix: "Courses",
  orgCountPrefix: "Organizations",
  statusPending: "Pending",
  statusDisputed: "Disputed",
  statusApproved: "Approved",
  statusSuspended: "Suspended",
  statusActive: "Active",
  copy: {
    titleAria: "Partner authority panel title",
    appSelect: "Select approved application",
    courseInput: "Approved course ID",
    reviewSection: "Course claim review section",
    orgSection: "Organizations section",
    actionApprove: "Approve course claim",
    actionReject: "Reject course claim",
    actionSuspend: "Suspend item",
    actionReactivate: "Reactivate item",
    orgSuspend: "Suspend organization",
    orgReactivate: "Reactivate organization",
    orgReceipt: "Show trial statement for this organization",
  },
};

const COPY = {
  en: EN,
  th: {
    ...EN,
    title: "เปิดใช้งานพันธมิตรและสิทธิ์สนาม",
    loading: "กำลังโหลดสิทธิ์พันธมิตร…",
    emptyClaims: "ไม่มีงานสิทธิ์ที่รอดำเนินการ",
    emptyOrganizations: "ไม่พบองค์กร",
    error: "ระบบสิทธิ์พันธมิตรไม่พร้อมใช้งาน",
    retry: "ลองอีกครั้ง",
    retryAria: "ลองโหลดสิทธิ์พันธมิตรอีกครั้ง",
    activate: "เปิดใช้งานพันธมิตรที่อนุมัติแล้ว",
    application: "คำขอที่อนุมัติ",
    course: "รหัสสนามที่มีอยู่",
    review: "ตรวจคำขอสิทธิ์สนาม",
    organizations: "องค์กร",
    appPlaceholder: "เลือกคำขอที่อนุมัติแล้ว",
    tierLabel: "ระดับ",
    statuses: "สถานะ",
    actions: "การกระทำ",
    smallBusiness: "ธุรกิจขนาดเล็ก",
    enterprise: "วิสาหกิจ",
    unknownTier: "ไม่ทราบระดับ",
    approve: "อนุมัติ",
    reject: "ปฏิเสธ",
    suspend: "ระงับ",
    reactivate: "เปิดใช้งานอีกครั้ง",
    trialStatement: "ประวัติทดลองใช้และคำชี้แจง",
    boundary: "แอดมินเป็นผู้ผูกบัญชีและข้อมูลสนาม การอนุมัติไม่เผยแพร่ข้อมูลสนามเข้าแอปโดยตรง",
    courseCountPrefix: "จำนวนคอร์ส",
    orgCountPrefix: "จำนวนองค์กร",
    statusPending: "รอดำเนินการ",
    statusDisputed: "ถูกอุทธรณ์",
    statusApproved: "อนุมัติแล้ว",
    statusSuspended: "ระงับ",
    statusActive: "ใช้งานอยู่",
    copy: {
      ...EN.copy,
      titleAria: "แผงสิทธิ์พันธมิตร",
      appSelect: "เลือกคำขอที่อนุมัติแล้ว",
      courseInput: "รหัสคอร์สที่ผ่านการอนุมัติ",
      reviewSection: "ส่วนตรวจสอบคำขอสิทธิ์สนาม",
      orgSection: "ส่วนข้อมูลองค์กร",
      orgSuspend: "ระงับองค์กร",
      orgReactivate: "เปิดใช้งานองค์กรอีกครั้ง",
      orgReceipt: "แสดงการทดลองใช้และสถานะขององค์กรนี้",
      actionApprove: "อนุมัติคำขอสิทธิ์สนาม",
      actionReject: "ปฏิเสธคำขอสิทธิ์สนาม",
      actionSuspend: "ระงับรายการนี้",
      actionReactivate: "เปิดใช้งานรายการนี้อีกครั้ง",
    },
  },
  ko: {
    ...EN,
    title: "파트너 활성화 및 코스 권한",
    loading: "파트너 권한 로딩 중…",
    emptyClaims: "대기 중인 권한 작업이 없습니다.",
    emptyOrganizations: "조직이 없습니다.",
    error: "파트너 권한을 사용할 수 없습니다.",
    retry: "재시도",
    retryAria: "파트너 권한 다시 로드",
    activate: "승인된 파트너 활성화",
    application: "승인된 신청",
    course: "기존 코스 ID",
    review: "코스 클레임 검토",
    organizations: "기관",
    appPlaceholder: "승인된 신청서 선택",
    tierLabel: "등급",
    statuses: "상태",
    actions: "작업",
    smallBusiness: "스몰 비즈니스",
    enterprise: "엔터프라이즈",
    unknownTier: "알 수 없는 등급",
    approve: "승인",
    reject: "거절",
    suspend: "중단",
    reactivate: "재활성화",
    trialStatement: "평가판 및 진술",
    courseCountPrefix: "코스",
    orgCountPrefix: "조직",
    boundary: "관리자 승인은 신원 및 코스 기록을 연결합니다. 코스 데이터는 앱에 직접 게시되지 않습니다.",
    statusPending: "대기 중",
    statusDisputed: "분쟁",
    statusApproved: "승인됨",
    statusSuspended: "일시중단",
    statusActive: "활성",
    copy: {
      titleAria: "파트너 권한 패널 제목",
      appSelect: "승인된 신청서 선택",
      courseInput: "기존 코스 ID",
      reviewSection: "코스 클레임 검토 섹션",
      orgSection: "조직 섹션",
      orgSuspend: "조직 일시중단",
      orgReactivate: "조직 재활성화",
      orgReceipt: "이 조직의 평가판 및 명세 보기",
      actionApprove: "코스 클레임 승인",
      actionReject: "코스 클레임 거부",
      actionSuspend: "항목 일시중단",
      actionReactivate: "항목 재활성화",
    },
  },
  ja: {
    ...EN,
    title: "パートナー有効化とコース権限",
    loading: "パートナー権限を読み込み中…",
    emptyClaims: "保留中の権限作業はありません。",
    emptyOrganizations: "組織が見つかりません。",
    error: "パートナー権限を利用できません。",
    retry: "再試行",
    retryAria: "パートナー権限を再読み込み",
    activate: "承認済みパートナーを有効化",
    application: "承認済み申請",
    course: "既存のコースID",
    review: "コース権限のレビュー",
    organizations: "組織",
    appPlaceholder: "承認済み申請を選択",
    tierLabel: "テア",
    statuses: "ステータス",
    actions: "アクション",
    smallBusiness: "小規模事業",
    enterprise: "エンタープライズ",
    unknownTier: "不明なティア",
    approve: "承認",
    reject: "却下",
    suspend: "中断",
    reactivate: "再有効化",
    trialStatement: "トライアル＆明細",
    courseCountPrefix: "コース",
    orgCountPrefix: "組織",
    boundary:
      "管理者承認は ID とコース情報を結びつけます。コースデータはアプリに直接公開されません。",
    statusPending: "保留",
    statusDisputed: "異議あり",
    statusApproved: "承認済み",
    statusSuspended: "停止",
    statusActive: "有効",
    copy: {
      titleAria: "パートナー権限パネル",
      appSelect: "承認済み申請を選択",
      courseInput: "既存コースID",
      reviewSection: "コース権限レビュ―",
      orgSection: "組織セクション",
      orgSuspend: "組織を一時停止",
      orgReactivate: "組織を再有効化",
      orgReceipt: "この組織のトライアルと明細を表示",
      actionApprove: "コース権限を承認",
      actionReject: "コース権限を拒否",
      actionSuspend: "項目を一時停止",
      actionReactivate: "項目を再有効化",
    },
  },
  zh: {
    ...EN,
    title: "合作伙伴激活与球场权限",
    loading: "正在加载合作伙伴权限…",
    emptyClaims: "没有待处理权限事项。",
    emptyOrganizations: "未找到组织。",
    error: "合作伙伴权限不可用。",
    retry: "重试",
    retryAria: "重新加载合作伙伴权限",
    activate: "激活已批准合作伙伴",
    application: "已批准申请",
    course: "现有球场ID",
    review: "课程声明审核",
    organizations: "组织",
    appPlaceholder: "选择已批准申请",
    tierLabel: "等级",
    statuses: "状态",
    actions: "操作",
    smallBusiness: "小型企业",
    enterprise: "企业",
    unknownTier: "未知等级",
    approve: "批准",
    reject: "拒绝",
    suspend: "暂停",
    reactivate: "重新激活",
    trialStatement: "试用及明细",
    courseCountPrefix: "课程",
    orgCountPrefix: "组织",
    boundary:
      "管理员批准将身份和课程记录绑定。不会将课程数据直接发布到应用。",
    statusPending: "待处理",
    statusDisputed: "有争议",
    statusApproved: "已批准",
    statusSuspended: "暂停",
    statusActive: "启用",
    copy: {
      titleAria: "合作伙伴权限面板",
      appSelect: "选择已批准申请",
      courseInput: "现有课程 ID",
      reviewSection: "课程声明审核区",
      orgSection: "组织区域",
      orgSuspend: "暂停该组织",
      orgReactivate: "重新激活该组织",
      orgReceipt: "显示该组织的试用和明细",
      actionApprove: "批准课程声明",
      actionReject: "拒绝课程声明",
      actionSuspend: "暂停此项",
      actionReactivate: "重新激活此项",
    },
  },
  es: {
    ...EN,
    title: "Activación y autoridad de socio",
    loading: "Cargando autoridad de socios…",
    emptyClaims: "No hay trabajo de autoridad pendiente.",
    emptyOrganizations: "No se encontraron organizaciones.",
    error: "La autoridad de socios no está disponible.",
    retry: "Reintentar",
    retryAria: "Reintentar cargar autoridad de socios",
    activate: "Activar socio aprobado",
    application: "Solicitud aprobada",
    course: "ID de campo existente",
    review: "Revisión de reclamo de campo",
    organizations: "Organizaciones",
    appPlaceholder: "Seleccionar solicitud aprobada",
    tierLabel: "Nivel",
    statuses: "Estado",
    actions: "Acciones",
    smallBusiness: "Pequeña empresa",
    enterprise: "Empresa",
    unknownTier: "Nivel desconocido",
    approve: "Aprobar",
    reject: "Rechazar",
    suspend: "Suspender",
    reactivate: "Reactivar",
    trialStatement: "Prueba y estado",
    courseCountPrefix: "课程",
    orgCountPrefix: "组织",
    boundary:
      "La aprobación del administrador une identidades y registros de campos. Nunca publica datos de campo directamente en la app.",
    statusPending: "Pendiente",
    statusDisputed: "Disputado",
    statusApproved: "Aprobado",
    statusSuspended: "Suspendido",
    statusActive: "Activo",
    copy: {
      titleAria: "Panel de autoridad de socios",
      appSelect: "Seleccionar solicitud aprobada",
      courseInput: "ID de campo existente",
      reviewSection: "Sección de revisión de reclamos de campo",
      orgSection: "Sección de organizaciones",
      orgSuspend: "Suspender organización",
      orgReactivate: "Reactivar organización",
      orgReceipt: "Ver prueba y estado de esta organización",
      actionApprove: "Aprobar reclamo de campo",
      actionReject: "Rechazar reclamo de campo",
      actionSuspend: "Suspender elemento",
      actionReactivate: "Reactivar elemento",
    },
  },
  fr: {
    ...EN,
    title: "Activation et autorité des parcours",
    loading: "Chargement de l'autorité partenaire…",
    emptyClaims: "Aucun travail d'autorité en attente.",
    emptyOrganizations: "Aucune organisation trouvée.",
    error: "L'autorité partenaire est indisponible.",
    retry: "Réessayer",
    retryAria: "Recharger l'autorité partenaire",
    activate: "Activer le partenaire approuvé",
    application: "Demande approuvée",
    course: "ID de parcours existant",
    review: "Examen des demandes de parcours",
    organizations: "Organisations",
    appPlaceholder: "Sélectionner la demande approuvée",
    tierLabel: "Niveau",
    statuses: "Statut",
    actions: "Actions",
    smallBusiness: "Petite entreprise",
    enterprise: "Entreprise",
    unknownTier: "Niveau inconnu",
    approve: "Approuver",
    reject: "Rejeter",
    suspend: "Suspendre",
    reactivate: "Réactiver",
    trialStatement: "Essai et relevé",
    courseCountPrefix: "Parcours",
    orgCountPrefix: "Organisations",
    boundary:
      "L'approbation Admin lie identités et enregistrements de parcours. Elle ne publie jamais les données de parcours directement dans l'app.",
    statusPending: "En attente",
    statusDisputed: "Contesté",
    statusApproved: "Approuvé",
    statusSuspended: "Suspendu",
    statusActive: "Actif",
    copy: {
      titleAria: "Panneau d'autorité partenaire",
      appSelect: "Sélectionner la demande approuvée",
      courseInput: "ID de parcours existant",
      reviewSection: "Section d'examen des réclamations",
      orgSection: "Section des organisations",
      orgSuspend: "Suspendre l'organisation",
      orgReactivate: "Réactiver l'organisation",
      orgReceipt: "Afficher l'essai et le relevé de cette organisation",
      actionApprove: "Approuver la réclamation de parcours",
      actionReject: "Rejouter la réclamation de parcours",
      actionSuspend: "Suspendre l'élément",
      actionReactivate: "Réactiver l'élément",
    },
  },
  de: {
    ...EN,
    title: "Partneraktivierung und Platzberechtigung",
    loading: "Lade Partnerberechtigung…",
    emptyClaims: "Keine ausstehenden Berechtigungsaufgaben.",
    emptyOrganizations: "Keine Organisationen gefunden.",
    error: "Partnerberechtigung ist nicht verfügbar.",
    retry: "Wiederholen",
    retryAria: "Partnerberechtigung erneut laden",
    activate: "Freigegebenen Partner aktivieren",
    application: "Genehmigte Bewerbung",
    course: "Bestehende Platz-ID",
    review: "Überprüfung des Platzanspruchs",
    organizations: "Organisationen",
    appPlaceholder: "Genehmigten Antrag auswählen",
    tierLabel: "Ebene",
    statuses: "Status",
    actions: "Aktionen",
    smallBusiness: "Kleinbetrieb",
    enterprise: "Enterprise",
    unknownTier: "Unbekannte Ebene",
    approve: "Genehmigen",
    reject: "Ablehnen",
    suspend: "Aussetzen",
    reactivate: "Reaktivieren",
    trialStatement: "Test & Abrechnung",
    courseCountPrefix: "Plätze",
    orgCountPrefix: "Organisationen",
    boundary:
      "Die Admin-Genehmigung verknüpft Identitäten und Platzdatensätze und veröffentlicht keine Platzdaten direkt in der App.",
    statusPending: "Ausstehend",
    statusDisputed: "Streitig",
    statusApproved: "Genehmigt",
    statusSuspended: "Ausgesetzt",
    statusActive: "Aktiv",
    copy: {
      titleAria: "Partnerberechtigungsbereich",
      appSelect: "Genehmigten Antrag auswählen",
      courseInput: "Vorhandene Platz-ID",
      reviewSection: "Bereich zur Überprüfung von Platzansprüchen",
      orgSection: "Organisationenbereich",
      orgSuspend: "Organisation aussetzen",
      orgReactivate: "Organisation reaktivieren",
      orgReceipt: "Test- und Abrechnung dieser Organisation anzeigen",
      actionApprove: "Platzanspruch genehmigen",
      actionReject: "Platzanspruch ablehnen",
      actionSuspend: "Eintrag aussetzen",
      actionReactivate: "Eintrag reaktivieren",
    },
  },
} as const;

type LocaleCopy = (typeof COPY)[keyof typeof COPY];
const localeCopy = COPY as Record<"en" | "th" | "ko" | "ja" | "zh" | "es" | "fr" | "de", LocaleCopy>;

const statusLabels = (copy: LocaleCopy, value: string) => {
  if (value === "pending_admin") return copy.statusPending;
  if (value === "disputed") return copy.statusDisputed;
  if (value === "approved") return copy.statusApproved;
  if (value === "suspended") return copy.statusSuspended;
  return value;
};

const tierLabel = (copy: LocaleCopy, tier: string) => {
  if (tier === "small_business") return copy.smallBusiness;
  if (tier === "enterprise") return copy.enterprise;
  return copy.unknownTier;
};

const orgStatus = (copy: LocaleCopy, status: string) => {
  if (status === "active") return copy.statusActive;
  if (status === "suspended") return copy.statusSuspended;
  return status;
};

export default function V2PartnerAuthority() {
  const locale = useAdminLocale();
  const copy = localeCopy[locale];
  const [data, setData] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [appId, setAppId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [tier, setTier] = useState("small_business");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [receiptOrg, setReceiptOrg] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [stateData, applications] = await Promise.all([
        partnerAuthorityAdminService.load(),
        partnerAuthorityAdminService.applications(),
      ]);
      setData(stateData);
      setApps((applications.items || []).filter((x: any) => x.status === "approved"));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await fn();
      setNotice(`OK · ${result.receipt?.receiptId || result.organizationId || result.version}`);
      await load();
    } catch {
      setNotice(copy.error);
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") {
    return <p role="status">{copy.loading}</p>;
  }

  if (state === "error") {
    return (
      <div role="alert" className="reports-state">
        <p>{copy.error}</p>
        <button type="button" onClick={() => void load()} aria-label={copy.retryAria}>
          {copy.retry}
        </button>
      </div>
    );
  }

  return (
    <section className="partner-review">
      <header>
        <h2 aria-label={copy.copy.titleAria}>{copy.title}</h2>
        <strong>{copy.boundary}</strong>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => partnerAuthorityAdminService.activate(appId, courseId, tier));
        }}
      >
        <h3>{copy.activate}</h3>
        <label htmlFor="authority-application">
          {copy.application}
          <select
            id="authority-application"
            required
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            aria-label={copy.copy.appSelect}
          >
            <option value="">{copy.appPlaceholder}</option>
            {apps.map((x: any) => (
              <option key={x.applicationId} value={x.applicationId}>
                {x.organization} · {x.country}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="authority-course">
          {copy.course}
          <input
            id="authority-course"
            required
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            aria-label={copy.copy.courseInput}
          />
        </label>
        <label>
          {copy.tierLabel}
          <select value={tier} onChange={(event) => setTier(event.target.value)} aria-label={copy.tierLabel}>
            <option value="small_business">{copy.smallBusiness}</option>
            <option value="enterprise">{copy.enterprise}</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {copy.activate}
        </button>
      </form>

      <h3>{copy.review}</h3>
      <p>{`${copy.orgCountPrefix}: ${data.organizations.length} · ${copy.courseCountPrefix}: ${data.coverage?.courses || 0}`}</p>
      {!data.claims.length ? (
        <p>{copy.emptyClaims}</p>
      ) : (
        <ul>
          {data.claims.map((x: any) => (
            <li key={x.claimId}>
              <span>{copy.course}: </span>
              <strong>{x.courseId}</strong> · {copy.statuses}: {statusLabels(copy, x.status)} · v{x.version}
              <span> · {copy.actions}: </span>
              {["pending_admin", "disputed"].includes(x.status) && (
                <>
                  <button disabled={busy} aria-label={copy.copy.actionApprove} onClick={() => void run(() => partnerAuthorityAdminService.claim(x.claimId, "approved", x.version))}>
                    {copy.approve}
                  </button>
                  <button disabled={busy} aria-label={copy.copy.actionReject} onClick={() => void run(() => partnerAuthorityAdminService.claim(x.claimId, "rejected", x.version))}>
                    {copy.reject}
                  </button>
                </>
              )}
              {x.status === "approved" && (
                <button disabled={busy} aria-label={copy.copy.actionSuspend} onClick={() => void run(() => partnerAuthorityAdminService.claim(x.claimId, "suspended", x.version))}>
                  {copy.suspend}
                </button>
              )}
              {x.status === "suspended" && (
                <button disabled={busy} aria-label={copy.copy.actionReactivate} onClick={() => void run(() => partnerAuthorityAdminService.claim(x.claimId, "approved", x.version))}>
                  {copy.reactivate}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>{copy.organizations}</h3>
      <p>{`${copy.orgCountPrefix}: ${data.organizations.length}`}</p>
      {!data.organizations.length ? (
        <p>{copy.emptyOrganizations}</p>
      ) : (
        <ul>
          {data.organizations.map((x: any) => (
            <li key={x.organizationId}>
              {x.name} · {tierLabel(copy, x.tier)} · {orgStatus(copy, x.status)} · v{x.version}
              <button
                disabled={busy}
                aria-label={x.status === "active" ? copy.copy.orgSuspend : copy.copy.orgReactivate}
                onClick={() => void run(() => partnerAuthorityAdminService.organization(x.organizationId, x.status === "active" ? "suspended" : "active", x.version))}
              >
                {x.status === "active" ? copy.suspend : copy.reactivate}
              </button>
              <button
                type="button"
                aria-label={copy.copy.orgReceipt}
                aria-pressed={receiptOrg === x.organizationId}
                onClick={() => setReceiptOrg(receiptOrg === x.organizationId ? "" : x.organizationId)}
              >
                {copy.trialStatement}
              </button>
            </li>
          ))}
        </ul>
      )}

      {receiptOrg && <PartnerTrialReceipt admin organizationId={receiptOrg} />}
      {notice && <p role={notice.startsWith("OK") ? "status" : "alert"}>{notice}</p>}
    </section>
  );
}
