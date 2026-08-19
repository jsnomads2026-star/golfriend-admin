import { useCallback, useEffect, useState } from "react";
import { partnerAuthorityService } from "./partnerAuthorityService";
import { useLocale } from "../../i18n/hooks";
import "./PartnerAuthorityConsole.css";

const EN = {
  title: "Organization & course authority",
  loading: "Loading authoritative partner access…",
  empty: "No course claims yet.",
  error: "Partner authority is unavailable. No change was made.",
  retry: "Retry",
  retryLabel: "Retry loading partner authority",
  claim: "Request course claim",
  course: "Approved course ID",
  staff: "Staff and roles",
  staffEmailLabel: "Staff email",
  invite: "Invite staff",
  revoke: "Revoke",
  revokeLabel: "Revoke staff access",
  transfer: "Transfer primary owner",
  transferLabel: "Transfer primary owner role",
  dispute: "Open claim dispute",
  disputeLabel: "Open a claim dispute",
  providers:
    "Notifications and document storage are not configured; external delivery and uploads fail closed.",
  audit:
    "Every command creates an immutable server receipt. Course claims require Admin approval and never publish course data directly.",
  organization: "Organization",
  status: "Status",
  yourRole: "Your role",
  version: "Version",
  claims: "Claims",
  approvedMaterials: "Approved materials",
  claimStatusLabel: "Claim status",
  roleLabel: "Role",
  roleManager: "Manager",
  roleCourseStaff: "Course staff",
  roleSupport: "Support",
  roleAnalyst: "Analyst",
  rolePrimaryOwner: "Primary owner",
  statusApproved: "Approved",
  statusRejected: "Rejected",
  statusPending: "Pending",
  statusUnknown: "Unknown status",
  tierLabel: "Tier",
  tierBasicOperator: "Basic operator",
  tierCommercial: "Commercial",
  tierEnterprise: "Enterprise",
  actionApprove: "Approve",
  actionReject: "Reject",
  success: "Notice",
  statusError: "Operation failed",
};

