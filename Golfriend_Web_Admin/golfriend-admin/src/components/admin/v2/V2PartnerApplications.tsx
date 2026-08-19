import {useCallback, useEffect, useState} from 'react';
import {partnerAdminService} from '../../B2B/partnerApplicationService';
import {useAdminLocale} from './AdminLocaleContext';
import type {AdminLocale} from './adminNavigation';
import {evidenceKindLabel, documentStatusLabel, applicantJourneyCopy} from '../../../i18n/partner/applicantJourney';
import './V2PartnerApplications.css';

// Admin review of partner applications.
//
// Two decisions live here that previously existed nowhere in the product, so the applicant
// chain could only be completed by writing to the database directly:
//   * a decision on each representative-authority document (verify / reject / ask for an
//     alternative), and
//   * the legal and commercial contract approval that application approval demands.
// Both go through authoritative callables. Nothing on this screen writes Firestore, and no
// field of a decision - status, reviewer, reason, timestamp, revision - is chosen by the client.

const EN = {
  title: 'Partner onboarding review',
  lead: 'Review localized applications, decide the authority documents, record contract approval and create Admin-only course candidates.',
  loading: 'Loading applications…',
  empty: 'No partner applications.',
  error: 'Partner applications are unavailable.',
  retry: 'Retry',
  note: 'Review note',
  reply: 'Support reply',
  send: 'Send reply',
  start: 'Start review',
  info: 'Request more information',
  approve: 'Approve',
  reject: 'Reject',
  audit: 'Immutable audit history',
  boundary: 'Approval creates an Admin course candidate. It never publishes directly to the app.',
  documents: 'Authority documents',
  documentReason: 'Reason for the applicant',
  verify: 'Verify',
  decline: 'Do not accept',
  alternative: 'Ask for an alternative',
  reasonRequired: 'A reason is required to decline a document or ask for an alternative.',
  checklist: 'Proportionate evidence',
  checklistSatisfied: 'Satisfied',
  checklistMissing: 'Still required',
  contract: 'Contract approval',
  contractLead: 'Records the immutable approval that application approval requires.',
  scope: 'Scope',
  scopeCourse: 'Course partner, founding commission',
  scopeService: 'Small Business service relationship',
  effectiveFrom: 'Effective from',
  commission: 'Commission (basis points)',
  legalComplete: 'Legal review is complete',
  legalReference: 'Legal review reference',
  legalPending: 'Legal review is pending. The trial receipt continues to state that.',
  approveContract: 'Record contract approval',
  contractRecorded: 'Contract approval recorded',
  noContract: 'No contract approval recorded yet. Approval cannot proceed without one.',
  agreement: 'Accepted agreement',
  agreementNone: 'Not accepted yet',
};

const COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {
    title: 'ตรวจสอบการสมัครพันธมิตร',
    lead: 'ตรวจใบสมัคร ตัดสินเอกสารแสดงอำนาจ บันทึกการอนุมัติสัญญา และสร้างข้อมูลสนามสำหรับแอดมินเท่านั้น',
    loading: 'กำลังโหลดใบสมัคร…',
    empty: 'ยังไม่มีใบสมัคร',
    error: 'ระบบตรวจใบสมัครไม่พร้อมใช้งาน',
    retry: 'ลองอีกครั้ง',
    note: 'หมายเหตุการตรวจ',
    reply: 'ข้อความตอบกลับ',
    send: 'ส่งข้อความตอบ',
    start: 'เริ่มการทบทวน',
    info: 'ขอข้อมูลเพิ่มเติม',
    approve: 'อนุมัติ',
    reject: 'ปฏิเสธ',
    audit: 'ประวัติการตรวจสอบที่ไม่เปลี่ยนแปลง',
    boundary: 'การอนุมัติสร้างคอร์สของผู้สมัครเป็นข้อมูลสำหรับแอดมินเท่านั้น ไม่เผยแพร่ลงแอปโดยตรง',
    documents: 'เอกสารแสดงอำนาจ',
    documentReason: 'เหตุผลที่แจ้งผู้สมัคร',
    verify: 'ยืนยัน',
    decline: 'ไม่รับเอกสาร',
    alternative: 'ขอเอกสารอื่น',
    reasonRequired: 'ต้องระบุเหตุผลเมื่อไม่รับเอกสารหรือขอเอกสารอื่น',
    checklist: 'หลักฐานตามสัดส่วน',
    checklistSatisfied: 'ครบถ้วน',
    checklistMissing: 'ยังต้องการ',
    contract: 'การอนุมัติสัญญา',
    contractLead: 'บันทึกหลักฐานการอนุมัติที่ไม่เปลี่ยนแปลง ซึ่งจำเป็นต่อการอนุมัติใบสมัคร',
    scope: 'ขอบเขต',
    scopeCourse: 'พันธมิตรสนามและค่าคอมมิชชันตั้งต้น',
    scopeService: 'ความสัมพันธ์บริการ Small Business',
    effectiveFrom: 'มีผลตั้งแต่',
    commission: 'ค่าคอมมิชชัน (เบสิสพอยต์)',
    legalComplete: 'ตรวจสอบทางกฎหมายเสร็จสิ้น',
    legalReference: 'เลขอ้างอิงการตรวจทางกฎหมาย',
    legalPending: 'อยู่ระหว่างตรวจสอบทางกฎหมาย ใบเสร็จช่วงทดลองจะระบุตามนั้น',
    approveContract: 'บันทึกการอนุมัติสัญญา',
    contractRecorded: 'บันทึกการอนุมัติสัญญาแล้ว',
    noContract: 'ยังไม่มีการอนุมัติสัญญา จึงยังอนุมัติใบสมัครไม่ได้',
    agreement: 'ข้อตกลงที่ยอมรับแล้ว',
    agreementNone: 'ยังไม่ได้ยอมรับ',
  },
  ko: {
    title: '파트너 신청 검토',
    lead: '신청을 검토하고 권한 서류를 결정한 뒤 계약 승인을 기록하고 관리자 전용 코스 후보를 생성합니다.',
    loading: '신청 목록을 불러오는 중…',
    empty: '파트너 신청이 없습니다.',
    error: '파트너 신청을 불러올 수 없습니다.',
    retry: '다시 시도',
    note: '검토 노트',
    reply: '지원 응답',
    send: '응답 보내기',
    start: '심사 시작',
    info: '추가 정보 요청',
    approve: '승인',
    reject: '거절',
    audit: '불변 감사 이력',
    boundary: '승인은 관리자 코스 후보를 만듭니다. 앱에 직접 게시되지는 않습니다.',
    documents: '권한 서류',
    documentReason: '신청자에게 전달할 사유',
    verify: '인증',
    decline: '반려',
    alternative: '대체 서류 요청',
    reasonRequired: '문서를 반려하거나 대체를 요청하려면 사유가 필요합니다.',
    checklist: '요건 증빙',
    checklistSatisfied: '완료됨',
    checklistMissing: '추가 필요',
    contract: '계약 승인',
    contractLead: '신청 승인에 필요한 변경 불가 승인 기록',
    scope: '범위',
    scopeCourse: '코스 파트너, 기본 수수료',
    scopeService: 'Small Business 서비스 관계',
    effectiveFrom: '적용일',
    commission: '수수료 (기준점)',
    legalComplete: '법무 검토 완료',
    legalReference: '법무 레퍼런스',
    legalPending: '법무 검토가 진행 중입니다. 체험 영수증에도 계속 표시됩니다.',
    approveContract: '계약 승인 기록',
    contractRecorded: '계약 승인 기록됨',
    noContract: '아직 계약 승인이 없습니다. 승인 없음',
    agreement: '수락된 계약',
    agreementNone: '아직 수락되지 않음',
  },
  ja: {
    title: 'パートナー申請審査',
    lead: '申請を審査し、権限書類を決定し、契約承認を記録して管理者専用コース候補を作成します。',
    loading: '申請を読み込み中…',
    empty: '申請はありません。',
    error: '申請を読み込めません。',
    retry: '再試行',
    note: '審査メモ',
    reply: 'サポート返信',
    send: '返信を送る',
    start: '審査を開始',
    info: '追加情報を要求',
    approve: '承認',
    reject: '却下',
    audit: '不変の監査履歴',
    boundary: '承認は管理者向けコース候補だけを作成し、アプリへ直接公開しません。',
    documents: '権限書類',
    documentReason: '申請者向け理由',
    verify: '確認済みにする',
    decline: '受理しない',
    alternative: '代替書類を依頼',
    reasonRequired: '書類を受理しない場合や代替を求める場合は理由が必要です。',
    checklist: '必要証拠',
    checklistSatisfied: '満たされた',
    checklistMissing: 'まだ必要',
    contract: '契約承認',
    contractLead: '申請承認に必要な不変の承認記録です。',
    scope: '対象範囲',
    scopeCourse: 'コースパートナー、ファウンディングコミッション',
    scopeService: 'Small Business サービス関係',
    effectiveFrom: '有効日',
    commission: '手数料（基礎ポイント）',
    legalComplete: '法務確認済み',
    legalReference: '法務照会',
    legalPending: '法務確認は保留中です。試用レシートにもそのまま表示されます。',
    approveContract: '契約承認を記録',
    contractRecorded: '契約承認を記録しました',
    noContract: 'まだ契約承認がありません。承認を進められません。',
    agreement: '受け入れた契約',
    agreementNone: 'まだ受け入れていません',
  },
  zh: {
    title: '合作伙伴申请审核',
    lead: '审核合作伙伴申请，决定权限文件、记录合同批准并创建仅管理员课程候选。',
    loading: '正在加载申请…',
    empty: '暂无合作伙伴申请。',
    error: '无法获取合作伙伴申请。',
    retry: '重试',
    note: '审核备注',
    reply: '支持回复',
    send: '发送回复',
    start: '开始审核',
    info: '请求补充信息',
    approve: '批准',
    reject: '不予接受',
    audit: '不可变审计历史',
    boundary: '批准只会创建管理员课程候选，不会直接发布到应用。',
    documents: '授权文件',
    documentReason: '给申请人的原因',
    verify: '核验',
    decline: '不予接受',
    alternative: '要求替代文件',
    reasonRequired: '拒绝文档或要求替代时必须填写原因。',
    checklist: '需核对材料',
    checklistSatisfied: '已满足',
    checklistMissing: '还需补充',
    contract: '合同批准',
    contractLead: '记录申请批准所需的不可变批准',
    scope: '范围',
    scopeCourse: '球场合作伙伴、起始提成',
    scopeService: 'Small Business服务关系',
    effectiveFrom: '生效时间',
    commission: '佣金（基点）',
    legalComplete: '法务审核已完成',
    legalReference: '法务审核参考',
    legalPending: '法务审核仍在进行中，试用回执会继续显示。',
    approveContract: '记录合同批准',
    contractRecorded: '合同批准已记录',
    noContract: '尚未记录合同批准，审批无法继续。',
    agreement: '已接受协议',
    agreementNone: '尚未接受',
  },
  es: {
    title: 'Revisión de socios',
    lead: 'Revisión de alta: valide documentos de autoridad, registre aprobación de contrato y cree candidatos de curso solo para Admin.',
    loading: 'Cargando aplicaciones de socio…',
    empty: 'No hay solicitudes de socio.',
    error: 'Las solicitudes de socio no están disponibles.',
    retry: 'Reintentar',
    note: 'Nota de revisión',
    reply: 'Respuesta de soporte',
    send: 'Enviar respuesta',
    start: 'Iniciar revisión',
    info: 'Solicitar más información',
    approve: 'Aprobar',
    reject: 'Rechazar',
    audit: 'Historial de auditoría inmutable',
    boundary: 'La aprobación crea solo un candidato de curso para Admin y no publica directamente en la app.',
    documents: 'Documentos de autoridad',
    documentReason: 'Motivo para el solicitante',
    verify: 'Verificar',
    decline: 'No aceptar',
    alternative: 'Pedir una alternativa',
    reasonRequired: 'Es obligatorio indicar una razón para rechazar o pedir una alternativa.',
    checklist: 'Pruebas proporcionales',
    checklistSatisfied: 'Satisfecho',
    checklistMissing: 'Aún requerido',
    contract: 'Aprobación del contrato',
    contractLead: 'Registra la aprobación inmutable que requiere la aprobación de la solicitud.',
    scope: 'Ámbito',
    scopeCourse: 'Socio de curso, comisión fundacional',
    scopeService: 'Relación de servicio de Small Business',
    effectiveFrom: 'Válido desde',
    commission: 'Comisión (basis points)',
    legalComplete: 'La revisión legal está completa',
    legalReference: 'Referencia legal',
    legalPending: 'La revisión legal está pendiente. El recibo de prueba sigue reflejando esto.',
    approveContract: 'Registrar aprobación contractual',
    contractRecorded: 'Aprobación contractual registrada',
    noContract: 'Aún no hay aprobación contractual. La aprobación no puede continuar.',
    agreement: 'Acuerdo aceptado',
    agreementNone: 'Aún no aceptado',
  },
  fr: {
    title: "Examen des partenaires",
    lead: 'Contrôle des demandes, décision des documents d’habilitation, enregistrement de l’approbation du contrat et création de candidats parcours Admin.',
    loading: 'Chargement des demandes…',
    empty: 'Aucune demande partenaire.',
    error: 'Les demandes de partenaires ne sont pas disponibles.',
    retry: 'Réessayer',
    note: 'Note de révision',
    reply: 'Réponse support',
    send: 'Envoyer la réponse',
    start: 'Commencer la revue',
    info: 'Demander plus d’informations',
    approve: 'Approuver',
    reject: 'Rejeter',
    audit: 'Historique d’audit immuable',
    boundary: 'L’approbation crée uniquement un candidat de cours Admin, sans publication directe dans l’application.',
    documents: "Documents d'habilitation",
    documentReason: 'Raison pour le demandeur',
    verify: 'Vérifier',
    decline: 'Ne pas accepter',
    alternative: 'Demander une alternative',
    reasonRequired: 'Une raison est requise pour refuser un document ou demander une alternative.',
    checklist: 'Preuve proportionnée',
    checklistSatisfied: 'Satisfait',
    checklistMissing: 'Encore requis',
    contract: 'Approbation du contrat',
    contractLead: 'Enregistre l’approbation immuable requise pour valider la demande.',
    scope: 'Portée',
    scopeCourse: 'Partenaire de parcours, commission de création',
    scopeService: 'Relation de service Small Business',
    effectiveFrom: 'Valide à partir du',
    commission: 'Commission (points de base)',
    legalComplete: 'La revue juridique est terminée',
    legalReference: 'Référence juridique',
    legalPending: 'La revue juridique est en attente. Le reçu d’essai le signale toujours.',
    approveContract: "Enregistrer l'approbation du contrat",
    contractRecorded: 'Approbation contractuelle enregistrée',
    noContract: "Aucune approbation contractuelle enregistrée. L’approbation ne peut pas continuer.",
    agreement: 'Accord accepté',
    agreementNone: 'Pas encore accepté',
  },
  de: {
    title: 'Partnerprüfung',
    lead: 'Überprüfung der Partneranträge, Festlegung der Befugnisdokumente, Erfassung der Vertragsfreigabe und Erstellung Admin-only-Kurskandidaten.',
    loading: 'Partneranträge werden geladen…',
    empty: 'Keine Partner-Anträge.',
    error: 'Partneranträge sind nicht verfügbar.',
    retry: 'Erneut versuchen',
    note: 'Prüfnotiz',
    reply: 'Support-Antwort',
    send: 'Antwort senden',
    start: 'Prüfung starten',
    info: 'Zusätzliche Informationen anfordern',
    approve: 'Freigeben',
    reject: 'Ablehnen',
    audit: 'Unveränderlicher Audit-Verlauf',
    boundary: 'Die Freigabe erstellt nur einen Admin-Kurskandidaten und veröffentlicht nicht direkt in der App.',
    documents: 'Nachweise der Vollmacht',
    documentReason: 'Grund für den Antragsteller',
    verify: 'Bestätigen',
    decline: 'Nicht annehmen',
    alternative: 'Alternative anfordern',
    reasonRequired: 'Zum Ablehnen eines Dokuments oder Anfordern einer Alternative ist ein Grund erforderlich.',
    checklist: 'Erforderliche Unterlagen',
    checklistSatisfied: 'Erfüllt',
    checklistMissing: 'Noch erforderlich',
    contract: 'Vertragsfreigabe',
    contractLead: 'Erfasst die unveränderliche Freigabe, die für die Antragfreigabe benötigt wird.',
    scope: 'Bereich',
    scopeCourse: 'Course-Partner, Gründungsprovision',
    scopeService: 'Small-Business-Servicebeziehung',
    effectiveFrom: 'Wirksam ab',
    commission: 'Provision (Basiswerte)',
    legalComplete: 'Rechtliche Prüfung abgeschlossen',
    legalReference: 'Rechtsprüfung Referenz',
    legalPending: 'Rechtliche Prüfung steht noch aus. Der Testbeleg zeigt dies weiterhin an.',
    approveContract: 'Vertragsfreigabe erfassen',
    contractRecorded: 'Vertragsfreigabe erfasst',
    noContract: 'Noch keine Vertragsfreigabe erfasst. Die Genehmigung kann nicht fortfahren.',
    agreement: 'Angenommene Vereinbarung',
    agreementNone: 'Noch nicht akzeptiert',
  },
};

