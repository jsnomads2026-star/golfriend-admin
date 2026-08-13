// Eight-locale strings for the Admin Marketing organized-sections overview.
// Read-only organizational grouping of the existing marketing library assets.
import type { LocaleDict } from '../dict.ts';

export type MktKey =
  | 'title' | 'lead'
  | 'secScreenshots' | 'secStore' | 'secCourseLetters' | 'secPartnerLetters' | 'secCampaigns' | 'secLocalized'
  | 'assetsLabel' | 'none' | 'localesLabel';

export const MARKETING: LocaleDict<MktKey> = {
  en: {
    title: 'Marketing sections', lead: 'The marketing library, organized by purpose. Read-only — no publishing or write authority.',
    secScreenshots: 'App screenshots', secStore: 'App Store / Play Store materials', secCourseLetters: 'Golf-course letters',
    secPartnerLetters: 'Partner letters', secCampaigns: 'Campaigns', secLocalized: 'Localized assets',
    assetsLabel: 'assets', none: 'None yet', localesLabel: 'locales',
  },
  th: {
    title: 'หมวดการตลาด', lead: 'คลังสื่อการตลาด จัดตามวัตถุประสงค์ อ่านอย่างเดียว — ไม่มีสิทธิ์เผยแพร่หรือเขียน',
    secScreenshots: 'ภาพหน้าจอแอป', secStore: 'สื่อ App Store / Play Store', secCourseLetters: 'จดหมายถึงสนามกอล์ฟ',
    secPartnerLetters: 'จดหมายถึงพันธมิตร', secCampaigns: 'แคมเปญ', secLocalized: 'สื่อตามภาษา',
    assetsLabel: 'รายการ', none: 'ยังไม่มี', localesLabel: 'ภาษา',
  },
  ko: {
    title: '마케팅 섹션', lead: '목적별로 정리된 마케팅 라이브러리입니다. 읽기 전용 — 게시 또는 쓰기 권한 없음.',
    secScreenshots: '앱 스크린샷', secStore: 'App Store / Play Store 자료', secCourseLetters: '골프장 서한',
    secPartnerLetters: '파트너 서한', secCampaigns: '캠페인', secLocalized: '현지화 자산',
    assetsLabel: '자산', none: '아직 없음', localesLabel: '로케일',
  },
  ja: {
    title: 'マーケティングセクション', lead: '目的別に整理されたマーケティングライブラリ。読み取り専用 — 公開・書き込み権限なし。',
    secScreenshots: 'アプリのスクリーンショット', secStore: 'App Store / Play Store 素材', secCourseLetters: 'ゴルフ場向けレター',
    secPartnerLetters: 'パートナー向けレター', secCampaigns: 'キャンペーン', secLocalized: 'ローカライズ素材',
    assetsLabel: '素材', none: 'まだありません', localesLabel: 'ロケール',
  },
  zh: {
    title: '营销板块', lead: '按用途整理的营销素材库。只读 — 无发布或写入权限。',
    secScreenshots: '应用截图', secStore: 'App Store / Play Store 素材', secCourseLetters: '高尔夫球场信函',
    secPartnerLetters: '合作伙伴信函', secCampaigns: '营销活动', secLocalized: '本地化素材',
    assetsLabel: '项', none: '暂无', localesLabel: '语言',
  },
  es: {
    title: 'Secciones de marketing', lead: 'La biblioteca de marketing, organizada por propósito. Solo lectura, sin autoridad de publicación o escritura.',
    secScreenshots: 'Capturas de la app', secStore: 'Materiales de App Store / Play Store', secCourseLetters: 'Cartas a campos de golf',
    secPartnerLetters: 'Cartas a socios', secCampaigns: 'Campañas', secLocalized: 'Recursos localizados',
    assetsLabel: 'recursos', none: 'Ninguno aún', localesLabel: 'idiomas',
  },
  fr: {
    title: 'Sections marketing', lead: 'La bibliothèque marketing, organisée par objectif. Lecture seule — aucune autorité de publication ou d’écriture.',
    secScreenshots: 'Captures de l’app', secStore: 'Supports App Store / Play Store', secCourseLetters: 'Lettres aux parcours',
    secPartnerLetters: 'Lettres aux partenaires', secCampaigns: 'Campagnes', secLocalized: 'Ressources localisées',
    assetsLabel: 'ressources', none: 'Aucun pour l’instant', localesLabel: 'langues',
  },
  de: {
    title: 'Marketing-Bereiche', lead: 'Die Marketing-Bibliothek, nach Zweck geordnet. Nur Lesen — keine Veröffentlichungs- oder Schreibrechte.',
    secScreenshots: 'App-Screenshots', secStore: 'App Store / Play Store-Materialien', secCourseLetters: 'Golfplatz-Briefe',
    secPartnerLetters: 'Partnerbriefe', secCampaigns: 'Kampagnen', secLocalized: 'Lokalisierte Assets',
    assetsLabel: 'Assets', none: 'Noch keine', localesLabel: 'Sprachen',
  },
};
