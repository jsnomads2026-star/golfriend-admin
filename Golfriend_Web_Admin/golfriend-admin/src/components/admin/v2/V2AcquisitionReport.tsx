import { useEffect, useMemo, useState } from "react";
import { useAdminLocale } from "./AdminLocaleContext";
import type { AdminLocale } from "./adminNavigation";
import {
  acquisitionReportToCsv,
  acquisitionReportToJson,
  acquisitionReportToText,
  buildAcquisitionReport,
  JHCC_TRANSMISSION_SCHEMA,
  type AcquisitionReport,
} from "./acquisitionReportingModel.mjs";
import {
  localPreviewAcquisitionProvider,
  type AcquisitionProvider,
  type AcquisitionSnapshot,
} from "./courseAcquisitionProvider";
import "./V2AcquisitionReport.css";

type LocaleMap = Record<string, string>;

const EN = {
  header: "ADMIN · ACQUISITION ANALYTICS",
  title: "Course acquisition reporting",
  description:
    "Country and course-level acquisition analytics prepared for a future approved Golfriend-to-JHCC reporting contract.",
  previewTitle: "Local preview data",
  previewSub:
    "Golfriend Admin manages Golfriend. JHCC receives oversight reporting only and is never the booking engine or a payment processor.",
  periodStart: "Period start",
  periodEnd: "Period end",
  generate: "Generate acquisition report",
  fail: "Acquisition analytics source unavailable. Retry after an approved source is configured.",
  loading: "Loading acquisition analytics…",
  reload: "Retry",
  reportStatusNo: "No report generated yet.",
  reportStatusSuffix: "Generate to review this surface.",
  reportStatusPrefix: "Deliverable",
  statusScreen: "screen",
  statusAuthorization: "authorization",
  statusTransmitter: "transmitter",
  statusGenerated: "generated",
  prospects: "Prospects",
  countries: "Countries",
  commissionEffective: "Commission-effective",
  opportunityEvidenceOnly: "Opportunity evidence only",
  byCountry: "By country",
  byCourse: "By course",
  country: "Country",
  prospectsHeader: "Prospects",
  commissionEffectiveHeader: "Commission-effective",
  attribution: "Attribution",
  bookingInterest: "Booking interest",
  confirmedBookings: "Confirmed bookings",
  course: "Course",
  countryRegion: "Country / region",
  stage: "Stage",
  contract: "Contract",
  commission: "Commission",
  contacts: "Contacts",
  nextFollowUp: "Next follow-up",
  withheld: "Withheld — {reason}",
  partial: "{value} (partial — {contributing} of {total} courses reporting)",
  jhccContract: "JHCC reporting contract",
  privacyStatus: "Privacy screening: ",
  privacyOk: "passed — no prohibited field or personal value found",
  privacyBlocked: "blocked — {reason}",
  deliveryStatus: "Delivery: ",
  deliveryStatusFallback: "{status} · {reason}",
  gatePrivacy: "Privacy screen: ",
  gateAuthorization: "Authorization: ",
  gateTransmitter: "Transmitter: ",
  statePassed: "passed",
  stateBlocked: "blocked",
  stateYes: "yes",
  stateNo: "no",
  stateApproved: "approved",
  stateNotApproved: "not approved",
  stateMounted: "mounted",
  stateNotMounted: "not mounted",
  deliveryNotice:
    "Delivery requires all three conditions. An approved authorization alone is never sufficient.",
  noSchedule: "Not scheduled",
  downloadTxt: "Download TXT",
  downloadCsv: "Download CSV",
  copyJson: "Copy JSON",
  copied: "Copied",
  copyBlocked: "Clipboard unavailable",
  transmitUnavailable: "Transmit to JHCC unavailable",
  stageIdentified: "Identified",
  stageResearching: "Researching",
  stageContacted: "Contacted",
  stageResponded: "Responded",
  stageMeetingHeld: "Meeting held",
  stagePilotDiscussion: "Pilot discussion",
  stageAgreementDrafting: "Agreement drafting",
  stageOnboardingHandoff: "Onboarding handoff",
  stageSigned: "Signed",
  stageDeclined: "Declined",
  stageDormant: "Dormant",
  stageSourceUnavailable: "Source unavailable",
  contractStateNone: "None",
  contractStatePilotProposed: "Pilot proposed",
  contractStatePilotActive: "Pilot active",
  contractStateAgreementSent: "Agreement sent",
  contractStateSignedPendingEffective: "Signed, pending effective date",
  contractStateEffective: "Effective",
  contractStateLapsed: "Lapsed",
  contractStateContractDeclined: "Declined",
  contractStateSourceUnavailable: "Source unavailable",
  attributionAuthoritative: "Authoritative",
  attributionUnverified: "Unverified",
  attributionUnavailable: "Unavailable",
  reasonNoAuthorizationRecord: "No authorization record",
  reasonAuthorizationNotApproved: "Authorization not approved",
  reasonNoContractReference: "No contract reference",
  reasonInvalidEvaluationDate: "Invalid evaluation date",
  reasonNoEffectiveDate: "No effective date",
  reasonNotYetEffective: "Authorization not yet effective",
  reasonAuthorizationLapsed: "Authorization lapsed",
  reasonApprovedAndEffective: "Approved effective contract",
  reasonNotAuthoritativelyAttributed: "Not attributed with authority",
  reasonSourceUnavailable: "Source unavailable",
  reasonNotRecorded: "Not recorded",
  reasonSuppressedLowVolume: "Suppressed for low volume",
  reasonDisclosed: "disclosed",
  reasonContractStateNotCommissionBearing: "Contract not commission-bearing",
  reasonNoSignedAgreement: "No signed agreement",
  reasonNoAgreedRate: "No agreed commission rate",
  reasonAgreementLapsed: "Agreement lapsed",
  reasonActivationNotVerified: "Activation not verified",
  reasonPilotWindowClosed: "Pilot window closed",
  reasonSignedEffectiveAndActivated: "Signed, effective, activated",
};

