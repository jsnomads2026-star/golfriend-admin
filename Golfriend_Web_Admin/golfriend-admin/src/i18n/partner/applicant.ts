// Applicant zone copy. Exactly the canonical eight locales, independently written.
//
// The wording is deliberately careful on one point: choosing Small Business or Enterprise
// starts an APPLICATION, not authority. Nothing here may imply approval, activation, a
// started trial, or Portal access.

export type ApplicantView = 'application' | 'status' | 'documents' | 'agreement' | 'review';

export const APPLICANT_LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;
export type ApplicantLocale = typeof APPLICANT_LOCALES[number];

export interface ApplicantCopy {
  smallBusiness: string; enterprise: string;
  notAuthority: string; signInRequired: string; verifyRequired: string;
  loading: string; error: string; offline: string;
  ready: string; submitted: string; informationNeeded: string; rejected: string; suspended: string;
  approved: string; enterPortal: string; legalPending: string;
  documents: string; agreement: string; review: string; status: string; unknown: string;
  invitation: string;
}

export const APPLICANT_COPY: Record<ApplicantLocale, ApplicantCopy> = {
  en: {
    smallBusiness: 'Small Business application', enterprise: 'Enterprise application',
    notAuthority: 'Choosing a partnership type starts an application. It does not create an account, grant Portal access, approve you, or start a trial. Golfriend Admin reviews every application.',
    signInRequired: 'Sign in to start or resume your application.',
    verifyRequired: 'Verify your contact details before saving or submitting. You can read this page without verifying.',
    loading: 'Loading your application…', error: 'The application service is unavailable. Nothing was saved or submitted.',
    offline: 'You are offline. Reconnect to save or submit.',
    ready: 'Draft — saved changes can be resumed at any time.', submitted: 'Submitted — awaiting Admin review.',
    informationNeeded: 'Information requested — Admin needs more from you before deciding.',
    rejected: 'Not approved. You may contact support or submit a new application.',
    suspended: 'This application is suspended. Contact support.',
    approved: 'Approved and activated. Your Portal is ready.', enterPortal: 'Enter Partner Portal',
    legalPending: 'Final legal wording is pending legal approval.',
    invitation: 'Partner staff invitation',
    documents: 'Documents', agreement: 'Agreement', review: 'Review', status: 'Status',
    unknown: 'The result of that action is unknown. Reload before trying again.',
  },
  th: {
    smallBusiness: 'ใบสมัคร Small Business', enterprise: 'ใบสมัคร Enterprise',
    notAuthority: 'การเลือกประเภทความร่วมมือคือการเริ่มใบสมัคร ไม่ใช่การสร้างบัญชี ไม่ให้สิทธิ์เข้าพอร์ทัล ไม่ใช่การอนุมัติ และไม่ได้เริ่มช่วงทดลอง Golfriend Admin จะตรวจสอบทุกใบสมัคร',
    signInRequired: 'เข้าสู่ระบบเพื่อเริ่มหรือทำใบสมัครต่อ',
    verifyRequired: 'ยืนยันข้อมูลติดต่อก่อนบันทึกหรือส่ง คุณอ่านหน้านี้ได้โดยไม่ต้องยืนยัน',
    loading: 'กำลังโหลดใบสมัคร…', error: 'บริการใบสมัครไม่พร้อมใช้งาน ไม่มีการบันทึกหรือส่ง',
    offline: 'คุณออฟไลน์อยู่ เชื่อมต่อใหม่เพื่อบันทึกหรือส่ง',
    ready: 'ฉบับร่าง — บันทึกแล้วและกลับมาทำต่อได้', submitted: 'ส่งแล้ว — รอ Admin ตรวจสอบ',
    informationNeeded: 'ต้องการข้อมูลเพิ่มเติม — Admin ขอข้อมูลก่อนตัดสินใจ',
    rejected: 'ไม่ได้รับอนุมัติ คุณติดต่อฝ่ายสนับสนุนหรือยื่นใบสมัครใหม่ได้',
    suspended: 'ใบสมัครนี้ถูกระงับ โปรดติดต่อฝ่ายสนับสนุน',
    approved: 'อนุมัติและเปิดใช้งานแล้ว พอร์ทัลของคุณพร้อมแล้ว', enterPortal: 'เข้าสู่ Partner Portal',
    legalPending: 'ถ้อยคำทางกฎหมายฉบับสุดท้ายอยู่ระหว่างรอการอนุมัติทางกฎหมาย',
    invitation: 'คำเชิญพนักงานพันธมิตร',
    documents: 'เอกสาร', agreement: 'ข้อตกลง', review: 'ตรวจทาน', status: 'สถานะ',
    unknown: 'ไม่ทราบผลของการดำเนินการนั้น โปรดโหลดใหม่ก่อนลองอีกครั้ง',
  },
  ko: {
    smallBusiness: 'Small Business 신청', enterprise: 'Enterprise 신청',
    notAuthority: '파트너 유형 선택은 신청서를 시작하는 것입니다. 계정 생성, 포털 접근 권한 부여, 승인 또는 체험 시작이 아닙니다. Golfriend Admin이 모든 신청서를 검토합니다.',
    signInRequired: '신청을 시작하거나 이어가려면 로그인하세요.',
    verifyRequired: '저장하거나 제출하기 전에 연락처를 인증하세요. 인증 없이도 이 페이지는 읽을 수 있습니다.',
    loading: '신청서를 불러오는 중…', error: '신청 서비스를 사용할 수 없습니다. 저장되거나 제출된 것은 없습니다.',
    offline: '오프라인입니다. 저장하거나 제출하려면 다시 연결하세요.',
    ready: '초안 — 저장되었으며 언제든 이어서 작성할 수 있습니다.', submitted: '제출됨 — Admin 검토 대기 중입니다.',
    informationNeeded: '정보 요청됨 — 결정 전에 Admin이 추가 정보를 필요로 합니다.',
    rejected: '승인되지 않았습니다. 지원팀에 문의하거나 새 신청서를 제출할 수 있습니다.',
    suspended: '이 신청서는 중지되었습니다. 지원팀에 문의하세요.',
    approved: '승인 및 활성화되었습니다. 포털이 준비되었습니다.', enterPortal: 'Partner Portal 입장',
    legalPending: '최종 법률 문구는 법무 승인 대기 중입니다.',
    invitation: '파트너 스태프 초대',
    documents: '서류', agreement: '계약서', review: '검토', status: '상태',
    unknown: '해당 작업의 결과를 알 수 없습니다. 다시 시도하기 전에 새로 고치세요.',
  },
  ja: {
    smallBusiness: 'Small Business 申請', enterprise: 'Enterprise 申請',
    notAuthority: 'パートナー種別の選択は申請の開始です。アカウント作成、ポータルへのアクセス付与、承認、トライアル開始のいずれでもありません。Golfriend Admin がすべての申請を審査します。',
    signInRequired: '申請を開始または再開するにはサインインしてください。',
    verifyRequired: '保存または送信の前に連絡先を確認してください。確認なしでもこのページは閲覧できます。',
    loading: '申請を読み込み中…', error: '申請サービスを利用できません。保存も送信もされていません。',
    offline: 'オフラインです。保存または送信するには再接続してください。',
    ready: '下書き — 保存済みで、いつでも再開できます。', submitted: '送信済み — Admin の審査待ちです。',
    informationNeeded: '情報の依頼 — 判断の前に Admin が追加情報を必要としています。',
    rejected: '承認されませんでした。サポートに連絡するか、新しい申請を送信できます。',
    suspended: 'この申請は停止されています。サポートにご連絡ください。',
    approved: '承認・有効化されました。ポータルをご利用いただけます。', enterPortal: 'Partner Portal に入る',
    legalPending: '最終的な法的文言は法務承認待ちです。',
    invitation: 'パートナースタッフ招待',
    documents: '書類', agreement: '契約', review: '確認', status: 'ステータス',
    unknown: 'その操作の結果は不明です。再試行の前に再読み込みしてください。',
  },
  zh: {
    smallBusiness: 'Small Business 申请', enterprise: 'Enterprise 申请',
    notAuthority: '选择合作类型只是开始一份申请。它不会创建账户、授予门户访问权限、代表批准，也不会启动试用。Golfriend Admin 会审核每一份申请。',
    signInRequired: '请登录以开始或继续你的申请。',
    verifyRequired: '在保存或提交前请验证联系方式。未验证也可以阅读本页。',
    loading: '正在加载你的申请…', error: '申请服务不可用。没有保存或提交任何内容。',
    offline: '你当前离线。请重新连接后保存或提交。',
    ready: '草稿 — 已保存，可随时继续。', submitted: '已提交 — 等待 Admin 审核。',
    informationNeeded: '需要补充信息 — Admin 在决定前需要更多材料。',
    rejected: '未获批准。你可以联系支持或提交新的申请。',
    suspended: '该申请已被暂停。请联系支持。',
    approved: '已批准并激活。你的门户已就绪。', enterPortal: '进入 Partner Portal',
    legalPending: '最终法律文本仍在等待法务批准。',
    invitation: '合作方员工邀请',
    documents: '文件', agreement: '协议', review: '复核', status: '状态',
    unknown: '该操作结果未知。请重新加载后再试。',
  },
  es: {
    smallBusiness: 'Solicitud Small Business', enterprise: 'Solicitud Enterprise',
    notAuthority: 'Elegir un tipo de colaboración inicia una solicitud. No crea una cuenta, no concede acceso al Portal, no supone aprobación ni inicia una prueba. Golfriend Admin revisa cada solicitud.',
    signInRequired: 'Inicia sesión para comenzar o retomar tu solicitud.',
    verifyRequired: 'Verifica tus datos de contacto antes de guardar o enviar. Puedes leer esta página sin verificar.',
    loading: 'Cargando tu solicitud…', error: 'El servicio de solicitudes no está disponible. No se guardó ni se envió nada.',
    offline: 'Estás sin conexión. Reconéctate para guardar o enviar.',
    ready: 'Borrador: guardado y puedes retomarlo cuando quieras.', submitted: 'Enviada: pendiente de revisión por Admin.',
    informationNeeded: 'Información solicitada: Admin necesita más datos antes de decidir.',
    rejected: 'No aprobada. Puedes contactar con soporte o enviar una nueva solicitud.',
    suspended: 'Esta solicitud está suspendida. Contacta con soporte.',
    approved: 'Aprobada y activada. Tu Portal está listo.', enterPortal: 'Entrar al Partner Portal',
    legalPending: 'El texto legal definitivo está pendiente de aprobación legal.',
    invitation: 'Invitación de personal asociado',
    documents: 'Documentos', agreement: 'Acuerdo', review: 'Revisión', status: 'Estado',
    unknown: 'Se desconoce el resultado de esa acción. Recarga antes de reintentar.',
  },
  fr: {
    smallBusiness: 'Candidature Small Business', enterprise: 'Candidature Enterprise',
    notAuthority: "Choisir un type de partenariat démarre une candidature. Cela ne crée pas de compte, n'accorde pas l'accès au Portail, ne vaut pas approbation et ne déclenche aucune période d'essai. Golfriend Admin examine chaque candidature.",
    signInRequired: 'Connectez-vous pour commencer ou reprendre votre candidature.',
    verifyRequired: 'Vérifiez vos coordonnées avant d’enregistrer ou d’envoyer. Vous pouvez lire cette page sans vérification.',
    loading: 'Chargement de votre candidature…', error: "Le service de candidature est indisponible. Rien n'a été enregistré ni envoyé.",
    offline: 'Vous êtes hors ligne. Reconnectez-vous pour enregistrer ou envoyer.',
    ready: 'Brouillon — enregistré, vous pouvez reprendre à tout moment.', submitted: 'Envoyée — en attente d’examen par Admin.',
    informationNeeded: 'Informations demandées — Admin a besoin de compléments avant de décider.',
    rejected: 'Non approuvée. Vous pouvez contacter le support ou déposer une nouvelle candidature.',
    suspended: 'Cette candidature est suspendue. Contactez le support.',
    approved: 'Approuvée et activée. Votre Portail est prêt.', enterPortal: 'Accéder au Partner Portal',
    legalPending: 'Le texte juridique définitif est en attente d’approbation juridique.',
    invitation: 'Invitation de personnel partenaire',
    documents: 'Documents', agreement: 'Accord', review: 'Vérification', status: 'Statut',
    unknown: 'Le résultat de cette action est inconnu. Rechargez avant de réessayer.',
  },
  de: {
    smallBusiness: 'Small-Business-Bewerbung', enterprise: 'Enterprise-Bewerbung',
    notAuthority: 'Die Wahl einer Partnerschaftsart startet eine Bewerbung. Sie erstellt kein Konto, gewährt keinen Portalzugang, bedeutet keine Genehmigung und startet keine Testphase. Golfriend Admin prüft jede Bewerbung.',
    signInRequired: 'Melden Sie sich an, um Ihre Bewerbung zu beginnen oder fortzusetzen.',
    verifyRequired: 'Bestätigen Sie Ihre Kontaktdaten vor dem Speichern oder Senden. Diese Seite können Sie ohne Bestätigung lesen.',
    loading: 'Ihre Bewerbung wird geladen…', error: 'Der Bewerbungsdienst ist nicht verfügbar. Es wurde nichts gespeichert oder gesendet.',
    offline: 'Sie sind offline. Stellen Sie die Verbindung wieder her, um zu speichern oder zu senden.',
    ready: 'Entwurf — gespeichert und jederzeit fortsetzbar.', submitted: 'Eingereicht — wartet auf die Admin-Prüfung.',
    informationNeeded: 'Informationen angefordert — Admin benötigt vor der Entscheidung mehr von Ihnen.',
    rejected: 'Nicht genehmigt. Sie können den Support kontaktieren oder eine neue Bewerbung einreichen.',
    suspended: 'Diese Bewerbung ist ausgesetzt. Bitte kontaktieren Sie den Support.',
    approved: 'Genehmigt und aktiviert. Ihr Portal ist bereit.', enterPortal: 'Zum Partner Portal',
    legalPending: 'Der endgültige Rechtstext steht noch unter juristischem Genehmigungsvorbehalt.',
    invitation: 'Einladung für Partnerpersonal',
    documents: 'Dokumente', agreement: 'Vereinbarung', review: 'Prüfung', status: 'Status',
    unknown: 'Das Ergebnis dieser Aktion ist unbekannt. Bitte neu laden, bevor Sie es erneut versuchen.',
  },
};

export const applicantCopy = (locale: string): ApplicantCopy =>
  APPLICANT_COPY[(APPLICANT_LOCALES as readonly string[]).includes(locale) ? (locale as ApplicantLocale) : 'en'];
