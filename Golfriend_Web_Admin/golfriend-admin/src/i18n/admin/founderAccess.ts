// ============================================================================
// Founder / Director access-path copy — canonical eight locales.
//
// Two deliberate wording rules:
//  1. Recovery NEVER confirms whether an account exists. The same neutral
//     sentence is shown whether or not the address is registered, so the form
//     cannot be used to enumerate staff accounts.
//  2. A signed-in user with no server-owned admin_users record is told their
//     access is PENDING and to contact an administrator. It must never read as
//     an error the user can resolve themselves, and must never hint that a
//     retry, a different route or a different browser would grant access.
// ============================================================================
import type { LocaleDict } from '../dict.ts';

export type FounderAccessKey =
  | 'accessPendingTitle'
  | 'accessPendingDetail'
  | 'forgotPassword'
  | 'recoveryPrompt'
  | 'recoverySent'
  | 'recoveryUnavailable'
  | 'calibrationTitle'
  | 'calibrationDirectorRequired'
  | 'calibrationAttestationRequired'
  | 'calibrationOffline'
  | 'calibrationSixScope'
  | 'calibrationArm'
  | 'calibrationRun'
  | 'calibrationArmed'
  | 'calibrationUnavailable'
  | 'calibrationReceipt'
  | 'calibrationRequests'
  | 'calibrationRemaining';

