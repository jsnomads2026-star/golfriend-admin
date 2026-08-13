// Eight-locale strings for the honest access-state screens and admin/partner
// sign-in chrome shown during access resolution (L1 slice 1).
import type { LocaleDict } from '../dict.ts';

export type AccessKey =
  | 'auth_pending'
  | 'signed_out'
  | 'role_resolving'
  | 'error'
  | 'unauthorized'
  | 'suspended'
  | 'returnStorefront'
  | 'signOut'
  | 'adminTitle'
  | 'adminAria'
  | 'email'
  | 'password'
  | 'adminSignIn'
  | 'signInFailed';

export const ACCESS_STATES: LocaleDict<AccessKey> = {
  en: {
    auth_pending: 'Establishing secure session…',
    signed_out: 'Sign in required',
    role_resolving: 'Verifying your access…',
    error: 'We could not verify your access right now. Please retry.',
    unauthorized: 'This account is not authorized for this portal.',
    suspended: 'This account’s access is currently suspended.',
    returnStorefront: 'Return to Storefront',
    signOut: 'Sign out',
    adminTitle: 'GOLFRIEND ADMIN SIGN-IN',
    adminAria: 'Admin sign-in',
    email: 'Email',
    password: 'Password',
    adminSignIn: 'SIGN IN',
    signInFailed: 'Sign-in failed. Check your credentials and try again.',
  },
  th: {
    auth_pending: 'กำลังสร้างเซสชันที่ปลอดภัย…',
    signed_out: 'ต้องเข้าสู่ระบบ',
    role_resolving: 'กำลังตรวจสอบสิทธิ์การเข้าถึงของคุณ…',
    error: 'ขณะนี้เราไม่สามารถยืนยันสิทธิ์การเข้าถึงของคุณได้ กรุณาลองใหม่',
    unauthorized: 'บัญชีนี้ไม่ได้รับอนุญาตให้ใช้พอร์ทัลนี้',
    suspended: 'สิทธิ์การเข้าถึงของบัญชีนี้ถูกระงับชั่วคราว',
    returnStorefront: 'กลับไปที่หน้าร้าน',
    signOut: 'ออกจากระบบ',
    adminTitle: 'เข้าสู่ระบบผู้ดูแล GOLFRIEND',
    adminAria: 'การเข้าสู่ระบบผู้ดูแล',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    adminSignIn: 'เข้าสู่ระบบ',
    signInFailed: 'เข้าสู่ระบบไม่สำเร็จ โปรดตรวจสอบข้อมูลรับรองของคุณแล้วลองอีกครั้ง',
  },
  ko: {
    auth_pending: '보안 세션을 설정하는 중…',
    signed_out: '로그인이 필요합니다',
    role_resolving: '접근 권한을 확인하는 중…',
    error: '지금은 접근 권한을 확인할 수 없습니다. 다시 시도해 주세요.',
    unauthorized: '이 계정은 이 포털에 대한 권한이 없습니다.',
    suspended: '이 계정의 접근 권한이 현재 정지되었습니다.',
    returnStorefront: '스토어로 돌아가기',
    signOut: '로그아웃',
    adminTitle: 'GOLFRIEND 관리자 로그인',
    adminAria: '관리자 로그인',
    email: '이메일',
    password: '비밀번호',
    adminSignIn: '로그인',
    signInFailed: '로그인에 실패했습니다. 자격 증명을 확인하고 다시 시도하세요.',
  },
  ja: {
    auth_pending: '安全なセッションを確立しています…',
    signed_out: 'サインインが必要です',
    role_resolving: 'アクセス権を確認しています…',
    error: '現在アクセス権を確認できませんでした。もう一度お試しください。',
    unauthorized: 'このアカウントはこのポータルへのアクセスを許可されていません。',
    suspended: 'このアカウントのアクセスは現在停止されています。',
    returnStorefront: 'ストアフロントに戻る',
    signOut: 'サインアウト',
    adminTitle: 'GOLFRIEND 管理者サインイン',
    adminAria: '管理者サインイン',
    email: 'メールアドレス',
    password: 'パスワード',
    adminSignIn: 'サインイン',
    signInFailed: 'サインインに失敗しました。認証情報を確認して、もう一度お試しください。',
  },
  zh: {
    auth_pending: '正在建立安全会话…',
    signed_out: '需要登录',
    role_resolving: '正在验证您的访问权限…',
    error: '目前无法验证您的访问权限。请重试。',
    unauthorized: '此账户无权访问此门户。',
    suspended: '此账户的访问权限当前已被暂停。',
    returnStorefront: '返回商店',
    signOut: '退出登录',
    adminTitle: 'GOLFRIEND 管理员登录',
    adminAria: '管理员登录',
    email: '邮箱',
    password: '密码',
    adminSignIn: '登录',
    signInFailed: '登录失败。请检查您的凭据并重试。',
  },
  es: {
    auth_pending: 'Estableciendo una sesión segura…',
    signed_out: 'Se requiere iniciar sesión',
    role_resolving: 'Verificando tu acceso…',
    error: 'No pudimos verificar tu acceso en este momento. Inténtalo de nuevo.',
    unauthorized: 'Esta cuenta no está autorizada para este portal.',
    suspended: 'El acceso de esta cuenta está suspendido actualmente.',
    returnStorefront: 'Volver a la tienda',
    signOut: 'Cerrar sesión',
    adminTitle: 'INICIO DE SESIÓN DE ADMIN DE GOLFRIEND',
    adminAria: 'Inicio de sesión de administrador',
    email: 'Correo electrónico',
    password: 'Contraseña',
    adminSignIn: 'INICIAR SESIÓN',
    signInFailed: 'Error al iniciar sesión. Comprueba tus credenciales e inténtalo de nuevo.',
  },
  fr: {
    auth_pending: 'Établissement d’une session sécurisée…',
    signed_out: 'Connexion requise',
    role_resolving: 'Vérification de votre accès…',
    error: 'Nous n’avons pas pu vérifier votre accès pour le moment. Veuillez réessayer.',
    unauthorized: 'Ce compte n’est pas autorisé pour ce portail.',
    suspended: 'L’accès de ce compte est actuellement suspendu.',
    returnStorefront: 'Retour à la boutique',
    signOut: 'Se déconnecter',
    adminTitle: 'CONNEXION ADMIN GOLFRIEND',
    adminAria: 'Connexion administrateur',
    email: 'E-mail',
    password: 'Mot de passe',
    adminSignIn: 'SE CONNECTER',
    signInFailed: 'Échec de la connexion. Vérifiez vos identifiants et réessayez.',
  },
  de: {
    auth_pending: 'Sichere Sitzung wird aufgebaut…',
    signed_out: 'Anmeldung erforderlich',
    role_resolving: 'Ihr Zugang wird überprüft…',
    error: 'Wir konnten Ihren Zugang gerade nicht überprüfen. Bitte erneut versuchen.',
    unauthorized: 'Dieses Konto ist für dieses Portal nicht autorisiert.',
    suspended: 'Der Zugang dieses Kontos ist derzeit gesperrt.',
    returnStorefront: 'Zurück zum Shop',
    signOut: 'Abmelden',
    adminTitle: 'GOLFRIEND ADMIN-ANMELDUNG',
    adminAria: 'Admin-Anmeldung',
    email: 'E-Mail',
    password: 'Passwort',
    adminSignIn: 'ANMELDEN',
    signInFailed: 'Anmeldung fehlgeschlagen. Überprüfen Sie Ihre Anmeldedaten und versuchen Sie es erneut.',
  },
};