const C: any = {
  en: EN,
  th: {
    ...EN,
    title: "สิทธิ์องค์กรและสนามกอล์ฟ",
    loading: "กำลังโหลดสิทธิ์พันธมิตร…",
    empty: "ยังไม่มีคำขอสิทธิ์สนาม",
    error: "ระบบสิทธิ์พันธมิตรไม่พร้อมใช้งาน ไม่มีการเปลี่ยนแปลง",
    retry: "ลองอีกครั้ง",
    retryLabel: "ลองโหลดสิทธิ์พันธมิตรอีกครั้ง",
    claim: "ขอสิทธิ์ดูแลสนาม",
    course: "รหัสสนามที่แอดมินอนุมัติ",
    staff: "พนักงานและบทบาท",
    staffEmailLabel: "อีเมลพนักงาน",
    invite: "เชิญพนักงาน",
    revoke: "เพิกถอน",
    revokeLabel: "เพิกถอนการเข้าถึงพนักงาน",
    transfer: "โอนเจ้าของหลัก",
    transferLabel: "โอนบทบาทผู้เป็นเจ้าของหลัก",
    dispute: "เปิดข้อโต้แย้งสิทธิ์",
    disputeLabel: "เปิดข้อโต้แย้งสิทธิ์",
    providers:
      "ยังไม่ได้ตั้งค่าการแจ้งเตือนและพื้นที่เอกสาร ระบบจึงปิดการส่งภายนอกและอัปโหลด",
    organization: "องค์กร",
    status: "สถานะ",
    yourRole: "บทบาทของคุณ",
    version: "เวอร์ชัน",
    claims: "คำขอสิทธิ์",
    approvedMaterials: "เอกสารที่อนุมัติแล้ว",
    claimStatusLabel: "สถานะคำขอ",
    roleLabel: "บทบาท",
    roleManager: "ผู้จัดการ",
    roleCourseStaff: "พนักงานสนาม",
    roleSupport: "ฝ่ายสนับสนุน",
    roleAnalyst: "นักวิเคราะห์",
    rolePrimaryOwner: "ผู้เป็นเจ้าของหลัก",
    statusApproved: "อนุมัติแล้ว",
    statusRejected: "ปฏิเสธแล้ว",
    statusPending: "รอดำเนินการ",
    statusUnknown: "ไม่ทราบสถานะ",
    tierLabel: "ระดับ",
    tierBasicOperator: "ผู้ปฏิบัติการพื้นฐาน",
    tierCommercial: "เชิงพาณิชย์",
    tierEnterprise: "วิสาหกิจ",
    actionApprove: "อนุมัติ",
    actionReject: "ปฏิเสธ",
    audit: "ทุกคำสั่งมีใบรับรองถาวร การอ้างสิทธิ์สนามต้องผ่านแอดมินและไม่เผยแพร่ข้อมูลสนามเข้าแอปโดยตรง",
  },
  ko: {
    ...EN,
    title: "조직 및 코스 권한",
    organization: "조직",
    status: "상태",
    yourRole: "역할",
    version: "버전",
    claims: "요청",
    approvedMaterials: "승인된 자료",
    claimStatusLabel: "요청 상태",
    roleManager: "관리자",
    roleCourseStaff: "코스 스태프",
    roleSupport: "지원",
    roleAnalyst: "분석가",
    rolePrimaryOwner: "최고 소유자",
    statusApproved: "승인됨",
    statusRejected: "거절됨",
    statusPending: "대기 중",
    tierLabel: "등급",
    tierBasicOperator: "기본 운영자",
    tierCommercial: "상업",
    tierEnterprise: "엔터프라이즈",
    actionApprove: "승인",
    actionReject: "거절",
  },
  ja: {
    ...EN,
    title: "組織とコース権限",
    organization: "組織",
    status: "ステータス",
    yourRole: "あなたのロール",
    version: "バージョン",
    claims: "申請",
    approvedMaterials: "承認済み資料",
    claimStatusLabel: "申請ステータス",
    roleManager: "マネージャー",
    roleCourseStaff: "コーススタッフ",
    roleSupport: "サポート",
    roleAnalyst: "分析担当",
    rolePrimaryOwner: "プライマリオーナー",
    statusApproved: "承認済み",
    statusRejected: "拒否済み",
    statusPending: "保留中",
    tierLabel: "ランク",
    tierBasicOperator: "ベーシック運営",
    tierCommercial: "商用",
    tierEnterprise: "エンタープライズ",
    actionApprove: "承認",
    actionReject: "却下",
  },
  zh: {
    ...EN,
    title: "组织与球场权限",
    organization: "组织",
    status: "状态",
    yourRole: "您的角色",
    version: "版本",
    claims: "申请",
    approvedMaterials: "已批准的材料",
    claimStatusLabel: "申请状态",
    roleManager: "管理员",
    roleCourseStaff: "场馆员工",
    roleSupport: "支持",
    roleAnalyst: "分析师",
    rolePrimaryOwner: "主要所有者",
    statusApproved: "已批准",
    statusRejected: "已拒绝",
    statusPending: "待处理",
    tierLabel: "层级",
    tierBasicOperator: "基础运营",
    tierCommercial: "商业",
    tierEnterprise: "企业",
    actionApprove: "批准",
    actionReject: "拒绝",
  },
  es: {
    ...EN,
    title: "Autoridad de organización y campo",
    organization: "Organización",
    status: "Estado",
    yourRole: "Tu rol",
    version: "Versión",
    claims: "Solicitudes",
    approvedMaterials: "Materiales aprobados",
    claimStatusLabel: "Estado de la solicitud",
    roleManager: "Gerente",
    roleCourseStaff: "Personal del campo",
    roleSupport: "Soporte",
    roleAnalyst: "Analista",
    rolePrimaryOwner: "Propietario principal",
    statusApproved: "Aprobado",
    statusRejected: "Rechazado",
    statusPending: "Pendiente",
    tierLabel: "Nivel",
    tierBasicOperator: "Operador básico",
    tierCommercial: "Comercial",
    tierEnterprise: "Empresa",
    actionApprove: "Aprobar",
    actionReject: "Rechazar",
  },
  fr: {
    ...EN,
    title: "Autorité organisation et parcours",
    organization: "Organisation",
    status: "Statut",
    yourRole: "Votre rôle",
    version: "Version",
    claims: "Demandes",
    approvedMaterials: "Documents approuvés",
    claimStatusLabel: "État de la demande",
    roleManager: "Responsable",
    roleCourseStaff: "Personnel du parcours",
    roleSupport: "Support",
    roleAnalyst: "Analyste",
    rolePrimaryOwner: "Propriétaire principal",
    statusApproved: "Approuvé",
    statusRejected: "Rejeté",
    statusPending: "En attente",
    tierLabel: "Niveau",
    tierBasicOperator: "Opérateur de base",
    tierCommercial: "Commercial",
    tierEnterprise: "Entreprise",
    actionApprove: "Approuver",
    actionReject: "Rejeter",
  },
  de: {
    ...EN,
    title: "Organisations- und Platzberechtigung",
    organization: "Organisation",
    status: "Status",
    yourRole: "Ihre Rolle",
    version: "Version",
    claims: "Anträge",
    approvedMaterials: "Genehmigte Unterlagen",
    claimStatusLabel: "Antragsstatus",
    roleManager: "Manager",
    roleCourseStaff: "Platzpersonal",
    roleSupport: "Support",
    roleAnalyst: "Analyst",
    rolePrimaryOwner: "Primäre Eigentümer",
    statusApproved: "Genehmigt",
    statusRejected: "Abgelehnt",
    statusPending: "Ausstehend",
    tierLabel: "Stufe",
    tierBasicOperator: "Basisbetreiber",
    tierCommercial: "Kommerziell",
    tierEnterprise: "Unternehmen",
    actionApprove: "Genehmigen",
    actionReject: "Ablehnen",
  },
};

const statusLabel = (copy: typeof EN, status: string) => {
  if (status === "approved") return copy.statusApproved;
  if (status === "rejected") return copy.statusRejected;
  if (status === "pending") return copy.statusPending;
  return copy.statusUnknown;
};