export const FOUNDER_ACCESS: LocaleDict<FounderAccessKey> = {
  en: {
    accessPendingTitle: 'Access pending',
    accessPendingDetail: 'You are signed in, but no active administrator record exists for this account yet. Please contact your Golfriend administrator to complete access.',
    forgotPassword: 'Forgot your password?',
    recoveryPrompt: 'Enter your work email above, then request a reset link.',
    recoverySent: 'If that address has an account, a password reset link has been sent.',
    recoveryUnavailable: 'Password reset is unavailable right now. Please try again later.',
    calibrationTitle: 'Golf API cost calibration',
    calibrationDirectorRequired: 'An active Director record is required for calibration controls.',
    calibrationAttestationRequired: 'App Check attestation is required before calibration controls are available.',
    calibrationOffline: 'Calibration controls are unavailable while offline.',
    calibrationSixScope: 'Read-only evidence run. The six approved targets are locked; no catalogue record will be changed.',
    calibrationArm: 'Arm six-course calibration',
    calibrationRun: 'Run armed calibration',
    calibrationArmed: 'The locked run is armed. Run it once when ready.',
    calibrationUnavailable: 'The calibration did not complete. No catalogue record was changed; see the durable receipt.',
    calibrationReceipt: 'Receipt',
    calibrationRequests: 'Provider requests',
    calibrationRemaining: 'Provider quota remaining',
  },
  th: {
    accessPendingTitle: 'รอการอนุมัติสิทธิ์',
    accessPendingDetail: 'คุณเข้าสู่ระบบแล้ว แต่ยังไม่มีบันทึกผู้ดูแลระบบที่ใช้งานอยู่สำหรับบัญชีนี้ กรุณาติดต่อผู้ดูแลระบบ Golfriend เพื่อดำเนินการต่อ',
    forgotPassword: 'ลืมรหัสผ่านใช่หรือไม่',
    recoveryPrompt: 'กรอกอีเมลที่ทำงานด้านบน แล้วขอลิงก์ตั้งรหัสผ่านใหม่',
    recoverySent: 'หากที่อยู่นั้นมีบัญชีอยู่ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว',
    recoveryUnavailable: 'ขณะนี้ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองอีกครั้งภายหลัง',
    calibrationTitle: 'การวัดต้นทุน Golf API',
    calibrationDirectorRequired: 'ต้องมีบันทึก Director ที่ใช้งานอยู่จึงจะใช้การควบคุมนี้ได้',
    calibrationAttestationRequired: 'ต้องมีการยืนยัน App Check ก่อนจึงจะใช้การควบคุมการวัดต้นทุนได้',
    calibrationOffline: 'ไม่สามารถใช้การควบคุมการวัดต้นทุนขณะออฟไลน์',
    calibrationSixScope: 'การอ่านข้อมูลเพื่อเป็นหลักฐานเท่านั้น รายการเป้าหมายหกรายการถูกล็อกและจะไม่มีการเปลี่ยนแปลงแค็ตตาล็อก',
    calibrationArm: 'เตรียมการวัดหกสนาม',
    calibrationRun: 'เรียกใช้การวัดที่เตรียมไว้',
    calibrationArmed: 'การรันที่ล็อกไว้พร้อมแล้ว ให้เรียกใช้เพียงครั้งเดียวเมื่อพร้อม',
    calibrationUnavailable: 'การวัดไม่เสร็จสิ้น ไม่มีการเปลี่ยนแปลงแค็ตตาล็อก โปรดดูใบเสร็จถาวร',
    calibrationReceipt: 'ใบเสร็จ', calibrationRequests: 'คำขอผู้ให้บริการ', calibrationRemaining: 'โควต้าผู้ให้บริการคงเหลือ',
  },
  ko: {
    accessPendingTitle: '접근 권한 대기 중',
    accessPendingDetail: '로그인되었지만 이 계정에 대한 활성 관리자 기록이 아직 없습니다. Golfriend 관리자에게 문의하여 접근을 완료하십시오.',
    forgotPassword: '비밀번호를 잊으셨습니까?',
    recoveryPrompt: '위에 업무용 이메일을 입력한 후 재설정 링크를 요청하십시오.',
    recoverySent: '해당 주소에 계정이 있으면 비밀번호 재설정 링크가 전송되었습니다.',
    recoveryUnavailable: '현재 비밀번호 재설정을 사용할 수 없습니다. 나중에 다시 시도하십시오.',
    calibrationTitle: 'Golf API 비용 보정',
    calibrationDirectorRequired: '보정 제어에는 활성 Director 기록이 필요합니다.',
    calibrationAttestationRequired: '보정 제어를 사용하려면 App Check 증명이 필요합니다.',
    calibrationOffline: '오프라인 상태에서는 보정 제어를 사용할 수 없습니다.',
    calibrationSixScope: '읽기 전용 증거 실행입니다. 승인된 여섯 대상은 잠겨 있으며 카탈로그는 변경되지 않습니다.',
    calibrationArm: '6개 코스 보정 준비', calibrationRun: '준비된 보정 실행',
    calibrationArmed: '잠긴 실행이 준비되었습니다. 준비되면 한 번만 실행하십시오.',
    calibrationUnavailable: '보정이 완료되지 않았습니다. 카탈로그는 변경되지 않았습니다. 영구 영수증을 확인하십시오.',
    calibrationReceipt: '영수증', calibrationRequests: '공급자 요청', calibrationRemaining: '남은 공급자 할당량',
  },
  ja: {
    accessPendingTitle: 'アクセス承認待ち',
    accessPendingDetail: 'サインインは完了していますが、このアカウントの有効な管理者レコードがまだありません。Golfriend の管理者にご連絡ください。',
    forgotPassword: 'パスワードをお忘れですか？',
    recoveryPrompt: '上に業務用メールアドレスを入力し、リセットリンクを請求してください。',
    recoverySent: 'そのアドレスにアカウントがある場合、パスワード再設定リンクを送信しました。',
    recoveryUnavailable: '現在パスワードの再設定は利用できません。後ほどお試しください。',
    calibrationTitle: 'Golf API コスト計測',
    calibrationDirectorRequired: '計測操作には有効な Director レコードが必要です。',
    calibrationAttestationRequired: '計測操作の利用には App Check の検証が必要です。',
    calibrationOffline: 'オフラインでは計測操作を利用できません。',
    calibrationSixScope: '読み取り専用の証跡実行です。承認済みの6対象は固定され、カタログは変更されません。',
    calibrationArm: '6コース計測をアーム', calibrationRun: 'アーム済み計測を実行', calibrationArmed: '固定された実行が準備されました。準備ができたら一度だけ実行してください。', calibrationUnavailable: '計測は完了しませんでした。カタログは変更されていません。永続レシートを確認してください。', calibrationReceipt: 'レシート', calibrationRequests: 'プロバイダー要求', calibrationRemaining: 'プロバイダー残量',
  },
  zh: {
    accessPendingTitle: '访问权限待批',
    accessPendingDetail: '您已登录，但该账户尚无有效的管理员记录。请联系 Golfriend 管理员以完成访问授权。',
    forgotPassword: '忘记密码？',
    recoveryPrompt: '请在上方输入工作邮箱，然后申请重置链接。',
    recoverySent: '如果该地址已注册账户，重置密码的链接已发送。',
    recoveryUnavailable: '目前无法重置密码，请稍后再试。',
    calibrationTitle: 'Golf API 成本校准',
    calibrationDirectorRequired: '校准控制需要有效的 Director 记录。',
    calibrationAttestationRequired: '使用校准控制前需要通过 App Check 验证。',
    calibrationOffline: '离线状态下无法使用校准控制。',
    calibrationSixScope: '这是只读取证运行。六个获准目标已锁定，不会更改目录。',
    calibrationArm: '准备六球场校准', calibrationRun: '运行已准备的校准', calibrationArmed: '锁定运行已准备好，请在准备好时仅运行一次。', calibrationUnavailable: '校准未完成。目录未被更改；请查看持久收据。', calibrationReceipt: '收据', calibrationRequests: '提供商请求', calibrationRemaining: '剩余提供商配额',
  },
  es: {
    accessPendingTitle: 'Acceso pendiente',
    accessPendingDetail: 'Ha iniciado sesión, pero aún no existe un registro de administrador activo para esta cuenta. Contacte con su administrador de Golfriend para completar el acceso.',
    forgotPassword: '¿Olvidó su contraseña?',
    recoveryPrompt: 'Introduzca su correo de trabajo arriba y solicite un enlace de restablecimiento.',
    recoverySent: 'Si esa dirección tiene una cuenta, se ha enviado un enlace para restablecer la contraseña.',
    recoveryUnavailable: 'El restablecimiento de contraseña no está disponible ahora. Inténtelo más tarde.',
    calibrationTitle: 'Calibración de coste de Golf API',
    calibrationDirectorRequired: 'Se requiere un registro de Director activo para los controles de calibración.',
    calibrationAttestationRequired: 'Se requiere la atestación de App Check antes de usar los controles de calibración.',
    calibrationOffline: 'Los controles de calibración no están disponibles sin conexión.',
    calibrationSixScope: 'Ejecución de evidencia de solo lectura. Los seis objetivos aprobados están bloqueados y no se cambiará el catálogo.',
    calibrationArm: 'Armar calibración de seis campos', calibrationRun: 'Ejecutar calibración armada', calibrationArmed: 'La ejecución bloqueada está armada. Ejecútela una sola vez cuando esté listo.', calibrationUnavailable: 'La calibración no se completó. El catálogo no cambió; consulte el recibo durable.', calibrationReceipt: 'Recibo', calibrationRequests: 'Solicitudes al proveedor', calibrationRemaining: 'Cuota restante del proveedor',
  },
  fr: {
    accessPendingTitle: 'Accès en attente',
    accessPendingDetail: 'Vous êtes connecté, mais aucun enregistrement administrateur actif n’existe encore pour ce compte. Contactez votre administrateur Golfriend pour finaliser l’accès.',
    forgotPassword: 'Mot de passe oublié ?',
    recoveryPrompt: 'Saisissez votre e-mail professionnel ci-dessus, puis demandez un lien de réinitialisation.',
    recoverySent: 'Si cette adresse correspond à un compte, un lien de réinitialisation a été envoyé.',
    recoveryUnavailable: 'La réinitialisation du mot de passe est indisponible pour le moment. Réessayez plus tard.',
    calibrationTitle: 'Étalonnage du coût Golf API',
    calibrationDirectorRequired: 'Un enregistrement Director actif est requis pour les commandes d’étalonnage.',
    calibrationAttestationRequired: 'L’attestation App Check est requise avant d’accéder aux commandes d’étalonnage.',
    calibrationOffline: 'Les commandes d’étalonnage sont indisponibles hors ligne.',
    calibrationSixScope: 'Exécution de preuve en lecture seule. Les six cibles approuvées sont verrouillées et le catalogue ne changera pas.',
    calibrationArm: 'Armer l’étalonnage de six parcours', calibrationRun: 'Exécuter l’étalonnage armé', calibrationArmed: 'L’exécution verrouillée est armée. Lancez-la une seule fois lorsque vous êtes prêt.', calibrationUnavailable: 'L’étalonnage n’est pas terminé. Le catalogue n’a pas changé ; consultez le reçu durable.', calibrationReceipt: 'Reçu', calibrationRequests: 'Requêtes fournisseur', calibrationRemaining: 'Quota fournisseur restant',
  },
  de: {
    accessPendingTitle: 'Zugang ausstehend',
    accessPendingDetail: 'Sie sind angemeldet, aber für dieses Konto besteht noch kein aktiver Administratoreintrag. Bitte wenden Sie sich an Ihre Golfriend-Administration, um den Zugang abzuschließen.',
    forgotPassword: 'Passwort vergessen?',
    recoveryPrompt: 'Geben Sie oben Ihre dienstliche E-Mail-Adresse ein und fordern Sie einen Zurücksetzungslink an.',
    recoverySent: 'Falls für diese Adresse ein Konto besteht, wurde ein Link zum Zurücksetzen des Passworts gesendet.',
    recoveryUnavailable: 'Das Zurücksetzen des Passworts ist derzeit nicht verfügbar. Bitte später erneut versuchen.',
    calibrationTitle: 'Golf-API-Kostenkalibrierung',
    calibrationDirectorRequired: 'Für die Kalibrierungssteuerung ist ein aktiver Director-Eintrag erforderlich.',
    calibrationAttestationRequired: 'Vor der Nutzung der Kalibrierungssteuerung ist eine App-Check-Attestierung erforderlich.',
    calibrationOffline: 'Die Kalibrierungssteuerung ist offline nicht verfügbar.',
    calibrationSixScope: 'Schreibgeschützter Evidenzlauf. Die sechs genehmigten Ziele sind gesperrt; der Katalog wird nicht geändert.',
    calibrationArm: 'Sechs-Platz-Kalibrierung scharf schalten', calibrationRun: 'Scharf geschaltete Kalibrierung starten', calibrationArmed: 'Der gesperrte Lauf ist bereit. Starten Sie ihn bei Bedarf genau einmal.', calibrationUnavailable: 'Die Kalibrierung wurde nicht abgeschlossen. Der Katalog blieb unverändert; prüfen Sie den dauerhaften Beleg.', calibrationReceipt: 'Beleg', calibrationRequests: 'Anbieteranfragen', calibrationRemaining: 'Verbleibendes Anbieter-Kontingent',
  },
};