const ACQUISITION_COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {
    ...EN,
    header: "แอดมิน · การวิเคราะห์การได้ลูกค้า",
    title: "รายงานการได้ลูกค้าหลักสูตร",
    description:
      "การวิเคราะห์การได้ลูกค้าในระดับประเทศและหลักสูตรสำหรับสัญญาการรายงาน Golfriend-to-JHCC ที่อนุมัติในอนาคต",
    previewTitle: "ข้อมูลตัวอย่างภายใน",
    previewSub:
      "Golfriend Admin บริหารจัดการ Golfriend ข้อมูลสำหรับ JHCC เป็นการรายงานตรวจสอบเท่านั้นและไม่เคยเป็นระบบจองหรือผู้ประมวลผลการชำระเงิน",
    periodStart: "ช่วงเวลาระยะแรก",
    periodEnd: "ช่วงเวลาระยะท้าย",
    generate: "สร้างรายงานการได้ลูกค้า",
    fail: "ไม่สามารถโหลดข้อมูลการวิเคราะห์การได้ลูกค้าได้ ลองใหม่อีกครั้งเมื่อกำหนดแหล่งที่อนุมัติแล้ว",
    loading: "กำลังโหลดการวิเคราะห์การได้ลูกค้า…",
    reportStatusNo: "ยังไม่มีรายงานที่สร้างขึ้น",
    reportStatusSuffix: "สร้างเพื่อทบทวนข้อมูลนี้",
    statusScreen: "หน้าจอ",
    statusAuthorization: "สิทธิ์อนุมัติ",
    statusTransmitter: "ตัวส่งข้อมูล",
    statusGenerated: "สร้างแล้ว",
    reportStatusPrefix: "สามารถส่งมอบ",
    withheld: "ไม่เผยแพร่ — {reason}",
    partial: "{value} (บางส่วน — รายงานจาก {contributing}/{total} หลักสูตร)",
    prospects: "แนวโน้ม",
    countries: "ประเทศ",
    commissionEffective: "ผลักดันค่าส่งเสริม",
    opportunityEvidenceOnly: "เฉพาะหลักฐานโอกาส",
    byCountry: "ตามประเทศ",
    byCourse: "ตามหลักสูตร",
    country: "ประเทศ",
    prospectsHeader: "แนวโน้ม",
    commissionEffectiveHeader: "การเรียกเก็บค่านายหน้า",
    attribution: "ที่มาของข้อมูล",
    bookingInterest: "ความสนใจการจอง",
    confirmedBookings: "การจองที่ยืนยัน",
    course: "หลักสูตร",
    countryRegion: "ประเทศ / เขต",
    stage: "ขั้นตอน",
    contract: "สัญญา",
    commission: "ค่าคอมมิชชั่น",
    contacts: "ผู้ติดต่อ",
    nextFollowUp: "ติดตามครั้งถัดไป",
    statePassed: "ผ่าน",
    stateBlocked: "ถูกบล็อก",
    stateYes: "ใช่",
    stateNo: "ไม่",
    stateApproved: "อนุมัติ",
    stateNotApproved: "ยังไม่อนุมัติ",
    stateMounted: "เชื่อมต่อแล้ว",
    stateNotMounted: "ยังไม่เชื่อมต่อ",
    noSchedule: "ยังไม่นัดหมาย",
    copyJson: "คัดลอก JSON",
    copied: "คัดลอกแล้ว",
    copyBlocked: "ไม่สามารถคัดลอกได้",
    transmitUnavailable: "ส่งไปยัง JHCC ไม่สามารถใช้ได้",
  },
  ko: {
    ...EN,
    header: "관리자 · 획득 분석",
    title: "코스 획득 보고서",
    description:
      "향후 승인된 Golfriend-to-JHCC 보고 계약을 위해 국가 및 코스 수준의 획득 분석을 준비합니다.",
    previewTitle: "로컬 미리보기 데이터",
    periodStart: "시작일",
    periodEnd: "종료일",
    generate: "획득 보고서 생성",
    fail: "획득 분석 소스에 액세스할 수 없습니다. 승인된 소스를 구성한 후 다시 시도하세요.",
    loading: "획득 분석을 로드 중…",
    reload: "다시 시도",
    reportStatusNo: "아직 보고서가 생성되지 않았습니다.",
    reportStatusSuffix: "이 화면을 검토하려면 생성하십시오.",
    reportStatusPrefix: "전송 가능",
    previewSub:
      "Golfriend 관리자는 Golfriend를 관리합니다. JHCC는 감사 목적의 보고만 받으며 예약 엔진이나 결제 처리기로 동작하지 않습니다.",
    statusGenerated: "생성됨",
    prospects: "예비 고객",
    countries: "국가",
    commissionEffective: "커미션 유효",
    opportunityEvidenceOnly: "기회 증거만",
    byCountry: "국가별",
    byCourse: "코스별",
    country: "국가",
    prospectsHeader: "예비 고객",
    commissionEffectiveHeader: "커미션 유효",
    attribution: "소스",
    bookingInterest: "예약 관심도",
    confirmedBookings: "확정된 예약",
    course: "코스",
    countryRegion: "국가 / 지역",
    stage: "단계",
    contract: "계약",
    commission: "수수료",
    contacts: "담당자",
    nextFollowUp: "다음 팔로업",
    withheld: "제한됨 — {reason}",
    partial: "{value} (일부만 공개됨 — {contributing}/{total} 코스 보고)",
    jhccContract: "JHCC 보고 계약",
    privacyStatus: "개인정보 심사: ",
    privacyOk: "통과 — 금지 필드 또는 개인 값 없음",
    privacyBlocked: "차단 — {reason}",
    deliveryStatus: "전송: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "개인정보 스크린: ",
    gateAuthorization: "권한: ",
    gateTransmitter: "송신기: ",
    statePassed: "통과",
    stateBlocked: "차단",
    stateYes: "예",
    stateNo: "아니오",
    stateApproved: "승인됨",
    stateNotApproved: "미승인",
    stateMounted: "마운트됨",
    stateNotMounted: "미마운트",
    deliveryNotice: "전송에는 3가지 조건이 모두 충족되어야 합니다. 승인만으로는 충분하지 않습니다.",
    downloadTxt: "TXT 다운로드",
    downloadCsv: "CSV 다운로드",
    copyJson: "JSON 복사",
    copied: "복사됨",
    copyBlocked: "클립보드 사용 불가",
    transmitUnavailable: "JHCC 전송 불가",
    statusScreen: "검증",
    statusAuthorization: "권한",
    statusTransmitter: "송신기",
    noSchedule: "미예약",
  },
  ja: {
    ...EN,
    header: "管理者 · アクイジション分析",
    title: "コース獲得レポート",
    description:
      "将来の承認済み Golfriend-to-JHCC 報告契約向けの、国別・コース別アクイジション分析です。",
    previewTitle: "ローカルプレビュー",
    periodStart: "開始日",
    periodEnd: "終了日",
    generate: "獲得レポートを生成",
    fail: "獲得分析のソースにアクセスできません。承認済みソースを設定してから再試行してください。",
    loading: "獲得分析を読み込み中…",
    reload: "再試行",
    reportStatusNo: "まだレポートが生成されていません。",
    reportStatusSuffix: "この画面を確認するには生成してください。",
    statusScreen: "画面",
    statusAuthorization: "承認",
    statusTransmitter: "送信機",
    copyJson: "JSONコピー",
    copied: "コピーしました",
    copyBlocked: "クリップボード利用不可",
    transmitUnavailable: "JHCC への送信不可",
    previewSub:
      "Golfriend管理者はGolfriendを管理します。JHCCは監査用のレポートのみ受領し、予約エンジンや決済処理を行いません。",
    statusGenerated: "作成済み",
    reportStatusPrefix: "配信可",
    prospects: "見込み顧客",
    countries: "国",
    commissionEffective: "コミッション有効",
    opportunityEvidenceOnly: "機会証拠のみ",
    byCountry: "国別",
    byCourse: "コース別",
    country: "国",
    prospectsHeader: "見込み顧客",
    commissionEffectiveHeader: "コミッション有効",
    attribution: "アトリビューション",
    bookingInterest: "予約関心",
    confirmedBookings: "確定予約数",
    course: "コース",
    countryRegion: "国・地域",
    stage: "ステージ",
    contract: "契約",
    commission: "コミッション",
    contacts: "連絡先",
    nextFollowUp: "次回フォローアップ",
    noSchedule: "未予約",
    withheld: "非表示 — {reason}",
    partial: "{value} (一部表示 — {contributing}/{total} コース報告)",
    jhccContract: "JHCC報告契約",
    privacyStatus: "プライバシー審査: ",
    privacyOk: "合格 — 禁止フィールドまたは個人情報は見つかりませんでした",
    privacyBlocked: "ブロック — {reason}",
    deliveryStatus: "配信: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "プライバシー画面: ",
    gateAuthorization: "権限: ",
    gateTransmitter: "送信機: ",
    statePassed: "合格",
    stateBlocked: "ブロック",
    stateYes: "はい",
    stateNo: "いいえ",
    stateApproved: "承認",
    stateNotApproved: "未承認",
    stateMounted: "マウント済み",
    stateNotMounted: "未マウント",
    deliveryNotice: "配信には3条件すべてが必要です。承認だけでは十分ではありません。",
    downloadTxt: "TXTをダウンロード",
    downloadCsv: "CSVをダウンロード",
  },
  zh: {
    ...EN,
    header: "管理员 · 获取分析",
    title: "课程获客报告",
    description: "为未来获得批准的 Golfriend-to-JHCC 报告合同准备国家/课程级别的获客分析。",
    previewTitle: "本地预览数据",
    periodStart: "开始日期",
    periodEnd: "结束日期",
    generate: "生成获取报告",
    fail: "无法访问获取分析数据源。请在配置批准来源后重试。",
    loading: "正在加载获取分析…",
    reload: "重试",
    reportStatusNo: "尚未生成报告。",
    reportStatusSuffix: "请先生成后查看此页面。",
    reportStatusPrefix: "可交付",
    statusGenerated: "已生成",
    course: "课程",
    previewSub:
      "Golfriend管理员管理Golfriend。JHCC仅用于监督报告，不会作为预订引擎或支付处理器。",
    prospects: "潜在客户",
    countries: "国家",
    commissionEffective: "生效佣金",
    opportunityEvidenceOnly: "仅机会证据",
    byCountry: "按国家",
    byCourse: "按课程",
    country: "国家",
    prospectsHeader: "潜在客户",
    commissionEffectiveHeader: "生效佣金",
    attribution: "归因",
    bookingInterest: "预约兴趣",
    confirmedBookings: "确认预约数",
    countryRegion: "国家/地区",
    stage: "阶段",
    contract: "合同",
    commission: "佣金",
    contacts: "联系人",
    nextFollowUp: "下次跟进",
    noSchedule: "未安排",
    withheld: "未公开 — {reason}",
    partial: "{value}（部分 — {contributing}/{total} 课程报告）",
    jhccContract: "JHCC报告合同",
    privacyStatus: "隐私筛查: ",
    privacyOk: "已通过 — 未发现禁止字段或个人值",
    privacyBlocked: "已阻止 — {reason}",
    deliveryStatus: "传输: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "隐私屏幕: ",
    gateAuthorization: "授权: ",
    gateTransmitter: "传输器: ",
    statePassed: "通过",
    stateBlocked: "阻止",
    stateYes: "是",
    stateNo: "否",
    stateApproved: "已批准",
    stateNotApproved: "未批准",
    stateMounted: "已挂载",
    stateNotMounted: "未挂载",
    deliveryNotice: "传输需要三个条件。仅有授权永远不足。",
    downloadTxt: "下载TXT",
    downloadCsv: "下载CSV",
    copyJson: "复制JSON",
    copied: "已复制",
    copyBlocked: "剪贴板不可用",
    transmitUnavailable: "无法传输到JHCC",
  },
  es: {
    ...EN,
    header: "ADMIN · ANÁLISIS DE ADQUISICIÓN",
    title: "Informe de adquisición de cursos",
    description:
      "Análisis de adquisición por país y curso preparado para un contrato futuro aprobado de reporte Golfriend-to-JHCC.",
    previewTitle: "Datos de vista previa local",
    periodStart: "Inicio del período",
    periodEnd: "Fin del período",
    generate: "Generar informe de adquisición",
    fail: "No se puede acceder al origen de analítica de adquisición. Reinténtalo tras configurar una fuente aprobada.",
    loading: "Cargando analítica de adquisición…",
    reload: "Reintentar",
    reportStatusNo: "Aún no se ha generado ningún informe.",
    reportStatusSuffix: "Genérelo para revisar esta vista.",
    reportStatusPrefix: "Disponible para entrega",
    statusGenerated: "generado",
    previewSub:
      "Golfriend Admin administra Golfriend. JHCC solo recibe informes de supervisión y nunca es el motor de reservas ni un procesador de pagos.",
    prospects: "Prospectos",
    countries: "Países",
    commissionEffective: "Comisión efectiva",
    opportunityEvidenceOnly: "Solo evidencia de oportunidad",
    byCountry: "Por país",
    byCourse: "Por curso",
    country: "País",
    prospectsHeader: "Prospectos",
    commissionEffectiveHeader: "Comisión efectiva",
    attribution: "Atribución",
    bookingInterest: "Interés de reserva",
    confirmedBookings: "Reservas confirmadas",
    course: "Curso",
    countryRegion: "País/Región",
    stage: "Etapa",
    contract: "Contrato",
    commission: "Comisión",
    contacts: "Contactos",
    nextFollowUp: "Próximo seguimiento",
    noSchedule: "Sin programar",
    withheld: "Retenido — {reason}",
    partial: "{value} (parcial — {contributing}/{total} cursos reportando)",
    jhccContract: "Contrato de reporte de JHCC",
    privacyStatus: "Filtro de privacidad: ",
    privacyOk: "aprobado — sin campo prohibido o valor personal",
    privacyBlocked: "bloqueado — {reason}",
    deliveryStatus: "Entrega: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "Pantalla de privacidad: ",
    gateAuthorization: "Autorización: ",
    gateTransmitter: "Transmisor: ",
    statePassed: "Aprobado",
    stateBlocked: "Bloqueado",
    stateYes: "Sí",
    stateNo: "No",
    stateApproved: "Aprobado",
    stateNotApproved: "No aprobado",
    stateMounted: "Montado",
    stateNotMounted: "No montado",
    deliveryNotice: "La entrega exige las 3 condiciones. Una autorización aprobada por sí sola nunca es suficiente.",
    downloadTxt: "Descargar TXT",
    downloadCsv: "Descargar CSV",
    copyJson: "Copiar JSON",
    copied: "Copiado",
    copyBlocked: "Portapapeles no disponible",
    transmitUnavailable: "No se puede transmitir a JHCC",
  },
  fr: {
    ...EN,
    header: "ADMIN · ANALYSE D'ACQUISITION",
    title: "Rapport d'acquisition de cours",
    description:
      "Analyse d'acquisition par pays et par cours préparée pour un futur contrat de reporting Golfriend-to-JHCC approuvé.",
    previewTitle: "Données de prévisualisation locale",
    periodStart: "Début de période",
    periodEnd: "Fin de période",
    generate: "Générer le rapport d'acquisition",
    fail: "Impossible d'accéder à la source d'analyse d'acquisition. Réessayez après avoir configuré une source approuvée.",
    loading: "Chargement de l'analyse d'acquisition…",
    reload: "Réessayer",
    reportStatusNo: "Aucun rapport généré pour le moment.",
    reportStatusSuffix: "Générez-le pour revoir cette vue.",
    reportStatusPrefix: "Livrable",
    statusGenerated: "généré",
    previewSub:
      "Golfriend Admin gère Golfriend. JHCC ne reçoit que des rapports de surveillance et n'est jamais le moteur de réservation ou le processeur de paiement.",
    prospects: "Prospects",
    countries: "Pays",
    commissionEffective: "Commission effective",
    opportunityEvidenceOnly: "Evidence d'opportunité uniquement",
    byCountry: "Par pays",
    byCourse: "Par cours",
    country: "Pays",
    prospectsHeader: "Prospects",
    commissionEffectiveHeader: "Commission effective",
    attribution: "Attribution",
    bookingInterest: "Intérêt de réservation",
    confirmedBookings: "Réservations confirmées",
    course: "Cours",
    countryRegion: "Pays / Région",
    stage: "Étape",
    contract: "Contrat",
    commission: "Commission",
    contacts: "Contacts",
    nextFollowUp: "Prochain suivi",
    noSchedule: "Non programmé",
    withheld: "Masqué — {reason}",
    partial: "{value} (partiel — {contributing}/{total} cours rapportés)",
    jhccContract: "Contrat de reporting JHCC",
    privacyStatus: "Contrôle de confidentialité: ",
    privacyOk: "validé — aucun champ interdit ou valeur personnelle",
    privacyBlocked: "bloqué — {reason}",
    deliveryStatus: "Transmission: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "Écran de confidentialité: ",
    gateAuthorization: "Autorisation: ",
    gateTransmitter: "Émetteur: ",
    statePassed: "Validé",
    stateBlocked: "Bloqué",
    stateYes: "Oui",
    stateNo: "Non",
    stateApproved: "Approuvé",
    stateNotApproved: "Non approuvé",
    stateMounted: "Monté",
    stateNotMounted: "Non monté",
    deliveryNotice: "La livraison exige les 3 conditions. Une autorisation approuvée seule ne suffit jamais.",
    downloadTxt: "Télécharger TXT",
    downloadCsv: "Télécharger CSV",
    copyJson: "Copier JSON",
    copied: "Copié",
    copyBlocked: "Presse-papiers indisponible",
    transmitUnavailable: "Transmission vers JHCC indisponible",
  },
  de: {
    ...EN,
    header: "ADMIN · ERFASSUNGSANALYSE",
    title: "Kursakquisitionsbericht",
    description:
      "Länder- und kursbezogene Akquisitionsanalyse für einen zukünftigen freigegebenen Golfriend-to-JHCC-Berichtsvertrag.",
    previewTitle: "Lokale Vorschau Daten",
    periodStart: "Zeitraumbeginn",
    periodEnd: "Zeitraumende",
    generate: "Akquisitionsbericht erstellen",
    fail: "Die Quelle für Akquisitionsanalysen ist nicht verfügbar. Wiederholen Sie den Vorgang nach Konfiguration einer freigegebenen Quelle.",
    loading: "Lade Akquise-Analytik…",
    reload: "Wiederholen",
    reportStatusNo: "Noch kein Bericht generiert.",
    reportStatusSuffix: "Erstellen Sie ihn, um diese Ansicht zu prüfen.",
    reportStatusPrefix: "Lieferbar",
    statusGenerated: "erstellt",
    previewSub:
      "Der Golfriend Admin verwaltet Golfriend. JHCC erhält nur Aufsichtsberichte und ist weder Buchungs-Engine noch Zahlungsprozessor.",
    prospects: "Interessenten",
    countries: "Länder",
    commissionEffective: "Kommissionswirksam",
    opportunityEvidenceOnly: "Nur Chancenbelege",
    byCountry: "Nach Land",
    byCourse: "Nach Kurs",
    country: "Land",
    prospectsHeader: "Interessenten",
    commissionEffectiveHeader: "Kommissionswirksam",
    attribution: "Zuordnung",
    bookingInterest: "Buchungsinteresse",
    confirmedBookings: "Bestätigte Buchungen",
    course: "Kurs",
    countryRegion: "Land/Region",
    stage: "Stufe",
    contract: "Vertrag",
    commission: "Provision",
    contacts: "Kontakte",
    nextFollowUp: "Nächster Follow-up",
    noSchedule: "Nicht geplant",
    withheld: "Zurückgehalten — {reason}",
    partial: "{value} (teilweise — {contributing}/{total} Kurse gemeldet)",
    jhccContract: "JHCC-Reportvertrag",
    privacyStatus: "Datenschutzprüfung: ",
    privacyOk: "bestanden — keine verbotenen Felder oder personenbezogenen Werte gefunden",
    privacyBlocked: "blockiert — {reason}",
    deliveryStatus: "Auslieferung: ",
    deliveryStatusFallback: "{status} · {reason}",
    gatePrivacy: "Datenschutzbildschirm: ",
    gateAuthorization: "Autorisierung: ",
    gateTransmitter: "Transmitter: ",
    statePassed: "Bestanden",
    stateBlocked: "Blockiert",
    stateYes: "Ja",
    stateNo: "Nein",
    stateApproved: "Genehmigt",
    stateNotApproved: "Nicht genehmigt",
    stateMounted: "Gemountet",
    stateNotMounted: "Nicht gemountet",
    deliveryNotice: "Auslieferung erfordert drei Bedingungen. Eine genehmigte Autorisierung allein reicht nicht aus.",
    downloadTxt: "TXT herunterladen",
    downloadCsv: "CSV herunterladen",
    copyJson: "JSON kopieren",
    copied: "Kopiert",
    copyBlocked: "Zwischenablage nicht verfügbar",
    transmitUnavailable: "Übertragung an JHCC nicht verfügbar",
  },
};

