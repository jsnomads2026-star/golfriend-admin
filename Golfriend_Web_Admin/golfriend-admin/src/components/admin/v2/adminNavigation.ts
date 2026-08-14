export const ADMIN_LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const ADMIN_AREAS = [
  { id: 'overview', label: 'Overview' },
  { id: 'courses', label: 'Golf courses / Golf API data' },
  { id: 'analytics', label: 'Country user analytics' },
  { id: 'tee-analytics', label: 'Tee economy analytics' },
  { id: 'bookings', label: 'Booking communications' },
  { id: 'partners', label: 'Partners / portal requests' },
  { id: 'marketing', label: 'Marketing assets' },
  { id: 'advertising', label: 'Advertising' },
  { id: 'exchange', label: 'OEM / Exchange publishing' },
  { id: 'reports', label: 'Reports to JHCC' },
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number]['id'];
export const isAdminArea = (value: string | null): value is AdminArea => ADMIN_AREAS.some((area) => area.id === value);

export const ADMIN_COPY: Record<AdminLocale, { workspace: string; signOut: string; language: string }> = {
  en: { workspace: 'Operations workspace', signOut: 'Secure sign out', language: 'Language' },
  th: { workspace: 'พื้นที่ปฏิบัติการ', signOut: 'ออกจากระบบอย่างปลอดภัย', language: 'ภาษา' },
  ko: { workspace: '운영 작업 공간', signOut: '안전하게 로그아웃', language: '언어' },
  ja: { workspace: '運用ワークスペース', signOut: '安全にサインアウト', language: '言語' },
  zh: { workspace: '运营工作区', signOut: '安全退出', language: '语言' },
  es: { workspace: 'Espacio de operaciones', signOut: 'Cerrar sesión de forma segura', language: 'Idioma' },
  fr: { workspace: 'Espace des opérations', signOut: 'Déconnexion sécurisée', language: 'Langue' },
  de: { workspace: 'Betriebsbereich', signOut: 'Sicher abmelden', language: 'Sprache' },
};