const STATUS_EN: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_needed: 'Info needed',
  approved: 'Approved',
  rejected: 'Rejected',
};

const APPLICATION_STATUS: Record<AdminLocale, Record<string, string>> = {
  en: STATUS_EN,
  th: { submitted: 'ส่งแล้ว', under_review: 'อยู่ระหว่างตรวจ', info_needed: 'ต้องการข้อมูลเพิ่มเติม', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธแล้ว' },
  ko: { submitted: '제출됨', under_review: '심사 중', info_needed: '추가 정보 필요', approved: '승인됨', rejected: '거절됨' },
  ja: { submitted: '提出済み', under_review: '審査中', info_needed: '追加情報必要', approved: '承認済み', rejected: '却下' },
  zh: { submitted: '已提交', under_review: '审核中', info_needed: '需要更多信息', approved: '已批准', rejected: '已拒绝' },
  es: { submitted: 'Enviado', under_review: 'En revisión', info_needed: 'Información requerida', approved: 'Aprobado', rejected: 'Rechazado' },
  fr: { submitted: 'Soumis', under_review: 'En révision', info_needed: 'Informations supplémentaires', approved: 'Approuvé', rejected: 'Rejeté' },
  de: { submitted: 'Eingereicht', under_review: 'In Prüfung', info_needed: 'Weitere Informationen erforderlich', approved: 'Genehmigt', rejected: 'Abgelehnt' },
};

const today = () => new Date().toISOString().slice(0, 10);

export default function V2PartnerApplications() {
  const locale = useAdminLocale();
  const copy = COPY[locale];
  // Document kind and status names are shared with the applicant, so both sides read the same
  // words for the same document rather than Admin jargon against applicant prose.
  const shared = applicantJourneyCopy(locale);

  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [documentReason, setDocumentReason] = useState('');
  const [contract, setContract] = useState({scope: 'course_partner_founding_commission', effectiveFrom: today(), legalReviewComplete: false, legalReviewReference: ''});
  const [notice, setNotice] = useState<{tone: 'status' | 'alert'; text: string} | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try { const result = await partnerAdminService.list(); setItems(result.items || []); setState('ready'); }
    catch { setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choose = useCallback(async (item: any) => {
    setSelected(item); setDetail(null);
    try { setDetail(await partnerAdminService.detail(item.applicationId)); }
    catch { setNotice({tone: 'alert', text: copy.error}); }
  }, [copy.error]);

  const run = async (task: () => Promise<any>, success: string) => {
    setBusy(true); setNotice(null);
    try {
      await task();
      setNotice({tone: 'status', text: success});
      await load();
      if (selected) await choose(selected);
    } catch { setNotice({tone: 'alert', text: copy.error}); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <section className="partner-review"><p role="status">{copy.loading}</p></section>;
  if (state === 'error') {
    return <section className="partner-review"><p role="alert">{copy.error}</p><button onClick={() => void load()}>{copy.retry}</button></section>;
  }

  const application = detail?.application;
  const approvals: any[] = detail?.contractApprovals ?? [];
  const approval = approvals[0] ?? null;
  const checklist = detail?.checklist ?? null;
  const canDecideDocument = (decision: string) => decision === 'verified' || documentReason.trim().length > 0;
  const applicationStatusLabel = (status: string) => (APPLICATION_STATUS[locale][(status as keyof typeof STATUS_EN)] ?? status);

  return (
    <section className="partner-review">
      <header>
        <h2>{copy.title}</h2>
        <p>{copy.lead}</p>
        <strong>{copy.boundary}</strong>
      </header>

      <div className="partner-review-grid">
        <div>
          {!items.length ? <p>{copy.empty}</p> : (
            <ul>
              {items.map(item => (
                <li key={item.applicationId}>
                  <button aria-pressed={selected?.applicationId === item.applicationId} onClick={() => void choose(item)}>
                  <strong>{item.organization}</strong>
                    <span>{item.country} · {item.locale} · {applicationStatusLabel(item.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <article aria-live="polite">
          {selected && !detail ? <p role="status">{copy.loading}</p> : null}
          {detail ? (
            <>
              <h3>{application.organization}</h3>
              <dl>
                <dt>{shared.courseName}</dt><dd>{application.course?.name}</dd>
                <dt>{shared.contactName}</dt><dd>{application.contactName} · {application.contactEmail}</dd>
                <dt>{shared.statusHeading}</dt><dd>{applicationStatusLabel(application.status)}</dd>
                <dt>{shared.representationBasis}</dt><dd>{checklist?.representationBasis}</dd>
                {/* Document kinds are shown by name on both sides of the review, never as the
                    stored token — a reviewer should read the same words the applicant does. */}
                <dt>{copy.checklist}</dt><dd>{checklist?.satisfied ? copy.checklistSatisfied : `${copy.checklistMissing}: ${(checklist?.missing ?? []).map((group: string) => group.split('|').map((kind) => evidenceKindLabel(shared, kind)).join(' / ')).join('; ')}`}</dd>
                <dt>{copy.agreement}</dt><dd>{application.agreement?.receiptId ? `${application.agreement.version} · ${String(application.agreement.digest).slice(0, 16)}…` : copy.agreementNone}</dd>
              </dl>

              <h4>{copy.documents}</h4>
              <label>{copy.documentReason}
                <textarea value={documentReason} maxLength={2000} onChange={e => setDocumentReason(e.target.value)} />
              </label>
              <p role="note">{copy.reasonRequired}</p>
              <table>
                <caption>{copy.documents}</caption>
                <thead>
                  <tr>
                    <th scope="col">{shared.documentKind}</th>
                    <th scope="col">{shared.statusAwaiting}</th>
                    <th scope="col">{copy.verify}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.evidence ?? []).length === 0
                    ? <tr><td colSpan={3}>{shared.none}</td></tr>
                    : detail.evidence.map((item: any) => (
                      <tr key={item.evidenceId}>
                        <th scope="row">{evidenceKindLabel(shared, String(item.kind ?? ''))} — {item.fileName}</th>
                        <td>{documentStatusLabel(shared, String(item.verificationStatus ?? ''))}{item.reviewReason ? ` — ${item.reviewReason}` : ''}</td>
                        <td>
                          <button disabled={busy} onClick={() => void run(() => partnerAdminService.reviewEvidence(application.applicationId, item.evidenceId, 'verified', documentReason, Number(item.revision ?? 0)), copy.verify)}>{copy.verify}</button>
                          <button disabled={busy || !canDecideDocument('rejected')} onClick={() => void run(() => partnerAdminService.reviewEvidence(application.applicationId, item.evidenceId, 'rejected', documentReason, Number(item.revision ?? 0)), copy.decline)}>{copy.decline}</button>
                          <button disabled={busy || !canDecideDocument('alternative_requested')} onClick={() => void run(() => partnerAdminService.reviewEvidence(application.applicationId, item.evidenceId, 'alternative_requested', documentReason, Number(item.revision ?? 0)), copy.alternative)}>{copy.alternative}</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <h4>{copy.contract}</h4>
              <p>{copy.contractLead}</p>
              {approval
                ? <p role="status">{copy.contractRecorded}: <code>{approval.approvalId}</code> · {approval.scope} · {approval.commissionBps}bps{approval.legalReviewComplete ? '' : ` · ${copy.legalPending}`}</p>
                : <p role="status">{copy.noContract}</p>}
              <label>{copy.scope}
                <select value={contract.scope} onChange={e => setContract({...contract, scope: e.target.value})}>
                  <option value="course_partner_founding_commission">{copy.scopeCourse}</option>
                  <option value="small_business_service">{copy.scopeService}</option>
                </select>
              </label>
              <label>{copy.effectiveFrom}
                <input type="date" value={contract.effectiveFrom} onChange={e => setContract({...contract, effectiveFrom: e.target.value})} />
              </label>
              <label>{copy.commission}<input type="number" value={300} readOnly /></label>
              <label>
                <input type="checkbox" checked={contract.legalReviewComplete} onChange={e => setContract({...contract, legalReviewComplete: e.target.checked})} />
                {copy.legalComplete}
              </label>
              <label>{copy.legalReference}
                <input value={contract.legalReviewReference} onChange={e => setContract({...contract, legalReviewReference: e.target.value})} />
              </label>
              <button
                disabled={busy}
                onClick={() => void run(() => partnerAdminService.approveContract(application.applicationId, {
                  scope: contract.scope,
                  effectiveFrom: `${contract.effectiveFrom}T00:00:00.000Z`,
                  commissionBps: 300,
                  legalReviewComplete: contract.legalReviewComplete,
                  legalReviewReference: contract.legalReviewReference,
                }), copy.contractRecorded)}
              >{copy.approveContract}</button>

              <h4>{copy.note}</h4>
              <label>{copy.note}<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label>
              <div className="review-actions">
                {application.status === 'submitted' ? (
                  <button disabled={busy} onClick={() => void run(() => partnerAdminService.review(selected.applicationId, 'under_review', note), copy.start)}>{copy.start}</button>
                ) : null}
                {['submitted', 'under_review'].includes(application.status) ? (
                  <>
                    <button disabled={busy || !note.trim()} onClick={() => void run(() => partnerAdminService.review(selected.applicationId, 'info_needed', note), copy.info)}>{copy.info}</button>
                    <button disabled={busy || !note.trim()} onClick={() => void run(() => partnerAdminService.review(selected.applicationId, 'rejected', note), copy.reject)}>{copy.reject}</button>
                  </>
                ) : null}
                {application.status === 'under_review' ? (
                  <button disabled={busy || !approval} onClick={() => void run(() => partnerAdminService.review(selected.applicationId, 'approved', note, approval?.approvalId), copy.approve)}>{copy.approve}</button>
                ) : null}
              </div>

              <label>{copy.reply}<textarea value={reply} maxLength={2000} onChange={e => setReply(e.target.value)} /></label>
              <button disabled={busy || !reply.trim()} onClick={() => void run(async () => {const result = await partnerAdminService.message(selected.applicationId, reply); setReply(''); return result;}, copy.send)}>{copy.send}</button>

              <h4>{shared.messagesHeading}</h4>
              <ol>{detail.messages.map((item: any) => <li key={item.id}><strong>{item.sender}</strong>: {item.message}</li>)}</ol>

              <h4>{copy.audit}</h4>
              <ol>{detail.audits.map((item: any) => <li key={item.id}>{item.kind} · {item.actorRole} · {item.id}</li>)}</ol>
            </>
          ) : null}
        </article>
      </div>

      {notice ? <p role={notice.tone}>{notice.text}</p> : null}
    </section>
  );
}