const STAGE_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    identified: "Identified",
    researching: "Researching",
    contacted: "Contacted",
    responded: "Responded",
    meeting_held: "Meeting held",
    pilot_discussion: "Pilot discussion",
    agreement_drafting: "Agreement drafting",
    onboarding_handoff: "Onboarding handoff",
    signed: "Signed",
    declined: "Declined",
    dormant: "Dormant",
    source_unavailable: "Source unavailable",
  },
  th: {
    identified: "ระบุแล้ว",
    researching: "วิจัย",
    contacted: "ติดต่อแล้ว",
    responded: "ตอบกลับแล้ว",
    meeting_held: "จัดประชุมแล้ว",
    pilot_discussion: "การหารือการทดสอบ",
    agreement_drafting: "ร่างข้อตกลง",
    onboarding_handoff: "โอนเข้าระบบ",
    signed: "ลงนามแล้ว",
    declined: "ปฏิเสธ",
    dormant: "ไม่เคลื่อนไหว",
    source_unavailable: "ไม่มีแหล่งข้อมูล",
  },
  ko: {
    identified: "식별됨",
    researching: "조사 중",
    contacted: "연락됨",
    responded: "응답함",
    meeting_held: "미팅 완료",
    pilot_discussion: "파일럿 협의",
    agreement_drafting: "계약 초안",
    onboarding_handoff: "온보딩 인계",
    signed: "서명됨",
    declined: "거절됨",
    dormant: "휴면",
    source_unavailable: "데이터 없음",
  },
  ja: {
    identified: "特定",
    researching: "調査中",
    contacted: "連絡済み",
    responded: "返信済み",
    meeting_held: "面談実施",
    pilot_discussion: "パイロット協議",
    agreement_drafting: "契約草案",
    onboarding_handoff: "オンボーディング移管",
    signed: "署名済み",
    declined: "辞退",
    dormant: "休止",
    source_unavailable: "ソースなし",
  },
  zh: {
    identified: "已识别",
    researching: "正在研究",
    contacted: "已联系",
    responded: "已回应",
    meeting_held: "完成会议",
    pilot_discussion: "试点讨论",
    agreement_drafting: "协议起草",
    onboarding_handoff: "入职交接",
    signed: "已签署",
    declined: "已拒绝",
    dormant: "待机",
    source_unavailable: "源不可用",
  },
  es: {
    identified: "Identificado",
    researching: "Investigación",
    contacted: "Contactado",
    responded: "Respondido",
    meeting_held: "Reunión realizada",
    pilot_discussion: "Discusión piloto",
    agreement_drafting: "Borrador de acuerdo",
    onboarding_handoff: "Transición de incorporación",
    signed: "Firmado",
    declined: "Rechazado",
    dormant: "Inactivo",
    source_unavailable: "Fuente no disponible",
  },
  fr: {
    identified: "Identifié",
    researching: "Recherche",
    contacted: "Contacté",
    responded: "Répondu",
    meeting_held: "Réunion tenue",
    pilot_discussion: "Discussion pilote",
    agreement_drafting: "Rédaction de l'accord",
    onboarding_handoff: "Passation d'intégration",
    signed: "Signé",
    declined: "Refusé",
    dormant: "Dormant",
    source_unavailable: "Source indisponible",
  },
  de: {
    identified: "Identifiziert",
    researching: "In Forschung",
    contacted: "Kontaktiert",
    responded: "Beantwortet",
    meeting_held: "Meeting gehalten",
    pilot_discussion: "Pilotdiskussion",
    agreement_drafting: "Vertragsentwurf",
    onboarding_handoff: "Onboarding-Übergabe",
    signed: "Unterzeichnet",
    declined: "Abgelehnt",
    dormant: "Inaktiv",
    source_unavailable: "Quelle nicht verfügbar",
  },
};