const roleLabel = (copy: typeof EN, role: string) => {
  if (role === "manager") return copy.roleManager;
  if (role === "course_staff") return copy.roleCourseStaff;
  if (role === "support") return copy.roleSupport;
  if (role === "analyst") return copy.roleAnalyst;
  if (role === "primary_owner") return copy.rolePrimaryOwner;
  return role;
};

const tierLabel = (copy: typeof EN, tier?: string) => {
  if (!tier) return "—";
  if (tier === "basic_operator") return copy.tierBasicOperator;
  if (tier === "commercial") return copy.tierCommercial;
  if (tier === "enterprise") return copy.tierEnterprise;
  return tier;
};

export default function PartnerAuthorityConsole() {
  const locale = useLocale();
  const copy = C[locale] || EN;
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [course, setCourse] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("course_staff");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await partnerAuthorityService.load());
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
      setNotice(`OK · ${result.receipt?.receiptId || result.claimId || result.version}`);
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
      <section role="alert" aria-live="assertive">
        <p>{copy.error}</p>
        <button type="button" onClick={() => void load()} aria-label={copy.retryLabel}>
          {copy.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="partner-authority">
      <header>
        <h2>{copy.title}</h2>
        <p>{copy.audit}</p>
        {(!data.notificationProviderConfigured || !data.storageConfigured) && (
          <strong role="status">{copy.providers}</strong>
        )}
      </header>
      <dl>
        <dt>{copy.organization}</dt>
        <dd>{data.organization.name}</dd>
        <dt>{copy.status}</dt>
        <dd>{statusLabel(copy, data.organization.status)}</dd>
        <dt>{copy.tierLabel}</dt>
        <dd>{tierLabel(copy, data.organization.tier)}</dd>
        <dt>{copy.yourRole}</dt>
        <dd>{roleLabel(copy, data.membership.role)}</dd>
        <dt>{copy.version}</dt>
        <dd>{data.organization.version}</dd>
      </dl>

      <form onSubmit={(e) => {
        e.preventDefault();
        void run(() => partnerAuthorityService.claim(course, 0));
      }}>
        <h3>{copy.claim}</h3>
        <label htmlFor="pacl-course-id">
          {copy.course}
          <input
            id="pacl-course-id"
            required
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          aria-label={copy.claim}
        >
          {copy.claim}
        </button>
      </form>

      <section>
        <h3>{copy.claims}</h3>
        <h4 id="claims-table-heading" className="sr-only">
          {copy.claimStatusLabel}
        </h4>
        {!data.claims.length ? (
          <p>{copy.empty}</p>
        ) : (
          <ul aria-labelledby="claims-table-heading">
            {data.claims.map((x: any) => (
              <li key={x.claimId}>
                {x.courseId} · {statusLabel(copy, x.status)} · v{x.version}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(copy.dispute);
                    if (reason) void run(() => partnerAuthorityService.dispute(x.claimId, reason));
                  }}
                  aria-label={`${copy.disputeLabel}: ${x.courseId}`}
                >
                  {copy.dispute}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={(e) => {
        e.preventDefault();
        void run(() => partnerAuthorityService.invite(email, role));
      }}>
        <h3>{copy.staff}</h3>
        <label htmlFor="pacl-staff-email">
          {copy.staffEmailLabel}
          <input
            id="pacl-staff-email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor="pacl-staff-role">
          {copy.roleLabel}
          <select id="pacl-staff-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="manager">{copy.roleManager}</option>
            <option value="course_staff">{copy.roleCourseStaff}</option>
            <option value="support">{copy.roleSupport}</option>
            <option value="analyst">{copy.roleAnalyst}</option>
            <option value="primary_owner">{copy.rolePrimaryOwner}</option>
          </select>
        </label>
        <button type="submit" disabled={busy} aria-label={`${copy.invite} ${email}`}>
          {copy.invite}
        </button>
      </form>

      <ul>
        {data.members.map((x: any) => (
          <li key={x.uid}>
            {x.uid} · {roleLabel(copy, x.role)} · {statusLabel(copy, x.status)}
            {x.role !== "primary_owner" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => partnerAuthorityService.revoke(x.uid, x.version))}
                  aria-label={`${copy.revokeLabel}: ${x.uid}`}
                >
                  {copy.revoke}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`${copy.transfer}: ${x.uid}`)) {
                      void run(() =>
                        partnerAuthorityService.transfer(
                          data.organization.organizationId,
                          x.uid,
                          data.organization.version
                        )
                      );
                    }
                  }}
                  aria-label={`${copy.transferLabel}: ${x.uid}`}
                >
                  {copy.transfer}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3>{copy.approvedMaterials}</h3>
      <ul>
        {data.materials.map((x: any) => (
          <li key={x.assetId || x.id}>{x.title}</li>
        ))}
      </ul>

      {notice && (
        <p role={notice.startsWith("OK") ? "status" : "alert"} aria-live="polite">
          {notice}
        </p>
      )}
    </section>
  );
}
