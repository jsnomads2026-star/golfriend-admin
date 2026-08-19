/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */
import { useEffect, useMemo, useState } from "react";
import {
  decisionPreview,
  filterPartnerRequests,
  onboardingChecklist,
  PARTNER_LOCALES,
  PARTNER_STATUSES,
  PARTNER_TYPES,
  partnerSummary,
  type PartnerRequest,
} from "./partnerOperationsModel.mjs";
import {
  localPreviewPartnerProvider,
  type PartnerOperationsProvider,
  type PartnerOperationsSnapshot,
} from "./partnerOperationsProvider";
import "./V2PartnerOperations.css";
import { useDialogFocus } from "./useDialogFocus";
const COPY = {
  en: {
    badge: "ADMIN · READ-ONLY REVIEW",
    title: "Partner requests and onboarding",
    lead: "Review intake evidence without creating accounts, sending messages, or changing authority.",
    sourceTitle: "Local preview data",
    sourceHelp: "No approved request backend or decision service is configured.",
    total: "Total requests",
    failed: "Partner request source unavailable. Retry after an approved source is configured.",
    loading: "Loading partner requests…",
    labels: {
      search: "Search partner requests",
      searchPlaceholder: "Search organization, location or contact",
      typeFilter: "Partner type filter",
      allTypes: "All types",
      statusFilter: "Status filter",
      allStatuses: "All statuses",
      localeFilter: "Locale filter",
      allLocales: "All locales",
      sortFilter: "Sort requests",
      sortNewest: "Newest",
      sortOrganization: "Organization",
      empty: "No requests match this view.",
      organization: "Organization",
      type: "Type",
      country: "Country / region",
      contact: "Contact",
      locale: "Locale",
      submitted: "Submitted",
      status: "Status",
      owner: "Owner",
      source: "Source",
      recentActivity: "RECENT ACTIVITY",
      partnerDetail: "Partner request detail",
      contactLabel: "Contact",
      locationLabel: "Location",
      courseIdentifiers: "Course identifiers",
      links: "Trusted links/files",
      provenance: "Provenance",
      statusHistory: "Status history",
      checklist: "Onboarding checklist · evidence only",
      decision: "Decision",
      summaryLocale: "Summary locale",
      noneVerified: "None verified",
      unknown: "Unknown",
      unavailable: "Unavailable",
      unverified: "Unverified",
      localeUnverified: "Locale unverified",
      unassigned: "Unassigned / unverified",
      decisionLabelRequestInformation: "Information required",
      decisionLabelApprove: "Approve",
      decisionLabelDecline: "Decline",
      decisionPreview: "Decision preview",
      close: "Close",
      previewDecision: "Preview decision",
      copyExport: "Copy / export summary",
      copied: "Copied",
      submitUnavailable: "Submit decision unavailable",
      copiedNotice: "Copied request metadata to clipboard.",
    },
    status: {
      new: "New",
      under_review: "Under review",
      information_required: "Information required",
      approved: "Approved",
      declined: "Declined",
      withdrawn: "Withdrawn",
      source_unavailable: "Source unavailable",
    },
    types: {
      golf_course: "Golf course",
      golf_service: "Golf service",
      sponsor_advertiser: "Sponsor advertiser",
      community_media: "Community media",
      strategic_partner: "Strategic partner",
      unknown: "Unknown",
    },
    checks: {
      identity: "Identity/contact verification",
      organization: "Organization verification",
      courseReview: "Course/profile-data review",
      bookingBoundary: "Booking/payment-boundary acknowledgement",
      locale: "Preferred communication locale",
      terms: "Terms/privacy acknowledgement",
    },
  },
  th: {
    badge: "ผู้ดูแลระบบ · ตรวจสอบแบบอ่านอย่างเดียว",
    title: "คำขอหุ้นส่วนและการนำเข้า",
    lead: "ตรวจสอบหลักฐานการรับคำขอโดยไม่สร้างบัญชี ไม่ส่งข้อความ และไม่เปลี่ยนความเป็นเจ้าของ",
    sourceTitle: "ข้อมูลตัวอย่างในระบบท้องถิ่น",
    sourceHelp: "ยังไม่ได้กำหนดแหล่งข้อมูลคำขอที่อนุมัติหรือระบบตัดสินใจ",
    total: "คำขอทั้งหมด",
    failed:
      "ไม่สามารถเข้าถึงแหล่งคำขอหุ้นส่วนได้ กรุณาลองใหม่หลังกำหนดแหล่งที่ได้รับอนุมัติแล้ว",
    loading: "กำลังโหลดคำขอหุ้นส่วน…",
    labels: {
      search: "ค้นหาคำขอหุ้นส่วน",
      searchPlaceholder: "ค้นหาชื่อองค์กร, สถานที่ หรือผู้ติดต่อ",
      typeFilter: "กรองตามประเภทหุ้นส่วน",
      allTypes: "ทุกประเภท",
      statusFilter: "กรองตามสถานะ",
      allStatuses: "ทุกสถานะ",
      localeFilter: "กรองตามภาษา",
      allLocales: "ทุกภาษา",
      sortFilter: "เรียงลำดับคำขอ",
      sortNewest: "ล่าสุด",
      sortOrganization: "องค์กร",
      empty: "ไม่มีคำขอที่ตรงกับมุมมองนี้",
      organization: "องค์กร",
      type: "ประเภท",
      country: "ประเทศ / ภูมิภาค",
      contact: "ผู้ติดต่อ",
      locale: "ภาษา",
      submitted: "ส่งแล้ว",
      status: "สถานะ",
      owner: "ผู้ดูแล",
      source: "แหล่งที่มา",
      recentActivity: "กิจกรรมล่าสุด",
      partnerDetail: "รายละเอียดคำขอหุ้นส่วน",
      contactLabel: "ผู้ติดต่อ",
      locationLabel: "สถานที่",
      courseIdentifiers: "รหัสหลักสูตร",
      links: "ลิงก์/ไฟล์ที่เชื่อถือได้",
      provenance: "ที่มา",
      statusHistory: "ประวัติสถานะ",
      checklist: "รายการตรวจสอบการเริ่มต้น · เฉพาะหลักฐาน",
      decision: "การตัดสินใจ",
      summaryLocale: "สรุปภาษา",
      noneVerified: "ยังไม่ยืนยัน",
      unknown: "ไม่ทราบ",
      unavailable: "ไม่พร้อมใช้งาน",
      unverified: "ยังไม่ตรวจสอบ",
      localeUnverified: "ภาษายังไม่ยืนยัน",
      unassigned: "ยังไม่กำหนด / ยังไม่ยืนยัน",
      decisionLabelRequestInformation: "ต้องการข้อมูลเพิ่มเติม",
      decisionLabelApprove: "อนุมัติ",
      decisionLabelDecline: "ปฏิเสธ",
      decisionPreview: "ตัวอย่างการตัดสินใจ",
      close: "ปิด",
      previewDecision: "ดูตัวอย่างการตัดสินใจ",
      copyExport: "คัดลอก / ส่งออกสรุป",
      copied: "คัดลอกแล้ว",
      submitUnavailable: "การส่งการตัดสินใจยังไม่พร้อมใช้งาน",
      copiedNotice: "คัดลอกข้อมูลคำขอไปยังคลิปบอร์ดแล้ว",
    },
    status: {
      new: "ใหม่",
      under_review: "กำลังตรวจสอบ",
      information_required: "ต้องการข้อมูลเพิ่มเติม",
      approved: "อนุมัติ",
      declined: "ปฏิเสธ",
      withdrawn: "ยกเลิก",
      source_unavailable: "แหล่งข้อมูลไม่พร้อมใช้งาน",
    },
    types: {
      golf_course: "สนามกอล์ฟ",
      golf_service: "บริการกอล์ฟ",
      sponsor_advertiser: "ผู้สนับสนุนโฆษณา",
      community_media: "สื่อชุมชน",
      strategic_partner: "พันธมิตรเชิงกลยุทธ์",
      unknown: "ไม่ทราบ",
    },
    checks: {
      identity: "ยืนยันตัวตน/ติดต่อ",
      organization: "ยืนยันองค์กร",
      courseReview: "ตรวจทานข้อมูลโปรไฟล์สนามกอล์ฟ",
      bookingBoundary: "ยืนยันขอบเขตการชำระเงิน/การจอง",
      locale: "ยืนยันภาษาติดต่อที่ต้องการ",
      terms: "ยืนยันเงื่อนไข/ความเป็นส่วนตัว",
    },
  },
  ko: {
    badge: "관리자 · 읽기 전용 검토",
    title: "파트너 요청 및 온보딩",
    lead: "계정 생성, 메시지 전송 또는 권한 변경 없이 접수 증거를 검토합니다.",
    sourceTitle: "로컬 미리보기 데이터",
    sourceHelp: "승인된 요청 백엔드 또는 결정 서비스가 구성되지 않았습니다.",
    total: "총 요청 수",
    failed: "파트너 요청 소스를 사용할 수 없습니다. 승인된 소스 설정 후 다시 시도하세요.",
    loading: "파트너 요청을 로딩 중…",
    labels: {
      search: "파트너 요청 검색",
      searchPlaceholder: "조직, 위치 또는 연락처 검색",
      typeFilter: "유형 필터",
      allTypes: "모든 유형",
      statusFilter: "상태 필터",
      allStatuses: "모든 상태",
      localeFilter: "언어 필터",
      allLocales: "모든 언어",
      sortFilter: "요청 정렬",
      sortNewest: "최신순",
      sortOrganization: "조직",
      empty: "이 뷰에 일치하는 요청이 없습니다.",
      organization: "조직",
      type: "유형",
      country: "국가 / 지역",
      contact: "연락처",
      locale: "언어",
      submitted: "제출일",
      status: "상태",
      owner: "담당자",
      source: "출처",
      recentActivity: "최근 활동",
      partnerDetail: "파트너 요청 상세",
      contactLabel: "연락처",
      locationLabel: "위치",
      courseIdentifiers: "코스 식별자",
      links: "인증된 링크/파일",
      provenance: "출처",
      statusHistory: "상태 이력",
      checklist: "온보딩 체크리스트 · 증빙 전용",
      decision: "결정",
      summaryLocale: "요약 언어",
      noneVerified: "미인증",
      unknown: "알 수 없음",
      unavailable: "사용 불가",
      unverified: "미확인",
      localeUnverified: "언어 미확인",
      unassigned: "미할당 / 미확인",
      decisionLabelRequestInformation: "추가 정보 필요",
      decisionLabelApprove: "승인",
      decisionLabelDecline: "거부",
      decisionPreview: "결정 미리보기",
      close: "닫기",
      previewDecision: "결정 미리보기",
      copyExport: "복사 / 요약 내보내기",
      copied: "복사됨",
      submitUnavailable: "결정 제출 불가",
      copiedNotice: "요청 메타데이터를 클립보드에 복사했습니다.",
    },
    status: {
      new: "신규",
      under_review: "검토 중",
      information_required: "추가 정보 필요",
      approved: "승인됨",
      declined: "거부됨",
      withdrawn: "철회됨",
      source_unavailable: "소스 사용 불가",
    },
    types: {
      golf_course: "골프 코스",
      golf_service: "골프 서비스",
      sponsor_advertiser: "스폰서 광고주",
      community_media: "지역 미디어",
      strategic_partner: "전략 파트너",
      unknown: "알 수 없음",
    },
    checks: {
      identity: "신원/연락처 확인",
      organization: "기관 검증",
      courseReview: "코스/프로필 데이터 검토",
      bookingBoundary: "예약/결제 경계 승인",
      locale: "선호 커뮤니케이션 언어",
      terms: "약관/개인정보 동의",
    },
  },
  ja: {
    badge: "管理者 · 読み取り専用レビュー",
    title: "パートナー申請とオンボーディング",
    lead: "アカウント作成、メッセージ送信、権限変更を行わずに申請情報を確認します。",
    sourceTitle: "ローカル プレビュー データ",
    sourceHelp:
      "承認済みリクエストバックエンドまたは意思決定サービスは構成されていません。",
    total: "合計申請数",
    failed:
      "パートナー申請ソースにアクセスできません。承認済みソースの設定後に再試行してください。",
    loading: "パートナー申請を読み込み中…",
    labels: {
      search: "パートナー申請を検索",
      searchPlaceholder: "組織、地域または連絡先を検索",
      typeFilter: "種類フィルター",
      allTypes: "すべて",
      statusFilter: "ステータスフィルター",
      allStatuses: "すべてのステータス",
      localeFilter: "言語フィルター",
      allLocales: "すべての言語",
      sortFilter: "申請の並び替え",
      sortNewest: "新着順",
      sortOrganization: "組織名",
      empty: "この表示に一致する申請がありません。",
      organization: "組織名",
      type: "種類",
      country: "国 / 地域",
      contact: "担当者",
      locale: "言語",
      submitted: "提出日",
      status: "ステータス",
      owner: "担当者",
      source: "送信元",
      recentActivity: "最近のアクティビティ",
      partnerDetail: "パートナー申請詳細",
      contactLabel: "担当者",
      locationLabel: "場所",
      courseIdentifiers: "コース識別子",
      links: "承認済みリンク/ファイル",
      provenance: "出典",
      statusHistory: "ステータス履歴",
      checklist: "オンボーディングチェックリスト · 証拠のみ",
      decision: "決定",
      summaryLocale: "要約言語",
      noneVerified: "未検証",
      unknown: "不明",
      unavailable: "利用不可",
      unverified: "未確認",
      localeUnverified: "言語未確認",
      unassigned: "未割当 / 未確認",
      decisionLabelRequestInformation: "追加情報要請",
      decisionLabelApprove: "承認",
      decisionLabelDecline: "却下",
      decisionPreview: "決定プレビュー",
      close: "閉じる",
      previewDecision: "決定をプレビュー",
      copyExport: "コピー / エクスポート",
      copied: "コピー済み",
      submitUnavailable: "決定送信は利用不可",
      copiedNotice: "リクエストのメタデータをクリップボードにコピーしました。",
    },
    status: {
      new: "新規",
      under_review: "審査中",
      information_required: "追加情報必須",
      approved: "承認済み",
      declined: "却下",
      withdrawn: "取り下げ",
      source_unavailable: "ソース利用不可",
    },
    types: {
      golf_course: "ゴルフコース",
      golf_service: "ゴルフサービス",
      sponsor_advertiser: "スポンサー広告主",
      community_media: "地域メディア",
      strategic_partner: "戦略的パートナー",
      unknown: "不明",
    },
    checks: {
      identity: "本人確認/連絡先検証",
      organization: "組織確認",
      courseReview: "コース/プロフィールデータレビュー",
      bookingBoundary: "予約・決済の境界承認",
      locale: "希望連絡言語",
      terms: "利用規約/プライバシー確認",
    },
  },
  zh: {
    badge: "管理员 · 只读审核",
    title: "合作伙伴请求与入驻",
    lead: "在不创建账号、不发送消息或更改权限的前提下审核提交材料。",
    sourceTitle: "本地预览数据",
    sourceHelp: "未配置已审批的请求后端或决策服务。",
    total: "请求总数",
    failed: "合作伙伴请求源不可用。请在配置已批准源后重试。",
    loading: "正在加载合作伙伴请求…",
    labels: {
      search: "搜索合作伙伴请求",
      searchPlaceholder: "搜索机构、地区或联系人",
      typeFilter: "类型筛选",
      allTypes: "全部类型",
      statusFilter: "状态筛选",
      allStatuses: "全部状态",
      localeFilter: "语言筛选",
      allLocales: "全部语言",
      sortFilter: "排序请求",
      sortNewest: "最新",
      sortOrganization: "机构名称",
      empty: "当前视图无匹配请求。",
      organization: "机构",
      type: "类型",
      country: "国家 / 地区",
      contact: "联系人",
      locale: "语言",
      submitted: "提交时间",
      status: "状态",
      owner: "负责人",
      source: "来源",
      recentActivity: "最近活动",
      partnerDetail: "合作伙伴请求详情",
      contactLabel: "联系人",
      locationLabel: "位置",
      courseIdentifiers: "课程标识",
      links: "可信链接/文件",
      provenance: "来源",
      statusHistory: "状态历史",
      checklist: "入驻核查清单 · 仅证据",
      decision: "决策",
      summaryLocale: "摘要语言",
      noneVerified: "未验证",
      unknown: "未知",
      unavailable: "不可用",
      unverified: "未核实",
      localeUnverified: "语言未核实",
      unassigned: "未分配 / 未核实",
      decisionLabelRequestInformation: "需要补充信息",
      decisionLabelApprove: "批准",
      decisionLabelDecline: "拒绝",
      decisionPreview: "决策预览",
      close: "关闭",
      previewDecision: "预览决策",
      copyExport: "复制/导出摘要",
      copied: "已复制",
      submitUnavailable: "提交决策不可用",
      copiedNotice: "已将请求元数据复制到剪贴板。",
    },
    status: {
      new: "新增",
      under_review: "审核中",
      information_required: "需补充信息",
      approved: "已批准",
      declined: "已拒绝",
      withdrawn: "已撤回",
      source_unavailable: "来源不可用",
    },
    types: {
      golf_course: "高尔夫球场",
      golf_service: "高尔夫服务",
      sponsor_advertiser: "赞助商广告主",
      community_media: "社区媒体",
      strategic_partner: "战略合作伙伴",
      unknown: "未知",
    },
    checks: {
      identity: "身份/联系方式验证",
      organization: "组织核验",
      courseReview: "课程/资料审核",
      bookingBoundary: "预约/支付边界确认",
      locale: "首选沟通语言",
      terms: "条款/隐私确认",
    },
  },
  es: {
    badge: "ADMINISTRADOR · REVISIÓN SOLO LECTURA",
    title: "Solicitudes de socios y onboarding",
    lead: "Revise la evidencia de ingreso sin crear cuentas, enviar mensajes ni cambiar permisos.",
    sourceTitle: "Datos de vista previa local",
    sourceHelp: "No hay backend aprobado ni servicio de decisiones configurado.",
    total: "Solicitudes totales",
    failed:
      "Fuente de solicitudes de socios no disponible. Reintente tras configurar una fuente aprobada.",
    loading: "Cargando solicitudes de socios…",
    labels: {
      search: "Buscar solicitudes de socios",
      searchPlaceholder: "Buscar organización, ubicación o contacto",
      typeFilter: "Filtro por tipo",
      allTypes: "Todos los tipos",
      statusFilter: "Filtro por estado",
      allStatuses: "Todos los estados",
      localeFilter: "Filtro de idioma",
      allLocales: "Todos los idiomas",
      sortFilter: "Ordenar solicitudes",
      sortNewest: "Más recientes",
      sortOrganization: "Organización",
      empty: "No hay solicitudes que coincidan con esta vista.",
      organization: "Organización",
      type: "Tipo",
      country: "País / región",
      contact: "Contacto",
      locale: "Idioma",
      submitted: "Enviado",
      status: "Estado",
      owner: "Propietario",
      source: "Origen",
      recentActivity: "ACTIVIDAD RECIENTE",
      partnerDetail: "Detalle de solicitud de socio",
      contactLabel: "Contacto",
      locationLabel: "Ubicación",
      courseIdentifiers: "Identificadores del curso",
      links: "Enlaces/archivos verificados",
      provenance: "Procedencia",
      statusHistory: "Historial de estado",
      checklist: "Lista de verificación de onboarding · solo evidencia",
      decision: "Decisión",
      summaryLocale: "Idioma del resumen",
      noneVerified: "No verificado",
      unknown: "Desconocido",
      unavailable: "No disponible",
      unverified: "Sin verificar",
      localeUnverified: "Idioma sin verificar",
      unassigned: "Sin asignar / sin verificar",
      decisionLabelRequestInformation: "Se requiere información",
      decisionLabelApprove: "Aprobar",
      decisionLabelDecline: "Rechazar",
      decisionPreview: "Vista previa de decisión",
      close: "Cerrar",
      previewDecision: "Vista previa de decisión",
      copyExport: "Copiar / exportar resumen",
      copied: "Copiado",
      submitUnavailable: "Envío de decisión no disponible",
      copiedNotice: "Metadatos de solicitud copiados al portapapeles.",
    },
    status: {
      new: "Nuevo",
      under_review: "En revisión",
      information_required: "Se requiere información",
      approved: "Aprobado",
      declined: "Rechazado",
      withdrawn: "Retirado",
      source_unavailable: "Fuente no disponible",
    },
    types: {
      golf_course: "Campo de golf",
      golf_service: "Servicio de golf",
      sponsor_advertiser: "Anunciante patrocinador",
      community_media: "Medios comunitarios",
      strategic_partner: "Socio estratégico",
      unknown: "Desconocido",
    },
    checks: {
      identity: "Verificación de identidad/contacto",
      organization: "Verificación de organización",
      courseReview: "Revisión de curso y perfil",
      bookingBoundary: "Confirmación de límites de reserva/pago",
      locale: "Idioma de comunicación preferido",
      terms: "Confirmación de términos/privacidad",
    },
  },
  fr: {
    badge: "ADMIN · RELECTURE EN LECTURE SEULE",
    title: "Demandes partenaires et onboarding",
    lead: "Vérifiez les preuves d’entrée sans créer de comptes, envoyer de messages ou modifier l’autorité.",
    sourceTitle: "Données de prévisualisation locale",
    sourceHelp:
      "Aucun backend de demandes approuvé ou service de décision n’est configuré.",
    total: "Nombre total de demandes",
    failed:
      "La source de demandes partenaires est indisponible. Réessayez après configuration d’une source approuvée.",
    loading: "Chargement des demandes partenaires…",
    labels: {
      search: "Rechercher des demandes partenaires",
      searchPlaceholder:
        "Rechercher une organisation, un lieu ou un contact",
      typeFilter: "Filtrer par type",
      allTypes: "Tous les types",
      statusFilter: "Filtrer par statut",
      allStatuses: "Tous les statuts",
      localeFilter: "Filtrer par langue",
      allLocales: "Toutes les langues",
      sortFilter: "Trier les demandes",
      sortNewest: "Le plus récent",
      sortOrganization: "Organisation",
      empty: "Aucune demande ne correspond à cette vue.",
      organization: "Organisation",
      type: "Type",
      country: "Pays / région",
      contact: "Contact",
      locale: "Langue",
      submitted: "Date de soumission",
      status: "Statut",
      owner: "Propriétaire",
      source: "Source",
      recentActivity: "ACTIVITÉ RÉCENTE",
      partnerDetail: "Détail de la demande partenaire",
      contactLabel: "Contact",
      locationLabel: "Emplacement",
      courseIdentifiers: "Identifiants de parcours",
      links: "Liens/fichiers vérifiés",
      provenance: "Provenance",
      statusHistory: "Historique du statut",
      checklist: "Checklist onboarding · preuves uniquement",
      decision: "Décision",
      summaryLocale: "Langue du résumé",
      noneVerified: "Non vérifié",
      unknown: "Inconnu",
      unavailable: "Indisponible",
      unverified: "Non vérifié",
      localeUnverified: "Langue non vérifiée",
      unassigned: "Non attribué / non vérifié",
      decisionLabelRequestInformation: "Informations requises",
      decisionLabelApprove: "Approuver",
      decisionLabelDecline: "Refuser",
      decisionPreview: "Aperçu de la décision",
      close: "Fermer",
      previewDecision: "Aperçu de la décision",
      copyExport: "Copier / exporter le résumé",
      copied: "Copié",
      submitUnavailable: "Envoi de décision indisponible",
      copiedNotice:
        "Métadonnées de la demande copiées dans le presse-papiers.",
    },
    status: {
      new: "Nouveau",
      under_review: "En revue",
      information_required: "Informations requises",
      approved: "Approuvé",
      declined: "Refusé",
      withdrawn: "Retiré",
      source_unavailable: "Source indisponible",
    },
    types: {
      golf_course: "Parcours de golf",
      golf_service: "Service de golf",
      sponsor_advertiser: "Annonceur partenaire",
      community_media: "Médias communautaires",
      strategic_partner: "Partenaire stratégique",
      unknown: "Inconnu",
    },
    checks: {
      identity: "Vérification identité/contact",
      organization: "Vérification de l’organisation",
      courseReview: "Vérification cours/profil",
      bookingBoundary: "Reconnaissance de la limite réservation/paiement",
      locale: "Langue de communication préférée",
      terms: "Confirmation des conditions/confidentialité",
    },
  },
  de: {
    badge: "ADMIN · NUR LESEN ÜBERPRÜFUNG",
    title: "Partneranfragen und Onboarding",
    lead: "Prüfen Sie die Eingangsnachweise, ohne Accounts zu erstellen, Nachrichten zu senden oder Berechtigungen zu ändern.",
    sourceTitle: "Lokale Vorschau-Daten",
    sourceHelp:
      "Kein zugelassenes Anfrage-Backend oder Entscheidungsservice konfiguriert.",
    total: "Gesamte Anfragen",
    failed:
      "Partner-Anfragequelle nicht verfügbar. Wiederholen Sie den Versuch nach Konfiguration einer zugelassenen Quelle.",
    loading: "Partneranfragen werden geladen…",
    labels: {
      search: "Partneranfragen suchen",
      searchPlaceholder: "Organisation, Ort oder Kontakt suchen",
      typeFilter: "Typfilter",
      allTypes: "Alle Typen",
      statusFilter: "Statusfilter",
      allStatuses: "Alle Status",
      localeFilter: "Sprachfilter",
      allLocales: "Alle Sprachen",
      sortFilter: "Anfragen sortieren",
      sortNewest: "Neueste",
      sortOrganization: "Organisation",
      empty: "Keine Anfragen entsprechen dieser Ansicht.",
      organization: "Organisation",
      type: "Typ",
      country: "Land / Region",
      contact: "Kontakt",
      locale: "Sprache",
      submitted: "Eingereicht",
      status: "Status",
      owner: "Besitzer",
      source: "Quelle",
      recentActivity: "LETZTE AKTIVITÄT",
      partnerDetail: "Partneranfragedetail",
      contactLabel: "Kontakt",
      locationLabel: "Standort",
      courseIdentifiers: "Kurskennungen",
      links: "Vertrauenswürdige Links/Dateien",
      provenance: "Herkunft",
      statusHistory: "Statusverlauf",
      checklist: "Onboarding-Checkliste · nur Nachweis",
      decision: "Entscheidung",
      summaryLocale: "Zusammenfassungs-Sprache",
      noneVerified: "Nicht verifiziert",
      unknown: "Unbekannt",
      unavailable: "Nicht verfügbar",
      unverified: "Unbestätigt",
      localeUnverified: "Sprache unbestätigt",
      unassigned: "Nicht zugewiesen / unbestätigt",
      decisionLabelRequestInformation: "Informationen erforderlich",
      decisionLabelApprove: "Genehmigen",
      decisionLabelDecline: "Ablehnen",
      decisionPreview: "Entscheidungsvorschau",
      close: "Schließen",
      previewDecision: "Entscheidungsvorschau",
      copyExport: "Kopieren / Zusammenfassung exportieren",
      copied: "Kopiert",
      submitUnavailable: "Entscheidung senden nicht verfügbar",
      copiedNotice: "Metadaten der Anfrage in die Zwischenablage kopiert.",
    },
    status: {
      new: "Neu",
      under_review: "In Prüfung",
      information_required: "Informationen erforderlich",
      approved: "Genehmigt",
      declined: "Abgelehnt",
      withdrawn: "Zurückgezogen",
      source_unavailable: "Quelle nicht verfügbar",
    },
    types: {
      golf_course: "Golfplatz",
      golf_service: "Golf-Dienstleistung",
      sponsor_advertiser: "Sponsorenwerber",
      community_media: "Community-Media",
      strategic_partner: "Strategischer Partner",
      unknown: "Unbekannt",
    },
    checks: {
      identity: "Identitäts-/Kontaktprüfung",
      organization: "Organisationsprüfung",
      courseReview: "Überprüfung von Kurs-/Profildaten",
      bookingBoundary: "Bestätigung der Buchungs-/Zahlungssperre",
      locale: "Bevorzugte Kommunikationssprache",
      terms: "Bedingungen/Datenschutz-Bestätigung",
    },
  },
};

