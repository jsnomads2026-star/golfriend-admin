import {LOCALE_CODES, type CanonicalLocale} from '../locales.ts';

// Truthful, localized Portal states.
//
// The Small Business panel used to print the raw token SMALL_BUSINESS_PORTAL_UNAVAILABLE into
// the page, which told a partner nothing and looked like a fault even when the real situation
// was "this account is an Enterprise partner, not a Small Business one". Each state below says
// what is actually true and what the reader can do about it.

export const PORTAL_STATE_REASONS = [
  'not_a_small_business_partner',
  'business_record_missing',
  'sign_in_required',
  'service_unavailable',
] as const;
export type PortalStateReason = typeof PORTAL_STATE_REASONS[number];

type StateCopy = Record<PortalStateReason, string>;

const COPY: Record<CanonicalLocale, StateCopy> = {
  en: {
    not_a_small_business_partner: 'This account is not an activated Small Business partner. If your organization was activated as an Enterprise partner, use the Enterprise portal instead.',
    business_record_missing: 'Your business record is not ready yet. It is created when your partnership is activated.',
    sign_in_required: 'Sign in with your verified partner account to open this portal.',
    service_unavailable: 'The Small Business service could not be reached. Nothing was changed.',
  },
  th: {
    not_a_small_business_partner: 'บัญชีนี้ไม่ใช่พันธมิตร Small Business ที่เปิดใช้งานแล้ว หากองค์กรของคุณเปิดใช้งานในฐานะพันธมิตร Enterprise โปรดใช้พอร์ทัล Enterprise แทน',
    business_record_missing: 'ข้อมูลธุรกิจของคุณยังไม่พร้อม ระบบจะสร้างให้เมื่อความร่วมมือของคุณถูกเปิดใช้งาน',
    sign_in_required: 'เข้าสู่ระบบด้วยบัญชีพันธมิตรที่ยืนยันแล้วเพื่อเปิดพอร์ทัลนี้',
    service_unavailable: 'ติดต่อบริการ Small Business ไม่ได้ ไม่มีการเปลี่ยนแปลงใด ๆ',
  },
  ko: {
    not_a_small_business_partner: '이 계정은 활성화된 Small Business 파트너가 아닙니다. 조직이 Enterprise 파트너로 활성화되었다면 Enterprise 포털을 사용하세요.',
    business_record_missing: '사업체 정보가 아직 준비되지 않았습니다. 파트너십이 활성화될 때 생성됩니다.',
    sign_in_required: '이 포털을 열려면 인증된 파트너 계정으로 로그인하세요.',
    service_unavailable: 'Small Business 서비스에 연결하지 못했습니다. 변경된 것은 없습니다.',
  },
  ja: {
    not_a_small_business_partner: 'このアカウントは有効化された Small Business パートナーではありません。組織が Enterprise パートナーとして有効化されている場合は、Enterprise ポータルをご利用ください。',
    business_record_missing: '事業者情報はまだ準備できていません。パートナーシップの有効化時に作成されます。',
    sign_in_required: 'このポータルを開くには、確認済みのパートナーアカウントでサインインしてください。',
    service_unavailable: 'Small Business サービスに接続できませんでした。変更はありません。',
  },
  zh: {
    not_a_small_business_partner: '此账户不是已激活的 Small Business 合作伙伴。如果你的机构以 Enterprise 合作伙伴身份激活，请改用 Enterprise 门户。',
    business_record_missing: '你的商户记录尚未就绪。它会在合作关系激活时创建。',
    sign_in_required: '请使用已验证的合作伙伴账户登录以打开此门户。',
    service_unavailable: '无法连接 Small Business 服务。没有发生任何更改。',
  },
  es: {
    not_a_small_business_partner: 'Esta cuenta no es un socio Small Business activado. Si tu organización se activó como socio Enterprise, usa el portal Enterprise.',
    business_record_missing: 'Tu ficha de negocio aún no está lista. Se crea cuando se activa tu colaboración.',
    sign_in_required: 'Inicia sesión con tu cuenta de socio verificada para abrir este portal.',
    service_unavailable: 'No se pudo contactar con el servicio Small Business. No se cambió nada.',
  },
  fr: {
    not_a_small_business_partner: "Ce compte n'est pas un partenaire Small Business activé. Si votre organisation a été activée comme partenaire Enterprise, utilisez le portail Enterprise.",
    business_record_missing: "Votre fiche d'entreprise n'est pas encore prête. Elle est créée lors de l'activation de votre partenariat.",
    sign_in_required: 'Connectez-vous avec votre compte partenaire vérifié pour ouvrir ce portail.',
    service_unavailable: "Le service Small Business est injoignable. Rien n'a été modifié.",
  },
  de: {
    not_a_small_business_partner: 'Dieses Konto ist kein aktivierter Small-Business-Partner. Wurde Ihre Organisation als Enterprise-Partner aktiviert, nutzen Sie bitte das Enterprise-Portal.',
    business_record_missing: 'Ihr Geschäftsdatensatz ist noch nicht bereit. Er wird bei der Aktivierung Ihrer Partnerschaft angelegt.',
    sign_in_required: 'Melden Sie sich mit Ihrem bestätigten Partnerkonto an, um dieses Portal zu öffnen.',
    service_unavailable: 'Der Small-Business-Dienst war nicht erreichbar. Es wurde nichts geändert.',
  },
};

const isReason = (value: string): value is PortalStateReason =>
  (PORTAL_STATE_REASONS as readonly string[]).includes(value);

/**
 * Localized sentence for a Portal unavailability reason. An unrecognized reason resolves to the
 * service sentence rather than being printed raw, so no token can ever reach a partner.
 */
export function portalStateMessage(locale: string, reason: string | undefined): string {
  const resolved = (LOCALE_CODES as readonly string[]).includes(locale) ? (locale as CanonicalLocale) : 'en';
  return COPY[resolved][isReason(String(reason)) ? (reason as PortalStateReason) : 'service_unavailable'];
}