const CONTRACT_STATE_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    none: "None",
    pilot_proposed: "Pilot proposed",
    pilot_active: "Pilot active",
    agreement_sent: "Agreement sent",
    signed_pending_effective: "Signed, pending effective date",
    effective: "Effective",
    lapsed: "Lapsed",
    declined: "Declined",
    source_unavailable: "Source unavailable",
  },
  th: {
    none: "ไม่มี",
    pilot_proposed: "เสนอพัฒนาระบบนำร่อง",
    pilot_active: "ดำเนินการนำร่อง",
    agreement_sent: "ส่งข้อตกลงแล้ว",
    signed_pending_effective: "ลงนามแล้ว รอวันที่มีผล",
    effective: "มีผล",
    lapsed: "หมดอายุ",
    declined: "ปฏิเสธ",
    source_unavailable: "ไม่มีแหล่งข้อมูล",
  },
  ko: {
    none: "없음",
    pilot_proposed: "파일럿 제안",
    pilot_active: "파일럿 진행 중",
    agreement_sent: "계약 전송",
    signed_pending_effective: "서명됨(효력 대기)",
    effective: "유효",
    lapsed: "만료",
    declined: "거절",
    source_unavailable: "데이터 없음",
  },
  ja: {
    none: "なし",
    pilot_proposed: "試験提案",
    pilot_active: "試験中",
    agreement_sent: "契約送付",
    signed_pending_effective: "署名済み、効力待ち",
    effective: "有効",
    lapsed: "失効",
    declined: "辞退",
    source_unavailable: "ソースなし",
  },
  zh: {
    none: "无",
    pilot_proposed: "提出试点",
    pilot_active: "试点进行中",
    agreement_sent: "协议已发送",
    signed_pending_effective: "已签署，待生效",
    effective: "有效",
    lapsed: "已失效",
    declined: "已拒绝",
    source_unavailable: "来源不可用",
  },
  es: {
    none: "Ninguno",
    pilot_proposed: "Piloto propuesto",
    pilot_active: "Piloto activo",
    agreement_sent: "Acuerdo enviado",
    signed_pending_effective: "Firmado, pendiente de vigencia",
    effective: "Vigente",
    lapsed: "Vencido",
    declined: "Rechazado",
    source_unavailable: "Fuente no disponible",
  },
  fr: {
    none: "Aucun",
    pilot_proposed: "Pilote proposé",
    pilot_active: "Pilote actif",
    agreement_sent: "Accord envoyé",
    signed_pending_effective: "Signé, attente d'efficacité",
    effective: "Effectif",
    lapsed: "Échu",
    declined: "Refusé",
    source_unavailable: "Source indisponible",
  },
  de: {
    none: "Keine",
    pilot_proposed: "Pilot vorgeschlagen",
    pilot_active: "Pilot aktiv",
    agreement_sent: "Vereinbarung gesendet",
    signed_pending_effective: "Unterzeichnet, wirksam abwartend",
    effective: "Wirksam",
    lapsed: "Abgelaufen",
    declined: "Abgelehnt",
    source_unavailable: "Quelle nicht verfügbar",
  },
};

