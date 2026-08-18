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
  loading: 'Loading applications…', empty: 'No partner applications.', error: 'Partner applications are unavailable.',
  note: 'Review note', reply: 'Support reply', send: 'Send reply',
  start: 'Start review', info: 'Request more information', approve: 'Approve', reject: 'Reject',
  audit: 'Immutable audit history',
  boundary: 'Approval creates an Admin course candidate. It never publishes directly to the app.',
  documents: 'Authority documents', documentReason: 'Reason for the applicant',
  verify: 'Verify', decline: 'Do not accept', alternative: 'Ask for an alternative',
  reasonRequired: 'A reason is required to decline a document or ask for an alternative.',
  checklist: 'Proportionate evidence', checklistSatisfied: 'Satisfied', checklistMissing: 'Still required',
  contract: 'Contract approval', contractLead: 'Records the immutable approval that application approval requires.',
  scope: 'Scope', scopeCourse: 'Course partner, founding commission', scopeService: 'Small Business service relationship',
  effectiveFrom: 'Effective from', commission: 'Commission (basis points)',
  legalComplete: 'Legal review is complete', legalReference: 'Legal review reference',
  legalPending: 'Legal review is pending. The trial receipt continues to state that.',
  approveContract: 'Record contract approval', contractRecorded: 'Contract approval recorded',
  noContract: 'No contract approval recorded yet. Approval cannot proceed without one.',
  agreement: 'Accepted agreement', agreementNone: 'Not accepted yet',
};

const COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {...EN,
    title: 'ตรวจสอบการสมัครพันธมิตร',
    lead: 'ตรวจใบสมัคร ตัดสินเอกสารแสดงอำนาจ บันทึกการอนุมัติสัญญา และสร้างข้อมูลสนามสำหรับแอดมินเท่านั้น',
    loading: 'กำลังโหลดใบสมัคร…', empty: 'ยังไม่มีใบสมัคร', error: 'ระบบตรวจใบสมัครไม่พร้อมใช้งาน',
    info: 'ขอข้อมูลเพิ่มเติม', approve: 'อนุมัติ', reject: 'ปฏิเสธ',
    documents: 'เอกสารแสดงอำนาจ', documentReason: 'เหตุผลที่แจ้งผู้สมัคร',
    verify: 'ยืนยัน', decline: 'ไม่รับเอกสาร', alternative: 'ขอเอกสารอื่น',
    reasonRequired: 'ต้องระบุเหตุผลเมื่อไม่รับเอกสารหรือขอเอกสารอื่น',
    checklist: 'หลักฐานตามสัดส่วน', checklistSatisfied: 'ครบถ้วน', checklistMissing: 'ยังต้องการ',
    contract: 'การอนุมัติสัญญา', contractLead: 'บันทึกหลักฐานการอนุมัติที่ไม่เปลี่ยนแปลง ซึ่งจำเป็นต่อการอนุมัติใบสมัคร',
    scope: 'ขอบเขต', effectiveFrom: 'มีผลตั้งแต่', commission: 'ค่าคอมมิชชัน (เบสิสพอยต์)',
    legalComplete: 'ตรวจสอบทางกฎหมายเสร็จสิ้น', legalReference: 'เลขอ้างอิงการตรวจทางกฎหมาย',
    legalPending: 'อยู่ระหว่างตรวจสอบทางกฎหมาย ใบเสร็จช่วงทดลองจะระบุตามนั้น',
    approveContract: 'บันทึกการอนุมัติสัญญา', contractRecorded: 'บันทึกการอนุมัติสัญญาแล้ว',
    noContract: 'ยังไม่มีการอนุมัติสัญญา จึงยังอนุมัติใบสมัครไม่ได้',
    agreement: 'ข้อตกลงที่ยอมรับแล้ว', agreementNone: 'ยังไม่ได้ยอมรับ'},
  ko: {...EN, title: '파트너 신청 검토', documents: '권한 서류', verify: '인증', decline: '반려', alternative: '대체 서류 요청',
    contract: '계약 승인', approveContract: '계약 승인 기록', legalComplete: '법무 검토 완료', legalPending: '법무 검토가 진행 중입니다. 체험 영수증에도 그렇게 표시됩니다.',
    noContract: '아직 계약 승인이 없습니다. 승인 없이는 진행할 수 없습니다.'},
  ja: {...EN, title: 'パートナー申請審査', documents: '権限書類', verify: '確認済みにする', decline: '受理しない', alternative: '代替書類を依頼',
    contract: '契約承認', approveContract: '契約承認を記録', legalComplete: '法務確認済み', legalPending: '法務確認は保留中です。トライアル受領書にもそのまま表示されます。',
    noContract: '契約承認がまだありません。承認は進められません。'},
  zh: {...EN, title: '合作伙伴申请审核', documents: '授权文件', verify: '核验', decline: '不予接受', alternative: '要求替代文件',
    contract: '合同批准', approveContract: '记录合同批准', legalComplete: '法务审核已完成', legalPending: '法务审核仍在进行，试用回执会如实说明。',
    noContract: '尚无合同批准记录，无法继续批准。'},
  es: {...EN, title: 'Revisión de socios', documents: 'Documentos de autoridad', verify: 'Verificar', decline: 'No aceptar', alternative: 'Pedir una alternativa',
    contract: 'Aprobación del contrato', approveContract: 'Registrar la aprobación', legalComplete: 'Revisión legal completada', legalPending: 'La revisión legal está pendiente. El recibo de prueba lo sigue indicando.',
    noContract: 'Aún no hay aprobación de contrato. La aprobación no puede continuar.'},
  fr: {...EN, title: 'Examen des partenaires', documents: "Documents d'habilitation", verify: 'Vérifier', decline: 'Ne pas accepter', alternative: 'Demander une alternative',
    contract: "Approbation du contrat", approveContract: "Enregistrer l'approbation", legalComplete: 'Revue juridique terminée', legalPending: "La revue juridique est en attente. Le reçu d'essai continue de l'indiquer.",
    noContract: "Aucune approbation de contrat enregistrée. L'approbation ne peut pas se poursuivre."},
  de: {...EN, title: 'Partnerprüfung', documents: 'Vertretungsnachweise', verify: 'Prüfen', decline: 'Nicht annehmen', alternative: 'Alternative anfordern',
    contract: 'Vertragsfreigabe', approveContract: 'Vertragsfreigabe erfassen', legalComplete: 'Juristische Prüfung abgeschlossen', legalPending: 'Die juristische Prüfung läuft noch. Der Testbeleg sagt das weiterhin.',
    noContract: 'Noch keine Vertragsfreigabe erfasst. Die Genehmigung kann nicht fortfahren.'},
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
    return <section className="partner-review"><p role="alert">{copy.error}</p><button onClick={() => void load()}>{copy.start}</button></section>;
  }

  const application = detail?.application;
  const approvals: any[] = detail?.contractApprovals ?? [];
  const approval = approvals[0] ?? null;
  const checklist = detail?.checklist ?? null;
  const canDecideDocument = (decision: string) => decision === 'verified' || documentReason.trim().length > 0;

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
                    <span>{item.country} · {item.locale} · {item.status}</span>
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
                <dt>{shared.statusHeading}</dt><dd>{application.status}</dd>
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
