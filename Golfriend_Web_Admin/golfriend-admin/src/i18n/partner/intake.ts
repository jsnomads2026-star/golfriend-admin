// Eight-locale strings for the partner application INTAKE + status tracking
// (metadata + checklist + consent + attestation). File upload is honestly
// unavailable (no Storage yet); the applicant attests they hold each document.
import type { LocaleDict } from '../dict.ts';

export type IntakeKey =
  | 'checklistHeading' | 'checklistHint'
  | 'doc_business_registration' | 'doc_ownership_or_authorization' | 'doc_responsible_person_id'
  | 'attestHave' | 'fileUploadUnavailable'
  | 'attestationHeading' | 'attestationText' | 'attestationCheckbox'
  | 'submitApplication' | 'submitting' | 'submitFailed' | 'needConsentAttest' | 'submittedOk'
  | 'statusHeading' | 'statusNone'
  | 'st_submitted' | 'st_under_review' | 'st_approved' | 'st_rejected' | 'st_info_needed'
  | 'reviewNoteLabel' | 'resubmit' | 'missingLabel';

export const INTAKE: LocaleDict<IntakeKey> = {
  en: {
    checklistHeading: 'Document checklist', checklistHint: 'Confirm the documents you hold. Secure file upload is not yet available — you attest you have these and will upload them once it opens.',
    doc_business_registration: 'Business registration', doc_ownership_or_authorization: 'Course ownership or authorization', doc_responsible_person_id: 'ID of the responsible person',
    attestHave: 'I hold this document', fileUploadUnavailable: 'File upload not yet available',
    attestationHeading: 'Attestation', attestationText: 'I attest that the information provided is accurate and that I am authorized to represent this golf course.', attestationCheckbox: 'I attest the above is true and accurate.',
    submitApplication: 'Submit application', submitting: 'Submitting…', submitFailed: 'Could not submit the application. Please try again.', needConsentAttest: 'Please accept consent and attestation before submitting.', submittedOk: 'Application submitted. You can track its status below.',
    statusHeading: 'Application status', statusNone: 'No application submitted yet.',
    st_submitted: 'Submitted — awaiting review', st_under_review: 'Under review', st_approved: 'Approved — a Golfriend staff member will provision your access', st_rejected: 'Not accepted', st_info_needed: 'More information needed',
    reviewNoteLabel: 'Reviewer note', resubmit: 'Update and resubmit', missingLabel: 'Still needed',
  },
  th: {
    checklistHeading: 'รายการเอกสาร', checklistHint: 'ยืนยันเอกสารที่คุณมี ยังไม่เปิดให้อัปโหลดไฟล์ที่ปลอดภัย — คุณรับรองว่ามีเอกสารเหล่านี้และจะอัปโหลดเมื่อเปิดใช้งาน',
    doc_business_registration: 'ทะเบียนธุรกิจ', doc_ownership_or_authorization: 'หลักฐานความเป็นเจ้าของหรือการมอบอำนาจของสนาม', doc_responsible_person_id: 'บัตรประจำตัวของผู้รับผิดชอบ',
    attestHave: 'ฉันมีเอกสารนี้', fileUploadUnavailable: 'ยังไม่เปิดให้อัปโหลดไฟล์',
    attestationHeading: 'การรับรอง', attestationText: 'ข้าพเจ้ารับรองว่าข้อมูลที่ให้ไว้ถูกต้อง และข้าพเจ้าได้รับอนุญาตให้เป็นตัวแทนของสนามกอล์ฟแห่งนี้', attestationCheckbox: 'ข้าพเจ้ารับรองว่าข้อความข้างต้นเป็นความจริงและถูกต้อง',
    submitApplication: 'ส่งใบสมัคร', submitting: 'กำลังส่ง…', submitFailed: 'ไม่สามารถส่งใบสมัครได้ กรุณาลองใหม่', needConsentAttest: 'กรุณายอมรับคำยินยอมและการรับรองก่อนส่ง', submittedOk: 'ส่งใบสมัครแล้ว คุณสามารถติดตามสถานะได้ด้านล่าง',
    statusHeading: 'สถานะใบสมัคร', statusNone: 'ยังไม่ได้ส่งใบสมัคร',
    st_submitted: 'ส่งแล้ว — รอการตรวจสอบ', st_under_review: 'กำลังตรวจสอบ', st_approved: 'อนุมัติแล้ว — เจ้าหน้าที่ Golfriend จะจัดเตรียมการเข้าถึงให้คุณ', st_rejected: 'ไม่ผ่านการอนุมัติ', st_info_needed: 'ต้องการข้อมูลเพิ่มเติม',
    reviewNoteLabel: 'หมายเหตุจากผู้ตรวจสอบ', resubmit: 'แก้ไขและส่งอีกครั้ง', missingLabel: 'ยังต้องการ',
  },
  ko: {
    checklistHeading: '문서 체크리스트', checklistHint: '보유한 문서를 확인하세요. 보안 파일 업로드는 아직 제공되지 않습니다 — 보유 사실을 확인하며, 열리는 대로 업로드하게 됩니다.',
    doc_business_registration: '사업자 등록증', doc_ownership_or_authorization: '코스 소유 또는 위임 증빙', doc_responsible_person_id: '담당자 신분증',
    attestHave: '이 문서를 보유하고 있습니다', fileUploadUnavailable: '파일 업로드는 아직 제공되지 않습니다',
    attestationHeading: '확인', attestationText: '제공한 정보가 정확하며 본인이 이 골프장을 대표할 권한이 있음을 확인합니다.', attestationCheckbox: '위 내용이 사실이며 정확함을 확인합니다.',
    submitApplication: '신청 제출', submitting: '제출 중…', submitFailed: '신청을 제출할 수 없습니다. 다시 시도하세요.', needConsentAttest: '제출하기 전에 동의와 확인에 동의해 주세요.', submittedOk: '신청이 제출되었습니다. 아래에서 상태를 확인할 수 있습니다.',
    statusHeading: '신청 상태', statusNone: '아직 제출된 신청이 없습니다.',
    st_submitted: '제출됨 — 검토 대기 중', st_under_review: '검토 중', st_approved: '승인됨 — Golfriend 담당자가 접근 권한을 부여합니다', st_rejected: '승인되지 않음', st_info_needed: '추가 정보 필요',
    reviewNoteLabel: '검토자 메모', resubmit: '수정 후 다시 제출', missingLabel: '아직 필요함',
  },
  ja: {
    checklistHeading: '書類チェックリスト', checklistHint: '保有している書類を確認してください。安全なファイルアップロードはまだ利用できません — 保有していることを表明し、利用開始後にアップロードします。',
    doc_business_registration: '事業者登録', doc_ownership_or_authorization: 'コースの所有または権限の証明', doc_responsible_person_id: '担当者の身分証明書',
    attestHave: 'この書類を保有しています', fileUploadUnavailable: 'ファイルアップロードはまだ利用できません',
    attestationHeading: '表明', attestationText: '提供した情報が正確であり、私がこのゴルフ場を代表する権限を有することを表明します。', attestationCheckbox: '上記が真実かつ正確であることを表明します。',
    submitApplication: '申請を送信', submitting: '送信中…', submitFailed: '申請を送信できませんでした。もう一度お試しください。', needConsentAttest: '送信する前に同意と表明に同意してください。', submittedOk: '申請を送信しました。下でステータスを確認できます。',
    statusHeading: '申請ステータス', statusNone: 'まだ申請は送信されていません。',
    st_submitted: '送信済み — 審査待ち', st_under_review: '審査中', st_approved: '承認済み — Golfriend のスタッフがアクセスを設定します', st_rejected: '不承認', st_info_needed: '追加情報が必要',
    reviewNoteLabel: '審査担当者のメモ', resubmit: '修正して再送信', missingLabel: 'まだ必要',
  },
  zh: {
    checklistHeading: '文件清单', checklistHint: '确认您持有的文件。安全文件上传尚不可用 — 您声明持有这些文件，并将在开通后上传。',
    doc_business_registration: '营业执照', doc_ownership_or_authorization: '球场所有权或授权证明', doc_responsible_person_id: '负责人身份证件',
    attestHave: '我持有此文件', fileUploadUnavailable: '文件上传尚不可用',
    attestationHeading: '声明', attestationText: '本人声明所提供的信息准确无误，且本人有权代表该高尔夫球场。', attestationCheckbox: '本人声明以上内容真实准确。',
    submitApplication: '提交申请', submitting: '提交中…', submitFailed: '无法提交申请。请重试。', needConsentAttest: '提交前请接受同意和声明。', submittedOk: '申请已提交。您可在下方跟踪状态。',
    statusHeading: '申请状态', statusNone: '尚未提交申请。',
    st_submitted: '已提交 — 等待审核', st_under_review: '审核中', st_approved: '已批准 — Golfriend 工作人员将为您开通访问权限', st_rejected: '未通过', st_info_needed: '需要更多信息',
    reviewNoteLabel: '审核人备注', resubmit: '修改并重新提交', missingLabel: '仍需要',
  },
  es: {
    checklistHeading: 'Lista de documentos', checklistHint: 'Confirma los documentos que posees. La subida segura de archivos aún no está disponible: declaras que los tienes y los subirás cuando se habilite.',
    doc_business_registration: 'Registro mercantil', doc_ownership_or_authorization: 'Propiedad o autorización del campo', doc_responsible_person_id: 'Identificación del responsable',
    attestHave: 'Poseo este documento', fileUploadUnavailable: 'Subida de archivos aún no disponible',
    attestationHeading: 'Declaración', attestationText: 'Declaro que la información facilitada es exacta y que estoy autorizado para representar este campo de golf.', attestationCheckbox: 'Declaro que lo anterior es verdadero y exacto.',
    submitApplication: 'Enviar solicitud', submitting: 'Enviando…', submitFailed: 'No se pudo enviar la solicitud. Inténtalo de nuevo.', needConsentAttest: 'Acepta el consentimiento y la declaración antes de enviar.', submittedOk: 'Solicitud enviada. Puedes seguir su estado abajo.',
    statusHeading: 'Estado de la solicitud', statusNone: 'Aún no se ha enviado ninguna solicitud.',
    st_submitted: 'Enviada — pendiente de revisión', st_under_review: 'En revisión', st_approved: 'Aprobada: un miembro del equipo de Golfriend habilitará tu acceso', st_rejected: 'No aceptada', st_info_needed: 'Se necesita más información',
    reviewNoteLabel: 'Nota del revisor', resubmit: 'Actualizar y reenviar', missingLabel: 'Todavía necesario',
  },
  fr: {
    checklistHeading: 'Liste des documents', checklistHint: 'Confirmez les documents que vous détenez. Le téléversement sécurisé n’est pas encore disponible — vous attestez les détenir et les téléverserez à l’ouverture.',
    doc_business_registration: 'Immatriculation de l’entreprise', doc_ownership_or_authorization: 'Propriété ou autorisation du parcours', doc_responsible_person_id: 'Pièce d’identité du responsable',
    attestHave: 'Je détiens ce document', fileUploadUnavailable: 'Téléversement de fichiers pas encore disponible',
    attestationHeading: 'Attestation', attestationText: 'J’atteste que les informations fournies sont exactes et que je suis autorisé à représenter ce parcours de golf.', attestationCheckbox: 'J’atteste que ce qui précède est vrai et exact.',
    submitApplication: 'Envoyer la demande', submitting: 'Envoi…', submitFailed: 'Impossible d’envoyer la demande. Veuillez réessayer.', needConsentAttest: 'Veuillez accepter le consentement et l’attestation avant d’envoyer.', submittedOk: 'Demande envoyée. Vous pouvez suivre son statut ci-dessous.',
    statusHeading: 'Statut de la demande', statusNone: 'Aucune demande envoyée pour le moment.',
    st_submitted: 'Envoyée — en attente d’examen', st_under_review: 'En cours d’examen', st_approved: 'Approuvée — un membre de l’équipe Golfriend activera votre accès', st_rejected: 'Non acceptée', st_info_needed: 'Informations complémentaires requises',
    reviewNoteLabel: 'Note de l’examinateur', resubmit: 'Modifier et renvoyer', missingLabel: 'Encore nécessaire',
  },
  de: {
    checklistHeading: 'Dokumenten-Checkliste', checklistHint: 'Bestätigen Sie die Dokumente, die Sie besitzen. Sicherer Datei-Upload ist noch nicht verfügbar — Sie bestätigen, dass Sie diese besitzen, und laden sie hoch, sobald es möglich ist.',
    doc_business_registration: 'Gewerbeanmeldung', doc_ownership_or_authorization: 'Eigentums- oder Berechtigungsnachweis des Platzes', doc_responsible_person_id: 'Ausweis der verantwortlichen Person',
    attestHave: 'Ich besitze dieses Dokument', fileUploadUnavailable: 'Datei-Upload noch nicht verfügbar',
    attestationHeading: 'Bestätigung', attestationText: 'Ich bestätige, dass die angegebenen Informationen korrekt sind und dass ich berechtigt bin, diesen Golfplatz zu vertreten.', attestationCheckbox: 'Ich bestätige, dass das Obige wahr und korrekt ist.',
    submitApplication: 'Antrag senden', submitting: 'Wird gesendet…', submitFailed: 'Der Antrag konnte nicht gesendet werden. Bitte erneut versuchen.', needConsentAttest: 'Bitte akzeptieren Sie Einwilligung und Bestätigung vor dem Senden.', submittedOk: 'Antrag gesendet. Sie können den Status unten verfolgen.',
    statusHeading: 'Antragsstatus', statusNone: 'Noch kein Antrag gesendet.',
    st_submitted: 'Gesendet — wartet auf Prüfung', st_under_review: 'In Prüfung', st_approved: 'Genehmigt — ein Golfriend-Mitarbeiter richtet Ihren Zugang ein', st_rejected: 'Nicht angenommen', st_info_needed: 'Weitere Informationen erforderlich',
    reviewNoteLabel: 'Prüferhinweis', resubmit: 'Aktualisieren und erneut senden', missingLabel: 'Noch erforderlich',
  },
};