const ATTRIBUTION_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    authoritative: "Authoritative",
    unverified: "Unverified",
    unavailable: "Unavailable",
  },
  th: {
    authoritative: "เชื่อถือได้",
    unverified: "ยังไม่ยืนยัน",
    unavailable: "ไม่มีข้อมูล",
  },
  ko: {
    authoritative: "권위 있는",
    unverified: "미확인",
    unavailable: "사용 불가",
  },
  ja: {
    authoritative: "権威付き",
    unverified: "未検証",
    unavailable: "利用不可",
  },
  zh: {
    authoritative: "权威",
    unverified: "未验证",
    unavailable: "不可用",
  },
  es: {
    authoritative: "Autorizado",
    unverified: "Sin verificar",
    unavailable: "No disponible",
  },
  fr: {
    authoritative: "Autorisé",
    unverified: "Non vérifié",
    unavailable: "Indisponible",
  },
  de: {
    authoritative: "Autorisativ",
    unverified: "Unbestätigt",
    unavailable: "Nicht verfügbar",
  },
};

const METRIC_REASON_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    disclosed: "disclosed",
    not_authoritatively_attributed: "Not attributed with authority",
    source_unavailable: "Source unavailable",
    not_recorded: "Not recorded",
    suppressed_low_volume: "Suppressed for low volume",
  },
  th: {
    disclosed: "เปิดเผยแล้ว",
    not_authoritatively_attributed: "ไม่อ้างอิงด้วยอำนาจ",
    source_unavailable: "ไม่มีแหล่งข้อมูล",
    not_recorded: "ยังไม่บันทึก",
    suppressed_low_volume: "ซ่อนเนื่องจากข้อมูลน้อย",
  },
  ko: {
    disclosed: "공개됨",
    not_authoritatively_attributed: "권한 기여 부재",
    source_unavailable: "소스 없음",
    not_recorded: "기록 없음",
    suppressed_low_volume: "낮은 볼륨으로 숨김",
  },
  ja: {
    disclosed: "開示済み",
    not_authoritatively_attributed: "権威付与なし",
    source_unavailable: "ソースなし",
    not_recorded: "未記録",
    suppressed_low_volume: "低ボリュームで非表示",
  },
  zh: {
    disclosed: "已披露",
    not_authoritatively_attributed: "非权威归因",
    source_unavailable: "来源不可用",
    not_recorded: "未记录",
    suppressed_low_volume: "因低体量隐藏",
  },
  es: {
    disclosed: "Divulgado",
    not_authoritatively_attributed: "No atribuido con autoridad",
    source_unavailable: "Fuente no disponible",
    not_recorded: "No registrado",
    suppressed_low_volume: "Ocultado por volumen bajo",
  },
  fr: {
    disclosed: "Divulgué",
    not_authoritatively_attributed: "Pas attribué avec autorité",
    source_unavailable: "Source indisponible",
    not_recorded: "Non enregistré",
    suppressed_low_volume: "Supprimé pour faible volume",
  },
  de: {
    disclosed: "Offengelegt",
    not_authoritatively_attributed: "Nicht autoritativ zugeordnet",
    source_unavailable: "Quelle nicht verfügbar",
    not_recorded: "Nicht erfasst",
    suppressed_low_volume: "Wegen geringer Menge ausgeblendet",
  },
};

