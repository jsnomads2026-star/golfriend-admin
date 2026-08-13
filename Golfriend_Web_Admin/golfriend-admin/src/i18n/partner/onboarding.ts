// Eight-locale strings for the partner Onboarding hub (L1 slice 5).
// A resumable checklist that reflects real progress and links to each step.
import type { LocaleDict } from '../dict.ts';

export type OnbKey =
  | 'title' | 'subtitle' | 'resumeHint' | 'allDone'
  | 'stepSignIn' | 'stepSignInDesc'
  | 'stepCourse' | 'stepCourseDesc'
  | 'stepAvailability' | 'stepAvailabilityDesc'
  | 'stepDocuments' | 'stepDocumentsDesc'
  | 'done' | 'pending' | 'continueBtn';

export const ONBOARDING: LocaleDict<OnbKey> = {
  en: {
    title: 'Getting started', subtitle: 'Complete these steps to go live. Your progress is saved — you can leave and resume anytime.',
    resumeHint: 'Continue where you left off:', allDone: 'All steps complete. Your course is ready to receive golfers.',
    stepSignIn: 'Sign in', stepSignInDesc: 'You are signed in to the partner portal.',
    stepCourse: 'Onboard your course', stepCourseDesc: 'Claim the course you operate.',
    stepAvailability: 'Publish availability', stepAvailabilityDesc: 'Add bookable tee-times for your course.',
    stepDocuments: 'Documents & consent', stepDocumentsDesc: 'Prepare verification documents and accept the consent.',
    done: 'Done', pending: 'To do', continueBtn: 'Continue',
  },
  th: {
    title: 'เริ่มต้นใช้งาน', subtitle: 'ทำตามขั้นตอนเหล่านี้ให้ครบเพื่อเปิดใช้งาน ระบบบันทึกความคืบหน้าของคุณไว้ — คุณออกแล้วกลับมาทำต่อได้ทุกเมื่อ',
    resumeHint: 'ทำต่อจากที่ค้างไว้:', allDone: 'ทำครบทุกขั้นตอนแล้ว สนามของคุณพร้อมรับนักกอล์ฟแล้ว',
    stepSignIn: 'เข้าสู่ระบบ', stepSignInDesc: 'คุณเข้าสู่ระบบพอร์ทัลพันธมิตรแล้ว',
    stepCourse: 'ลงทะเบียนสนามของคุณ', stepCourseDesc: 'อ้างสิทธิ์สนามที่คุณดูแล',
    stepAvailability: 'เผยแพร่ตารางว่าง', stepAvailabilityDesc: 'เพิ่มเวลาออกรอบที่จองได้สำหรับสนามของคุณ',
    stepDocuments: 'เอกสารและการยินยอม', stepDocumentsDesc: 'เตรียมเอกสารยืนยันตัวตนและยอมรับคำยินยอม',
    done: 'เสร็จแล้ว', pending: 'ยังไม่ทำ', continueBtn: 'ทำต่อ',
  },
  ko: {
    title: '시작하기', subtitle: '라이브로 전환하려면 다음 단계를 완료하세요. 진행 상황이 저장되어 언제든 나갔다가 다시 이어서 할 수 있습니다.',
    resumeHint: '이어서 진행하기:', allDone: '모든 단계를 완료했습니다. 코스가 골퍼를 맞이할 준비가 되었습니다.',
    stepSignIn: '로그인', stepSignInDesc: '파트너 포털에 로그인되어 있습니다.',
    stepCourse: '코스 등록', stepCourseDesc: '운영하는 코스를 등록하세요.',
    stepAvailability: '예약 가능 시간 게시', stepAvailabilityDesc: '코스에 예약 가능한 티타임을 추가하세요.',
    stepDocuments: '문서 및 동의', stepDocumentsDesc: '인증 문서를 준비하고 동의에 동의하세요.',
    done: '완료', pending: '할 일', continueBtn: '계속',
  },
  ja: {
    title: 'はじめに', subtitle: '公開するには次のステップを完了してください。進捗は保存され、いつでも中断して再開できます。',
    resumeHint: '続きから再開:', allDone: 'すべてのステップが完了しました。コースはゴルファーを迎える準備ができています。',
    stepSignIn: 'サインイン', stepSignInDesc: 'パートナーポータルにサインインしています。',
    stepCourse: 'コースを登録', stepCourseDesc: '運営するコースを登録します。',
    stepAvailability: '空き状況を公開', stepAvailabilityDesc: 'コースに予約可能なスタート時間を追加します。',
    stepDocuments: '書類と同意', stepDocumentsDesc: '認証書類を準備し、同意に同意します。',
    done: '完了', pending: '未完了', continueBtn: '続ける',
  },
  zh: {
    title: '开始使用', subtitle: '完成以下步骤即可上线。您的进度会被保存 — 可随时离开并继续。',
    resumeHint: '从上次的位置继续:', allDone: '所有步骤已完成。您的球场已准备好接待球员。',
    stepSignIn: '登录', stepSignInDesc: '您已登录合作伙伴门户。',
    stepCourse: '登记您的球场', stepCourseDesc: '认领您运营的球场。',
    stepAvailability: '发布可预订时间', stepAvailabilityDesc: '为您的球场添加可预订的开球时间。',
    stepDocuments: '文件与同意', stepDocumentsDesc: '准备验证文件并接受同意条款。',
    done: '已完成', pending: '待办', continueBtn: '继续',
  },
  es: {
    title: 'Primeros pasos', subtitle: 'Completa estos pasos para activarte. Tu progreso se guarda: puedes salir y continuar cuando quieras.',
    resumeHint: 'Continúa donde lo dejaste:', allDone: 'Todos los pasos completados. Tu campo está listo para recibir golfistas.',
    stepSignIn: 'Iniciar sesión', stepSignInDesc: 'Has iniciado sesión en el portal de socios.',
    stepCourse: 'Incorpora tu campo', stepCourseDesc: 'Reclama el campo que operas.',
    stepAvailability: 'Publicar disponibilidad', stepAvailabilityDesc: 'Añade horas de salida reservables para tu campo.',
    stepDocuments: 'Documentos y consentimiento', stepDocumentsDesc: 'Prepara los documentos de verificación y acepta el consentimiento.',
    done: 'Hecho', pending: 'Pendiente', continueBtn: 'Continuar',
  },
  fr: {
    title: 'Prise en main', subtitle: 'Complétez ces étapes pour passer en ligne. Votre progression est enregistrée — vous pouvez partir et reprendre à tout moment.',
    resumeHint: 'Reprenez où vous en étiez :', allDone: 'Toutes les étapes sont terminées. Votre parcours est prêt à accueillir des golfeurs.',
    stepSignIn: 'Connexion', stepSignInDesc: 'Vous êtes connecté au portail partenaires.',
    stepCourse: 'Intégrez votre parcours', stepCourseDesc: 'Revendiquez le parcours que vous exploitez.',
    stepAvailability: 'Publier les disponibilités', stepAvailabilityDesc: 'Ajoutez des départs réservables pour votre parcours.',
    stepDocuments: 'Documents et consentement', stepDocumentsDesc: 'Préparez les documents de vérification et acceptez le consentement.',
    done: 'Terminé', pending: 'À faire', continueBtn: 'Continuer',
  },
  de: {
    title: 'Erste Schritte', subtitle: 'Schließen Sie diese Schritte ab, um live zu gehen. Ihr Fortschritt wird gespeichert — Sie können jederzeit pausieren und fortfahren.',
    resumeHint: 'Dort weitermachen, wo Sie aufgehört haben:', allDone: 'Alle Schritte abgeschlossen. Ihr Platz ist bereit, Golfer zu empfangen.',
    stepSignIn: 'Anmelden', stepSignInDesc: 'Sie sind im Partnerportal angemeldet.',
    stepCourse: 'Platz einbinden', stepCourseDesc: 'Beanspruchen Sie den von Ihnen betriebenen Platz.',
    stepAvailability: 'Verfügbarkeit veröffentlichen', stepAvailabilityDesc: 'Fügen Sie buchbare Abschlagszeiten für Ihren Platz hinzu.',
    stepDocuments: 'Dokumente & Einwilligung', stepDocumentsDesc: 'Bereiten Sie Verifizierungsdokumente vor und akzeptieren Sie die Einwilligung.',
    done: 'Erledigt', pending: 'Offen', continueBtn: 'Weiter',
  },
};