const localeValues = (summaryLocale: keyof typeof COPY) => COPY[summaryLocale] || COPY.en;
export default function V2PartnerOperations({
  provider = localPreviewPartnerProvider,
}: {
  provider?: PartnerOperationsProvider;
}) {
  const [snap, setSnap] = useState<PartnerOperationsSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [locale, setLocale] = useState("all"),
    [sort, setSort] = useState("newest"),
    [selected, setSelected] = useState<PartnerRequest | null>(null),
    [preview, setPreview] = useState<any>(null),
    [decision, setDecision] = useState("request_information"),
    [summaryLocale, setSummaryLocale] = useState("en"),
    [copied, setCopied] = useState(false);
  const t = localeValues(summaryLocale as keyof typeof COPY);
  const statusLabels = useMemo(() => t.status as Record<string, string>, [t]);
  const typeLabels = useMemo(() => t.types as Record<string, string>, [t]);
  const checklistLabels = useMemo(() => t.checks as Record<string, string>, [t]);
  const detailRef = useDialogFocus(Boolean(selected), () => setSelected(null));
  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);
  const rows = useMemo(() => snap?.requests || [], [snap]),
    summary = useMemo(() => partnerSummary(rows), [rows]),
    visible = useMemo(
      () => filterPartnerRequests(rows, { query, type, status, locale, sort }),
      [rows, query, type, status, locale, sort],
    );
  if (failed)
    return (
      <div className="partner-state" role="alert">
        {t.failed}
      </div>
    );
  if (!snap)
    return (
      <div className="partner-state" role="status">
        {t.loading}
      </div>
    );
  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          organization: selected.organization,
          type: selected.type,
          status: selected.status,
          locale: summaryLocale,
          checklist: onboardingChecklist(selected),
        },
        null,
        2,
      ),
    );
    setCopied(true);
  };
  return (
    <div className="partner-ops">
      <header>
        <div>
          <span>{t.badge}</span>
          <h2>{t.title}</h2>
          <p>{t.lead}</p>
        </div>
        <aside>
          <b>{t.sourceTitle}</b>
          <small>{t.sourceHelp}</small>
        </aside>
      </header>
      <section className="partner-metrics">
        <article>
          <span>{t.total}</span>
          <b>{summary.total}</b>
        </article>
        {PARTNER_STATUSES.map((s) => (
          <article key={s}>
            <span>{statusLabels[s] || s}</span>
            <b>{summary.byStatus[s]}</b>
          </article>
        ))}
      </section>
      <section className="partner-grid">
        <main>
          <div className="partner-tools">
            <input
              aria-label={t.labels.search}
              placeholder={t.labels.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
               aria-label={t.labels.typeFilter}
               value={type}
               onChange={(e) => setType(e.target.value)}
            >
              <option value="all">{t.labels.allTypes}</option>
              {PARTNER_TYPES.map((x) => (
                <option key={x} value={x}>
                  {typeLabels[x] || x}
                </option>
              ))}
            </select>
            <select
              aria-label={t.labels.statusFilter}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">{t.labels.allStatuses}</option>
              {PARTNER_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {statusLabels[x] || x}
                </option>
              ))}
            </select>
            <select
              aria-label={t.labels.localeFilter}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="all">{t.labels.allLocales}</option>
              {PARTNER_LOCALES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label={t.labels.sortFilter}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">{t.labels.sortNewest}</option>
              <option value="organization">{t.labels.sortOrganization}</option>
            </select>
          </div>
          {visible.length === 0 ? (
            <div className="partner-state">{t.labels.empty}</div>
          ) : (
            <div className="partner-table">
              <table>
                <thead>
                  <tr>
                    <th>{t.labels.organization}</th>
                    <th>{t.labels.type}</th>
                    <th>{t.labels.country}</th>
                    <th>{t.labels.contact}</th>
                    <th>{t.labels.locale}</th>
                    <th>{t.labels.submitted}</th>
                    <th>{t.labels.status}</th>
                    <th>{t.labels.owner}</th>
                    <th>{t.labels.source}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => {
                        setSelected(r);
                        setPreview(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelected(r);
                          setPreview(null);
                        }
                      }}
                    >
                      <td>
                        <b>{r.organization}</b>
                      </td>
                      <td>{typeLabels[r.type] || r.type}</td>
                      <td>
                        {r.country} · {r.region}
                      </td>
                      <td>{r.contactName}</td>
                      <td>{r.contactLocale || t.labels.unverified}</td>
                      <td>{r.submittedAt || t.labels.unknown}</td>
                      <td>{statusLabels[r.status] || r.status}</td>
                      <td>{r.owner || t.labels.unassigned}</td>
                      <td>{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
        <aside className="partner-recent">
          <span>{t.labels.recentActivity}</span>
          {summary.recent.map((r: any) => (
            <button key={r.id} onClick={() => setSelected(r)}>
              <b>{r.organization}</b>
              <small>
                {r.submittedAt} · {statusLabels[r.status] || r.status}
              </small>
            </button>
          ))}
        </aside>
      </section>
      {selected && (
        <div
          ref={detailRef}
          className="partner-detail"
          role="dialog"
          aria-modal="true"
          aria-label={t.labels.partnerDetail}
        >
          <button onClick={() => setSelected(null)}>{t.labels.close}</button>
          <span>{typeLabels[selected.type] || selected.type}</span>
          <h3>{selected.organization}</h3>
          <p>{selected.collaboration}</p>
          <dl>
            <div>
              <dt>{t.labels.contactLabel}</dt>
              <dd>
                {selected.contactName} ·{" "}
                {selected.contactLocale || t.labels.localeUnverified}
              </dd>
            </div>
            <div>
              <dt>{t.labels.locationLabel}</dt>
              <dd>
                {selected.country} · {selected.region}
              </dd>
            </div>
            <div>
              <dt>{t.labels.courseIdentifiers}</dt>
              <dd>
                {selected.courseIds.length
                  ? selected.courseIds.join(", ")
                  : t.labels.noneVerified}
              </dd>
            </div>
            <div>
              <dt>{t.labels.links}</dt>
              <dd>
                {selected.links.length
                  ? selected.links.map((x: any) => x.label).join(", ")
                  : t.labels.noneVerified}
              </dd>
            </div>
            <div>
              <dt>{t.labels.provenance}</dt>
              <dd>{selected.source}</dd>
            </div>
            <div>
              <dt>{t.labels.statusHistory}</dt>
              <dd>
                {selected.history.length
                  ? selected.history
                      .map((x: any) => `${x.at}: ${statusLabels[x.status] || x.status}`)
                      .join(" · ")
                  : t.labels.unavailable}
              </dd>
            </div>
          </dl>
          <h4>{t.labels.checklist}</h4>
          {onboardingChecklist(selected).map((x) => (
            <div className="check" key={x.key}>
              <b>{x.complete ? "✓" : "—"}</b>
              {checklistLabels[x.key] || x.label}
            </div>
          ))}
          <div className="decision">
            <select
              aria-label={t.labels.decision}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="request_information">
                {t.labels.decisionLabelRequestInformation}
              </option>
              <option value="approve">{t.labels.decisionLabelApprove}</option>
              <option value="decline">{t.labels.decisionLabelDecline}</option>
            </select>
            <select
              aria-label={t.labels.summaryLocale}
              value={summaryLocale}
              onChange={(e) => setSummaryLocale(e.target.value)}
            >
              {PARTNER_LOCALES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              onClick={() =>
                setPreview(decisionPreview(selected, decision, summaryLocale))
              }
            >
              {t.labels.previewDecision}
            </button>
            <button onClick={() => void copy()}>
              {copied ? t.labels.copied : t.labels.copyExport}
            </button>
          </div>
          {preview && (
            <div className="decision-preview">
              <b>{t.labels.decisionPreview}</b>
              <p>
                {preview.organization} · {statusLabels[preview.decision] || preview.decision} ·{" "}
                {preview.locale}
              </p>
              <p>{preview.notice}</p>
              <button disabled>{t.labels.submitUnavailable}</button>
            </div>
          )}
          {copied && <small className="copy-notice">{t.labels.copiedNotice}</small>}
        </div>
      )}
    </div>
  );
}