const DELIVERY_STATUS_LABELS: Record<AdminLocale, LocaleMap> = {
  en: { available: "Available", unavailable: "Unavailable", authorized: "Authorized" },
  th: { available: "พร้อมใช้งาน", unavailable: "ไม่พร้อมใช้งาน", authorized: "ได้รับอนุมัติ" },
  ko: { available: "사용 가능", unavailable: "사용 불가", authorized: "승인됨" },
  ja: { available: "利用可能", unavailable: "利用不可", authorized: "承認済み" },
  zh: { available: "可用", unavailable: "不可用", authorized: "已批准" },
  es: { available: "Disponible", unavailable: "No disponible", authorized: "Autorizado" },
  fr: { available: "Disponible", unavailable: "Indisponible", authorized: "Autorisé" },
  de: { available: "Verfügbar", unavailable: "Nicht verfügbar", authorized: "Autorisieren" },
};

const DELIVERY_REASON_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    no_authorization_record: "No authorization record",
    authorization_not_approved: "Authorization not approved",
    no_contract_reference: "No contract reference",
    invalid_evaluation_date: "Invalid evaluation date",
    no_effective_date: "No effective date",
    not_yet_effective: "Authorization not yet effective",
    authorization_lapsed: "Authorization lapsed",
    approved_and_effective: "Approved effective contract",
  },
  th: {
    no_authorization_record: "ไม่มีบันทึกสิทธิ์",
    authorization_not_approved: "สิทธิ์ยังไม่อนุมัติ",
    no_contract_reference: "ไม่มีอ้างอิงสัญญา",
    invalid_evaluation_date: "วันที่ประเมินไม่ถูกต้อง",
    no_effective_date: "ไม่มีวันที่มีผล",
    not_yet_effective: "สิทธิ์ยังไม่ถึงผลใช้ได้",
    authorization_lapsed: "สิทธิ์หมดอายุ",
    approved_and_effective: "สัญญาได้รับการอนุมัติและมีผล",
  },
  ko: {
    no_authorization_record: "권한 기록 없음",
    authorization_not_approved: "승인되지 않음",
    no_contract_reference: "계약 참조 없음",
    invalid_evaluation_date: "유효성 검사일 오류",
    no_effective_date: "유효일 미기록",
    not_yet_effective: "아직 유효하지 않음",
    authorization_lapsed: "권한 만료됨",
    approved_and_effective: "승인된 유효 계약",
  },
  ja: {
    no_authorization_record: "認証記録なし",
    authorization_not_approved: "承認されていない",
    no_contract_reference: "契約参照なし",
    invalid_evaluation_date: "評価日無効",
    no_effective_date: "有効日なし",
    not_yet_effective: "未だ有効でない",
    authorization_lapsed: "認証失効",
    approved_and_effective: "承認済みの有効契約",
  },
  zh: {
    no_authorization_record: "无授权记录",
    authorization_not_approved: "未获授权",
    no_contract_reference: "无合同参考",
    invalid_evaluation_date: "评估日期无效",
    no_effective_date: "无生效日",
    not_yet_effective: "尚未生效",
    authorization_lapsed: "授权过期",
    approved_and_effective: "批准且生效的合同",
  },
  es: {
    no_authorization_record: "Sin registro de autorización",
    authorization_not_approved: "Autorización no aprobada",
    no_contract_reference: "Sin referencia contractual",
    invalid_evaluation_date: "Fecha de evaluación no válida",
    no_effective_date: "Sin fecha efectiva",
    not_yet_effective: "Aún no efectivo",
    authorization_lapsed: "Autorización vencida",
    approved_and_effective: "Contrato aprobado y efectivo",
  },
  fr: {
    no_authorization_record: "Aucun enregistrement d'autorisation",
    authorization_not_approved: "Autorisation non approuvée",
    no_contract_reference: "Aucune référence contractuelle",
    invalid_evaluation_date: "Date d'évaluation invalide",
    no_effective_date: "Aucune date d'effet",
    not_yet_effective: "Pas encore effectif",
    authorization_lapsed: "Autorisation expirée",
    approved_and_effective: "Contrat approuvé et effectif",
  },
  de: {
    no_authorization_record: "Kein Autorisierungsdatensatz",
    authorization_not_approved: "Autorisation nicht genehmigt",
    no_contract_reference: "Keine Vertragsreferenz",
    invalid_evaluation_date: "Ungültiges Bewertungsdatum",
    no_effective_date: "Kein Gültigkeitsdatum",
    not_yet_effective: "Noch nicht wirksam",
    authorization_lapsed: "Autorisierung abgelaufen",
    approved_and_effective: "Genehmigter wirksamer Vertrag",
  },
};

