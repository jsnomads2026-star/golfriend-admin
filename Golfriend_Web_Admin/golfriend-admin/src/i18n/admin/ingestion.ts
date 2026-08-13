// Eight-locale strings for the Admin partner-application ingestion queue (slice 1a).
import type { LocaleDict } from '../dict.ts';

export type IngestKey =
  | 'title' | 'subtitle' | 'empty' | 'refresh'
  | 'colApplicant' | 'colStatus' | 'colMissing' | 'colActions'
  | 'decBeginReview' | 'decApprove' | 'decReject' | 'decRequestInfo'
  | 'reviewNotePh' | 'reviewedOk' | 'reviewFailed' | 'loadFailed' | 'handoffNote'
  | 'st_submitted' | 'st_under_review' | 'st_approved' | 'st_rejected' | 'st_info_needed';

export const INGESTION: LocaleDict<IngestKey> = {
  en: {
    title: 'Partner applications', subtitle: 'Review incoming partner applications. Approval flags the account for staff provisioning — it does not grant partner access.',
    empty: 'No partner applications yet.', refresh: 'Refresh',
    colApplicant: 'Applicant', colStatus: 'Status', colMissing: 'Missing', colActions: 'Actions',
    decBeginReview: 'Begin review', decApprove: 'Approve', decReject: 'Reject', decRequestInfo: 'Request info',
    reviewNotePh: 'Note to the applicant (optional)', reviewedOk: 'Application updated.', reviewFailed: 'Could not update the application. Please try again.', loadFailed: 'Could not load applications.',
    handoffNote: 'Approved — ready for staff provisioning. Provision the partner account separately.',
    st_submitted: 'Submitted', st_under_review: 'Under review', st_approved: 'Approved', st_rejected: 'Rejected', st_info_needed: 'Info needed',
  },
  th: {
    title: 'ใบสมัครพันธมิตร', subtitle: 'ตรวจสอบใบสมัครพันธมิตรที่เข้ามา การอนุมัติจะทำเครื่องหมายบัญชีเพื่อให้เจ้าหน้าที่จัดเตรียม — ไม่ได้ให้สิทธิ์การเข้าถึงพันธมิตร',
    empty: 'ยังไม่มีใบสมัครพันธมิตร', refresh: 'รีเฟรช',
    colApplicant: 'ผู้สมัคร', colStatus: 'สถานะ', colMissing: 'ยังขาด', colActions: 'การดำเนินการ',
    decBeginReview: 'เริ่มตรวจสอบ', decApprove: 'อนุมัติ', decReject: 'ปฏิเสธ', decRequestInfo: 'ขอข้อมูลเพิ่ม',
    reviewNotePh: 'หมายเหตุถึงผู้สมัคร (ไม่บังคับ)', reviewedOk: 'อัปเดตใบสมัครแล้ว', reviewFailed: 'ไม่สามารถอัปเดตใบสมัครได้ กรุณาลองใหม่', loadFailed: 'ไม่สามารถโหลดใบสมัครได้',
    handoffNote: 'อนุมัติแล้ว — พร้อมให้เจ้าหน้าที่จัดเตรียม กรุณาจัดเตรียมบัญชีพันธมิตรแยกต่างหาก',
    st_submitted: 'ส่งแล้ว', st_under_review: 'กำลังตรวจสอบ', st_approved: 'อนุมัติแล้ว', st_rejected: 'ปฏิเสธแล้ว', st_info_needed: 'ต้องการข้อมูล',
  },
  ko: {
    title: '파트너 신청', subtitle: '들어온 파트너 신청을 검토하세요. 승인은 계정을 직원 프로비저닝 대상으로 표시할 뿐, 파트너 접근 권한을 부여하지 않습니다.',
    empty: '아직 파트너 신청이 없습니다.', refresh: '새로고침',
    colApplicant: '신청자', colStatus: '상태', colMissing: '누락', colActions: '작업',
    decBeginReview: '검토 시작', decApprove: '승인', decReject: '거절', decRequestInfo: '정보 요청',
    reviewNotePh: '신청자에게 보낼 메모 (선택)', reviewedOk: '신청이 업데이트되었습니다.', reviewFailed: '신청을 업데이트할 수 없습니다. 다시 시도하세요.', loadFailed: '신청을 불러올 수 없습니다.',
    handoffNote: '승인됨 — 직원 프로비저닝 준비 완료. 파트너 계정을 별도로 프로비저닝하세요.',
    st_submitted: '제출됨', st_under_review: '검토 중', st_approved: '승인됨', st_rejected: '거절됨', st_info_needed: '정보 필요',
  },
  ja: {
    title: 'パートナー申請', subtitle: '届いたパートナー申請を審査します。承認はアカウントをスタッフによるプロビジョニング対象として記録するだけで、パートナーアクセスを付与しません。',
    empty: 'まだパートナー申請はありません。', refresh: '更新',
    colApplicant: '申請者', colStatus: '状態', colMissing: '不足', colActions: '操作',
    decBeginReview: '審査開始', decApprove: '承認', decReject: '却下', decRequestInfo: '情報を依頼',
    reviewNotePh: '申請者へのメモ（任意）', reviewedOk: '申請を更新しました。', reviewFailed: '申請を更新できませんでした。もう一度お試しください。', loadFailed: '申請を読み込めませんでした。',
    handoffNote: '承認済み — スタッフによるプロビジョニング準備完了。パートナーアカウントは別途プロビジョニングしてください。',
    st_submitted: '送信済み', st_under_review: '審査中', st_approved: '承認済み', st_rejected: '却下', st_info_needed: '情報が必要',
  },
  zh: {
    title: '合作伙伴申请', subtitle: '审核收到的合作伙伴申请。批准仅将账户标记为待工作人员开通 — 并不授予合作伙伴访问权限。',
    empty: '暂无合作伙伴申请。', refresh: '刷新',
    colApplicant: '申请人', colStatus: '状态', colMissing: '缺少', colActions: '操作',
    decBeginReview: '开始审核', decApprove: '批准', decReject: '拒绝', decRequestInfo: '请求信息',
    reviewNotePh: '给申请人的备注（可选）', reviewedOk: '申请已更新。', reviewFailed: '无法更新申请。请重试。', loadFailed: '无法加载申请。',
    handoffNote: '已批准 — 可供工作人员开通。请单独开通合作伙伴账户。',
    st_submitted: '已提交', st_under_review: '审核中', st_approved: '已批准', st_rejected: '已拒绝', st_info_needed: '需要信息',
  },
  es: {
    title: 'Solicitudes de socios', subtitle: 'Revisa las solicitudes de socios entrantes. La aprobación marca la cuenta para el aprovisionamiento por el personal, no concede acceso de socio.',
    empty: 'Aún no hay solicitudes de socios.', refresh: 'Actualizar',
    colApplicant: 'Solicitante', colStatus: 'Estado', colMissing: 'Falta', colActions: 'Acciones',
    decBeginReview: 'Iniciar revisión', decApprove: 'Aprobar', decReject: 'Rechazar', decRequestInfo: 'Pedir información',
    reviewNotePh: 'Nota para el solicitante (opcional)', reviewedOk: 'Solicitud actualizada.', reviewFailed: 'No se pudo actualizar la solicitud. Inténtalo de nuevo.', loadFailed: 'No se pudieron cargar las solicitudes.',
    handoffNote: 'Aprobada: lista para aprovisionamiento por el personal. Aprovisiona la cuenta de socio por separado.',
    st_submitted: 'Enviada', st_under_review: 'En revisión', st_approved: 'Aprobada', st_rejected: 'Rechazada', st_info_needed: 'Falta info',
  },
  fr: {
    title: 'Demandes de partenariat', subtitle: 'Examinez les demandes de partenariat entrantes. L’approbation marque le compte pour le provisionnement par le personnel — elle n’accorde pas l’accès partenaire.',
    empty: 'Aucune demande de partenariat pour le moment.', refresh: 'Actualiser',
    colApplicant: 'Demandeur', colStatus: 'Statut', colMissing: 'Manquant', colActions: 'Actions',
    decBeginReview: 'Commencer l’examen', decApprove: 'Approuver', decReject: 'Refuser', decRequestInfo: 'Demander des infos',
    reviewNotePh: 'Note au demandeur (facultatif)', reviewedOk: 'Demande mise à jour.', reviewFailed: 'Impossible de mettre à jour la demande. Veuillez réessayer.', loadFailed: 'Impossible de charger les demandes.',
    handoffNote: 'Approuvée — prête pour le provisionnement par le personnel. Provisionnez le compte partenaire séparément.',
    st_submitted: 'Envoyée', st_under_review: 'En examen', st_approved: 'Approuvée', st_rejected: 'Refusée', st_info_needed: 'Infos requises',
  },
  de: {
    title: 'Partneranträge', subtitle: 'Prüfen Sie eingehende Partneranträge. Die Genehmigung markiert das Konto für die Bereitstellung durch Mitarbeiter — sie gewährt keinen Partnerzugang.',
    empty: 'Noch keine Partneranträge.', refresh: 'Aktualisieren',
    colApplicant: 'Antragsteller', colStatus: 'Status', colMissing: 'Fehlend', colActions: 'Aktionen',
    decBeginReview: 'Prüfung beginnen', decApprove: 'Genehmigen', decReject: 'Ablehnen', decRequestInfo: 'Infos anfordern',
    reviewNotePh: 'Notiz an den Antragsteller (optional)', reviewedOk: 'Antrag aktualisiert.', reviewFailed: 'Der Antrag konnte nicht aktualisiert werden. Bitte erneut versuchen.', loadFailed: 'Anträge konnten nicht geladen werden.',
    handoffNote: 'Genehmigt — bereit zur Bereitstellung durch Mitarbeiter. Stellen Sie das Partnerkonto separat bereit.',
    st_submitted: 'Gesendet', st_under_review: 'In Prüfung', st_approved: 'Genehmigt', st_rejected: 'Abgelehnt', st_info_needed: 'Infos nötig',
  },
};
