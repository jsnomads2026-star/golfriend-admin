// Eight-locale strings for the partner Documents & Consent surface (L1 slice 4).
// Client-side only: prepare documents + capture consent locally. Actual
// submission is honestly unavailable until the backend is commissioned.
import type { LocaleDict } from '../dict.ts';

export type DocKey =
  | 'title' | 'subtitle'
  | 'uploadHeading' | 'chooseFiles' | 'fileHint' | 'noFiles' | 'selectedFiles' | 'remove' | 'removeAria'
  | 'consentHeading' | 'consentBody' | 'consentCheckbox' | 'consentRequired'
  | 'saveDraft' | 'draftSaved' | 'draftRestored'
  | 'submit' | 'submitUnavailable';

export const DOCUMENTS: LocaleDict<DocKey> = {
  en: {
    title: 'Documents & Consent',
    subtitle: 'Prepare the documents that verify your course, review the consent, and save a draft. You can return and finish later.',
    uploadHeading: 'Verification documents',
    chooseFiles: 'Choose files', fileHint: 'Business registration, course ownership or authorization, and an ID of the responsible person.',
    noFiles: 'No documents selected yet.', selectedFiles: 'Selected documents', remove: 'Remove', removeAria: 'Remove document',
    consentHeading: 'Consent', consentBody: 'I confirm I am authorized to represent this golf course and I consent to Golfriend processing the submitted documents to verify the course and enable partner features. I understand the original submission is kept as the record of truth.',
    consentCheckbox: 'I have read and agree to the consent above.', consentRequired: 'Please read and accept the consent before submitting.',
    saveDraft: 'Save draft', draftSaved: 'Draft saved on this device.', draftRestored: 'Your saved draft was restored.',
    submit: 'Submit for verification', submitUnavailable: 'Submission is not yet available — document intake is being commissioned. Your draft and consent are saved on this device so you can submit as soon as it opens.',
  },
  th: {
    title: 'เอกสารและการยินยอม',
    subtitle: 'เตรียมเอกสารที่ใช้ยืนยันสนามของคุณ อ่านคำยินยอม และบันทึกฉบับร่าง คุณสามารถกลับมาทำต่อภายหลังได้',
    uploadHeading: 'เอกสารยืนยันตัวตน',
    chooseFiles: 'เลือกไฟล์', fileHint: 'ทะเบียนธุรกิจ หลักฐานความเป็นเจ้าของหรือการมอบอำนาจของสนาม และบัตรประจำตัวของผู้รับผิดชอบ',
    noFiles: 'ยังไม่ได้เลือกเอกสาร', selectedFiles: 'เอกสารที่เลือก', remove: 'นำออก', removeAria: 'นำเอกสารออก',
    consentHeading: 'การยินยอม', consentBody: 'ข้าพเจ้ายืนยันว่าได้รับอนุญาตให้เป็นตัวแทนสนามกอล์ฟแห่งนี้ และยินยอมให้ Golfriend ประมวลผลเอกสารที่ส่งเพื่อยืนยันสนามและเปิดใช้งานฟีเจอร์สำหรับพันธมิตร ข้าพเจ้าเข้าใจว่าเอกสารต้นฉบับที่ส่งจะถูกเก็บไว้เป็นหลักฐานอ้างอิง',
    consentCheckbox: 'ข้าพเจ้าได้อ่านและยอมรับคำยินยอมข้างต้นแล้ว', consentRequired: 'กรุณาอ่านและยอมรับคำยินยอมก่อนส่ง',
    saveDraft: 'บันทึกฉบับร่าง', draftSaved: 'บันทึกฉบับร่างในอุปกรณ์นี้แล้ว', draftRestored: 'กู้คืนฉบับร่างที่บันทึกไว้แล้ว',
    submit: 'ส่งเพื่อตรวจสอบ', submitUnavailable: 'ยังไม่เปิดให้ส่ง — ระบบรับเอกสารกำลังอยู่ระหว่างการเปิดใช้งาน ฉบับร่างและคำยินยอมของคุณถูกบันทึกไว้ในอุปกรณ์นี้ เพื่อให้คุณส่งได้ทันทีที่เปิดใช้งาน',
  },
  ko: {
    title: '문서 및 동의',
    subtitle: '코스를 인증할 문서를 준비하고 동의 내용을 검토한 뒤 초안을 저장하세요. 나중에 다시 돌아와 완료할 수 있습니다.',
    uploadHeading: '인증 문서',
    chooseFiles: '파일 선택', fileHint: '사업자 등록증, 코스 소유 또는 위임 증빙, 담당자 신분증.',
    noFiles: '아직 선택된 문서가 없습니다.', selectedFiles: '선택된 문서', remove: '제거', removeAria: '문서 제거',
    consentHeading: '동의', consentBody: '본인은 이 골프장을 대표할 권한이 있음을 확인하며, 코스 인증 및 파트너 기능 활성화를 위해 Golfriend가 제출된 문서를 처리하는 데 동의합니다. 제출한 원본이 진본 기록으로 보관됨을 이해합니다.',
    consentCheckbox: '위 동의 내용을 읽고 동의합니다.', consentRequired: '제출하기 전에 동의 내용을 읽고 수락해 주세요.',
    saveDraft: '초안 저장', draftSaved: '이 기기에 초안을 저장했습니다.', draftRestored: '저장된 초안이 복원되었습니다.',
    submit: '인증 제출', submitUnavailable: '아직 제출할 수 없습니다 — 문서 접수 기능을 준비 중입니다. 초안과 동의가 이 기기에 저장되어 있어 열리는 즉시 제출할 수 있습니다.',
  },
  ja: {
    title: '書類と同意',
    subtitle: 'コースを認証する書類を準備し、同意内容を確認して下書きを保存します。後で戻って完了できます。',
    uploadHeading: '認証書類',
    chooseFiles: 'ファイルを選択', fileHint: '事業者登録、コースの所有または権限の証明、担当者の身分証明書。',
    noFiles: 'まだ書類が選択されていません。', selectedFiles: '選択した書類', remove: '削除', removeAria: '書類を削除',
    consentHeading: '同意', consentBody: '私はこのゴルフ場を代表する権限があることを確認し、コースの認証およびパートナー機能の有効化のために、提出した書類を Golfriend が処理することに同意します。提出した原本が正式な記録として保管されることを理解しています。',
    consentCheckbox: '上記の同意内容を読み、同意します。', consentRequired: '送信する前に同意内容を読んで承諾してください。',
    saveDraft: '下書きを保存', draftSaved: 'この端末に下書きを保存しました。', draftRestored: '保存した下書きを復元しました。',
    submit: '認証のために送信', submitUnavailable: 'まだ送信できません — 書類受付を準備中です。下書きと同意はこの端末に保存されているので、開始次第すぐに送信できます。',
  },
  zh: {
    title: '文件与同意',
    subtitle: '准备用于验证球场的文件，查看同意条款，并保存草稿。您可以稍后返回完成。',
    uploadHeading: '验证文件',
    chooseFiles: '选择文件', fileHint: '营业执照、球场所有权或授权证明，以及负责人身份证件。',
    noFiles: '尚未选择文件。', selectedFiles: '已选文件', remove: '移除', removeAria: '移除文件',
    consentHeading: '同意', consentBody: '本人确认有权代表该高尔夫球场，并同意 Golfriend 处理所提交的文件以验证球场并启用合作伙伴功能。本人理解所提交的原件将作为真实记录予以保存。',
    consentCheckbox: '我已阅读并同意上述条款。', consentRequired: '请在提交前阅读并接受同意条款。',
    saveDraft: '保存草稿', draftSaved: '草稿已保存到本设备。', draftRestored: '已恢复您保存的草稿。',
    submit: '提交验证', submitUnavailable: '暂不可提交 — 文件受理功能正在开通中。您的草稿和同意已保存在本设备，开通后即可立即提交。',
  },
  es: {
    title: 'Documentos y consentimiento',
    subtitle: 'Prepara los documentos que verifican tu campo, revisa el consentimiento y guarda un borrador. Puedes volver y terminar más tarde.',
    uploadHeading: 'Documentos de verificación',
    chooseFiles: 'Elegir archivos', fileHint: 'Registro mercantil, propiedad o autorización del campo, y una identificación del responsable.',
    noFiles: 'Aún no hay documentos seleccionados.', selectedFiles: 'Documentos seleccionados', remove: 'Quitar', removeAria: 'Quitar documento',
    consentHeading: 'Consentimiento', consentBody: 'Confirmo que estoy autorizado para representar este campo de golf y doy mi consentimiento para que Golfriend procese los documentos enviados con el fin de verificar el campo y habilitar las funciones de socio. Entiendo que el envío original se conserva como registro de veracidad.',
    consentCheckbox: 'He leído y acepto el consentimiento anterior.', consentRequired: 'Lee y acepta el consentimiento antes de enviar.',
    saveDraft: 'Guardar borrador', draftSaved: 'Borrador guardado en este dispositivo.', draftRestored: 'Se restauró tu borrador guardado.',
    submit: 'Enviar para verificación', submitUnavailable: 'El envío aún no está disponible: la recepción de documentos se está habilitando. Tu borrador y consentimiento se guardan en este dispositivo para que puedas enviar en cuanto se abra.',
  },
  fr: {
    title: 'Documents et consentement',
    subtitle: 'Préparez les documents qui vérifient votre parcours, examinez le consentement et enregistrez un brouillon. Vous pouvez revenir terminer plus tard.',
    uploadHeading: 'Documents de vérification',
    chooseFiles: 'Choisir des fichiers', fileHint: 'Immatriculation de l’entreprise, propriété ou autorisation du parcours, et une pièce d’identité du responsable.',
    noFiles: 'Aucun document sélectionné pour le moment.', selectedFiles: 'Documents sélectionnés', remove: 'Retirer', removeAria: 'Retirer le document',
    consentHeading: 'Consentement', consentBody: 'Je confirme être autorisé à représenter ce parcours de golf et je consens à ce que Golfriend traite les documents soumis afin de vérifier le parcours et d’activer les fonctionnalités partenaires. Je comprends que la soumission originale est conservée comme preuve de référence.',
    consentCheckbox: 'J’ai lu et j’accepte le consentement ci-dessus.', consentRequired: 'Veuillez lire et accepter le consentement avant d’envoyer.',
    saveDraft: 'Enregistrer le brouillon', draftSaved: 'Brouillon enregistré sur cet appareil.', draftRestored: 'Votre brouillon enregistré a été restauré.',
    submit: 'Envoyer pour vérification', submitUnavailable: 'L’envoi n’est pas encore disponible — la réception des documents est en cours de mise en service. Votre brouillon et votre consentement sont enregistrés sur cet appareil pour envoyer dès l’ouverture.',
  },
  de: {
    title: 'Dokumente & Einwilligung',
    subtitle: 'Bereiten Sie die Dokumente zur Verifizierung Ihres Platzes vor, prüfen Sie die Einwilligung und speichern Sie einen Entwurf. Sie können später zurückkehren und abschließen.',
    uploadHeading: 'Verifizierungsdokumente',
    chooseFiles: 'Dateien auswählen', fileHint: 'Gewerbeanmeldung, Eigentums- oder Berechtigungsnachweis des Platzes und ein Ausweis der verantwortlichen Person.',
    noFiles: 'Noch keine Dokumente ausgewählt.', selectedFiles: 'Ausgewählte Dokumente', remove: 'Entfernen', removeAria: 'Dokument entfernen',
    consentHeading: 'Einwilligung', consentBody: 'Ich bestätige, dass ich berechtigt bin, diesen Golfplatz zu vertreten, und willige ein, dass Golfriend die eingereichten Dokumente verarbeitet, um den Platz zu verifizieren und Partnerfunktionen freizuschalten. Mir ist bewusst, dass die ursprüngliche Einreichung als maßgeblicher Nachweis aufbewahrt wird.',
    consentCheckbox: 'Ich habe die obige Einwilligung gelesen und stimme zu.', consentRequired: 'Bitte lesen und akzeptieren Sie die Einwilligung vor dem Absenden.',
    saveDraft: 'Entwurf speichern', draftSaved: 'Entwurf auf diesem Gerät gespeichert.', draftRestored: 'Ihr gespeicherter Entwurf wurde wiederhergestellt.',
    submit: 'Zur Verifizierung senden', submitUnavailable: 'Das Senden ist noch nicht verfügbar — die Dokumentannahme wird in Betrieb genommen. Ihr Entwurf und Ihre Einwilligung sind auf diesem Gerät gespeichert, damit Sie sofort nach Öffnung senden können.',
  },
};