const COMMISSION_REASON_LABELS: Record<AdminLocale, LocaleMap> = {
  en: {
    contract_state_not_commission_bearing: "Contract not commission-bearing",
    no_signed_agreement: "No signed agreement",
    no_effective_date: "No effective date",
    not_yet_effective: "Not yet effective",
    agreement_lapsed: "Agreement lapsed",
    activation_not_verified: "Activation not verified",
    pilot_window_closed: "Pilot window closed",
    no_agreed_rate: "No agreed commission rate",
    signed_effective_and_activated: "Signed, effective, activated",
  },
  th: {
    contract_state_not_commission_bearing: "สัญญาไม่สร้างคอมมิชชั่น",
    no_signed_agreement: "ไม่มีข้อตกลงที่ลงนาม",
    no_effective_date: "ไม่มีวันที่มีผล",
    not_yet_effective: "ยังไม่ถึงผลใช้",
    agreement_lapsed: "ข้อตกลงหมดอายุ",
    activation_not_verified: "ยังไม่ยืนยันการเปิดใช้งาน",
    pilot_window_closed: "หน้าต่างนำร่องปิด",
    no_agreed_rate: "ไม่มีอัตราคอมมิชชั่นที่ตกลง",
    signed_effective_and_activated: "ลงนามแล้ว มีผล และเปิดใช้งาน",
  },
  ko: {
    contract_state_not_commission_bearing: "커미션이 아닌 계약",
    no_signed_agreement: "서명된 계약 없음",
    no_effective_date: "유효 시작일 없음",
    not_yet_effective: "아직 유효하지 않음",
    agreement_lapsed: "계약 만료",
    activation_not_verified: "활성화 미확인",
    pilot_window_closed: "파일럿 종료",
    no_agreed_rate: "합의된 커미션율 없음",
    signed_effective_and_activated: "서명·유효·활성화",
  },
  ja: {
    contract_state_not_commission_bearing: "コミッション対象外の契約",
    no_signed_agreement: "署名済み契約なし",
    no_effective_date: "有効日なし",
    not_yet_effective: "まだ有効でない",
    agreement_lapsed: "契約失効",
    activation_not_verified: "有効化未検証",
    pilot_window_closed: "パイロット終了",
    no_agreed_rate: "合意レートなし",
    signed_effective_and_activated: "署名済み、有効、アクティブ",
  },
  zh: {
    contract_state_not_commission_bearing: "合同不含佣金",
    no_signed_agreement: "未签署协议",
    no_effective_date: "无生效日期",
    not_yet_effective: "尚未生效",
    agreement_lapsed: "协议过期",
    activation_not_verified: "激活未验证",
    pilot_window_closed: "试点窗口已关闭",
    no_agreed_rate: "无约定佣金率",
    signed_effective_and_activated: "已签署、已生效、已激活",
  },
  es: {
    contract_state_not_commission_bearing: "Contrato sin comisión",
    no_signed_agreement: "Sin acuerdo firmado",
    no_effective_date: "Sin fecha efectiva",
    not_yet_effective: "Aún no efectivo",
    agreement_lapsed: "Acuerdo vencido",
    activation_not_verified: "Activación no verificada",
    pilot_window_closed: "Ventana piloto cerrada",
    no_agreed_rate: "Sin tasa acordada",
    signed_effective_and_activated: "Firmado, efectivo y activado",
  },
  fr: {
    contract_state_not_commission_bearing: "Contrat sans commission",
    no_signed_agreement: "Aucun accord signé",
    no_effective_date: "Aucune date d'effet",
    not_yet_effective: "Pas encore en vigueur",
    agreement_lapsed: "Accord expiré",
    activation_not_verified: "Activation non vérifiée",
    pilot_window_closed: "Fenêtre pilote close",
    no_agreed_rate: "Taux de commission non convenu",
    signed_effective_and_activated: "Signé, effectif, activé",
  },
  de: {
    contract_state_not_commission_bearing: "Vertrag ohne Provision",
    no_signed_agreement: "Kein unterzeichneter Vertrag",
    no_effective_date: "Kein Wirksamkeitsdatum",
    not_yet_effective: "Noch nicht wirksam",
    agreement_lapsed: "Vereinbarung abgelaufen",
    activation_not_verified: "Aktivierung nicht verifiziert",
    pilot_window_closed: "Pilotfenster geschlossen",
    no_agreed_rate: "Keine vereinbarte Provisionsrate",
    signed_effective_and_activated: "Signiert, wirksam, aktiviert",
  },
};

const shown = (
  copy: typeof EN,
  locale: AdminLocale,
  d: {
  disclosed: boolean;
  value: number | null;
  reason: string;
  partialCoverage: boolean;
  coverage: { contributing: number; total: number };
}) =>
  !d.disclosed
    ? copy.withheld.replace(
        "{reason}",
        localize(METRIC_REASON_LABELS, locale, d.reason),
      )
    : d.partialCoverage
      ? copy.partial
        .replace("{value}", String(d.value))
        .replace("{contributing}", String(d.coverage.contributing))
        .replace("{total}", String(d.coverage.total))
      : String(d.value);

const localize = (dicts: Record<AdminLocale, LocaleMap>, locale: AdminLocale, key: string) =>
  dicts[locale]?.[key] ?? dicts.en?.[key] ?? key;

// The LOCAL calendar day — see V2CourseAcquisition: the UTC day would keep a lapsed
// authorization reporting as effective for the offset window each morning.
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function V2AcquisitionReport({
  provider = localPreviewAcquisitionProvider,
  evaluationDate = today(),
  // No approved Golfriend-to-JHCC acquisition reporting contract exists, so no
  // authorization record is injected and delivery stays fail-closed.
  authorization = null,
  transmitter = null,
}: {
  provider?: AcquisitionProvider;
  evaluationDate?: string;
  authorization?: Record<string, unknown> | null;
  transmitter?: null;
}) {
  const [snap, setSnap] = useState<AcquisitionSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [periodStart, setPeriodStart] = useState("2026-07-01"),
    [periodEnd, setPeriodEnd] = useState(evaluationDate),
    [report, setReport] = useState<AcquisitionReport | null>(null),
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false);

  const locale = useAdminLocale();
  const copy = ACQUISITION_COPY[locale];

  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);

  const prospects = useMemo(() => snap?.prospects || [], [snap]);

  if (failed)
    return (
      <div className="acqr-state" role="alert">
        {copy.fail}
        <button type="button" onClick={() => window.location.reload()}>
          {copy.reload}
        </button>
      </div>
    );
  if (!snap)
    return (
      <div className="acqr-state" role="status">
        {copy.loading}
      </div>
    );

  const generate = () => {
    setCopied(false);
    setCopyFailed(false);
    setReport(
      buildAcquisitionReport({
        prospects,
        period: { start: periodStart, end: periodEnd },
        generatedAt: new Date().toISOString(),
        evaluationDate,
        authorization,
      }),
    );
  };

  const download = (text: string, extension: string) => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `golfriend-course-acquisition.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const copyOut = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(acquisitionReportToJson(report));
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="acqr">
      <header>
        <div>
          <span>{copy.header}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <aside>
          <b>{copy.previewTitle}</b>
          <small>{copy.previewSub}</small>
        </aside>
      </header>
      <div className="acqr-tools">
        <label htmlFor="acqr-start">{copy.periodStart}</label>
        <input
          id="acqr-start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
        />
        <label htmlFor="acqr-end">{copy.periodEnd}</label>
        <input
          id="acqr-end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
        <button onClick={generate}>{copy.generate}</button>
      </div>
      <p className="acqr-live" role="status" aria-live="polite">
        {report
          ? `${copy.reportStatusPrefix}: ${copy[report.delivery.deliverable ? "stateYes" : "stateNo"]} · ${copy.statusScreen} ${copy[report.validation.valid ? "statePassed" : "stateBlocked"]} · ${copy.statusAuthorization} ${report.delivery.authorized ? copy.stateApproved : copy.stateNotApproved} · ${copy.statusTransmitter} ${report.delivery.transmitterMounted ? copy.stateMounted : copy.stateNotMounted} · ${copy.statusGenerated} ${report.generatedAt}`
          : `${copy.reportStatusNo} ${copy.reportStatusSuffix}`}
      </p>
      {!report ? (
        <div className="acqr-state">{copy.reportStatusNo}</div>
      ) : (
        <>
          <section className="acqr-metrics">
            <article>
              <span>{copy.prospects}</span>
              <b>{report.analytics.totals.prospects}</b>
            </article>
            <article>
              <span>{copy.countries}</span>
              <b>{report.analytics.totals.countries}</b>
            </article>
            <article>
              <span>{copy.commissionEffective}</span>
              <b>{report.analytics.totals.commissionEffective}</b>
            </article>
            <article>
              <span>{copy.opportunityEvidenceOnly}</span>
              <b>{report.analytics.totals.opportunityEvidenceOnly}</b>
            </article>
          </section>
          <h3>{copy.byCountry}</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>{copy.country}</th>
                  <th>{copy.prospectsHeader}</th>
                  <th>{copy.commissionEffectiveHeader}</th>
                  <th>{copy.attribution}</th>
                  <th>{copy.bookingInterest}</th>
                  <th>{copy.confirmedBookings}</th>
                </tr>
              </thead>
              <tbody>
                {report.analytics.countries.map((c) => (
                  <tr key={c.country}>
                    <td>
                      <b>{c.country}</b>
                    </td>
                    <td>{c.prospects}</td>
                    <td>{c.signed}</td>
                    <td>{localize(ATTRIBUTION_LABELS, locale, c.demand.attribution)}</td>
                    <td>{shown(copy, locale, c.demand.bookingInterest)}</td>
                    <td>{shown(copy, locale, c.demand.confirmedBookings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{copy.byCourse}</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>{copy.course}</th>
                  <th>{copy.countryRegion}</th>
                  <th>{copy.stage}</th>
                  <th>{copy.contract}</th>
                  <th>{copy.commission}</th>
                  <th>{copy.contacts}</th>
                  <th>{copy.nextFollowUp}</th>
                </tr>
              </thead>
              <tbody>
                {report.analytics.courses.map((c) => (
                  <tr key={c.prospectId}>
                    <td>
                      <b>{c.courseName}</b>
                    </td>
                    <td>
                      {c.country} · {c.region}
                    </td>
                    <td>{localize(STAGE_LABELS, locale, c.stage)}</td>
                    <td>{localize(CONTRACT_STATE_LABELS, locale, c.contractState)}</td>
                    <td>{localize(COMMISSION_REASON_LABELS, locale, c.commissionReason)}</td>
                    <td>{c.contactCount}</td>
                    <td>{c.nextFollowUpAt || copy.noSchedule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="acqr-jhcc">
            <b>
              {copy.jhccContract} · {JHCC_TRANSMISSION_SCHEMA}
            </b>
            <p>
              {copy.privacyStatus}
                {report.validation.valid
                  ? copy.privacyOk
                  : copy.privacyBlocked.replace(
                      "{reason}",
                      report.validation.prohibitedKeys.join(", ") ||
                      `${report.validation.prohibitedValueCount} ${localize(METRIC_REASON_LABELS, locale, "not_recorded")}`,
                  )}
            </p>
            <p>
              {copy.deliveryStatus}
              {copy.deliveryStatusFallback
                .replace("{status}", localize(DELIVERY_STATUS_LABELS, locale, report.delivery.status))
                .replace(
                  "{reason}",
                  localize(DELIVERY_REASON_LABELS, locale, report.delivery.reason),
                )}
            </p>
            <ul className="acqr-gate">
              <li>
                {copy.gatePrivacy}
                {report.validation.valid
                  ? copy.statePassed
                  : copy.stateBlocked}
              </li>
              <li>
                {copy.gateAuthorization}
                {report.delivery.authorized ? copy.stateApproved : copy.stateNotApproved}
              </li>
              <li>
                {copy.gateTransmitter}
                {report.delivery.transmitterMounted
                  ? copy.stateMounted
                  : copy.stateNotMounted}
              </li>
            </ul>
            <p>{copy.deliveryNotice}</p>
            <p>{report.delivery.notice}</p>
            <ul>
              {report.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            <div className="acqr-actions">
              <button
                disabled={!report.validation.valid}
                onClick={() => download(acquisitionReportToText(report), "txt")}
              >
                {copy.downloadTxt}
              </button>
              <button
                disabled={!report.validation.valid}
                onClick={() => download(acquisitionReportToCsv(report), "csv")}
              >
                {copy.downloadCsv}
              </button>
              <button disabled={!report.validation.valid} onClick={() => void copyOut()}>
                {copyFailed
                  ? copy.copyBlocked
                  : copied
                    ? copy.copied
                    : copy.copyJson}
              </button>
              <button disabled={!transmitter}>
                {copy.transmitUnavailable}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
