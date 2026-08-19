import { useEffect, useState, type ReactNode } from 'react';
import { ADMIN_AREAS, ADMIN_COPY, ADMIN_LOCALES, type AdminArea, type AdminLocale } from './adminNavigation';
import { AdminLocaleContext } from './AdminLocaleContext';
import './V2AdminShell.css';

const EN = {
  brand: 'Golfriend Admin',
  adminTitle: 'GOLFRIEND OPERATIONS',
  adminIdentity: 'V2 Admin',
  menu: 'Menu',
  closeNavigation: 'Close navigation',
  primaryNavigation: 'Primary navigation',
};

const COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {
    brand: 'ผู้ดูแลระบบ Golfriend',
    adminTitle: 'GOLFRIEND การปฏิบัติการ',
    adminIdentity: 'ผู้ดูแลระบบ V2',
    menu: 'เมนู',
    closeNavigation: 'ปิดการนำทาง',
    primaryNavigation: 'การนำทางหลัก',
  },
  ko: {
    brand: 'Golfriend 관리자',
    adminTitle: 'GOLFRIEND 운영',
    adminIdentity: 'V2 관리자',
    menu: '메뉴',
    closeNavigation: '탐색 닫기',
    primaryNavigation: '기본 탐색',
  },
  ja: {
    brand: 'Golfriend 管理者',
    adminTitle: 'GOLFRIEND 運用',
    adminIdentity: 'V2 管理',
    menu: 'メニュー',
    closeNavigation: 'ナビゲーションを閉じる',
    primaryNavigation: '主要ナビゲーション',
  },
  zh: {
    brand: 'Golfriend 管理员',
    adminTitle: 'GOLFRIEND 运营',
    adminIdentity: 'V2 管理',
    menu: '菜单',
    closeNavigation: '关闭导航',
    primaryNavigation: '主要导航',
  },
  es: {
    brand: 'Administrador de Golfriend',
    adminTitle: 'OPERACIONES DE GOLFRIEND',
    adminIdentity: 'Admin V2',
    menu: 'Menú',
    closeNavigation: 'Cerrar navegación',
    primaryNavigation: 'Navegación principal',
  },
  fr: {
    brand: 'Administration Golfriend',
    adminTitle: 'OPÉRATIONS GOLFRIEND',
    adminIdentity: 'Admin V2',
    menu: 'Menu',
    closeNavigation: 'Fermer la navigation',
    primaryNavigation: 'Navigation principale',
  },
  de: {
    brand: 'Golfriend Admin',
    adminTitle: 'GOLFRIEND BETRIEB',
    adminIdentity: 'V2 Admin',
    menu: 'Menü',
    closeNavigation: 'Navigation schließen',
    primaryNavigation: 'Hauptnavigation',
  },
};

const NAV_COPY: Record<AdminLocale, Record<string, string>> = {
  en: {
    overview: 'Overview',
    courses: 'Golf courses / Golf API data',
    bookings: 'Booking communications',
    partners: 'Partners / portal requests',
    marketing: 'Marketing assets',
    advertising: 'Advertising',
    exchange: 'OEM / Exchange publishing',
    reports: 'Reports to JHCC',
  },
  th: {
    overview: 'ภาพรวม',
    courses: 'ข้อมูลสนาม / ข้อมูล Golf API',
    bookings: 'การสื่อสารการจอง',
    partners: 'พันธมิตร / คำขอพอร์ทัล',
    marketing: 'ทรัพย์สินการตลาด',
    advertising: 'โฆษณา',
    exchange: 'การเผยแพร่ OEM / Exchange',
    reports: 'รายงานให้ JHCC',
  },
  ko: {
    overview: '개요',
    courses: '코스 / Golf API 데이터',
    bookings: '예약 커뮤니케이션',
    partners: '파트너 / 포털 요청',
    marketing: '마케팅 자산',
    advertising: '광고',
    exchange: 'OEM / Exchange 게시',
    reports: 'JHCC 보고서',
  },
  ja: {
    overview: '概要',
    courses: 'コース / Golf API データ',
    bookings: '予約コミュニケーション',
    partners: 'パートナー / ポータル依頼',
    marketing: 'マーケティング資産',
    advertising: '広告',
    exchange: 'OEM / Exchange 配信',
    reports: 'JHCC への報告',
  },
  zh: {
    overview: '概览',
    courses: '球场 / Golf API 数据',
    bookings: '预订沟通',
    partners: '合作伙伴 / 门户请求',
    marketing: '营销资产',
    advertising: '广告',
    exchange: 'OEM / Exchange 发布',
    reports: 'JHCC 报告',
  },
  es: {
    overview: 'Resumen',
    courses: 'Campos / Datos de Golf API',
    bookings: 'Comunicaciones de reservas',
    partners: 'Socios / solicitudes del portal',
    marketing: 'Recursos de marketing',
    advertising: 'Publicidad',
    exchange: 'Publicación OEM / Exchange',
    reports: 'Informes para JHCC',
  },
  fr: {
    overview: 'Vue d’ensemble',
    courses: 'Parcours / Données Golf API',
    bookings: 'Communications de réservation',
    partners: 'Partenaires / demandes du portail',
    marketing: 'Ressources marketing',
    advertising: 'Publicité',
    exchange: 'Publication OEM / Exchange',
    reports: 'Rapports destinés à JHCC',
  },
  de: {
    overview: 'Überblick',
    courses: 'Kurse / Golf API-Daten',
    bookings: 'Buchungskommunikation',
    partners: 'Partner / Portal-Anfragen',
    marketing: 'Marketing-Assets',
    advertising: 'Werbung',
    exchange: 'OEM / Exchange Veröffentlichung',
    reports: 'Berichte an JHCC',
  },
};

export default function V2AdminShell({ activeArea, onAreaChange, onSignOut, children }: { activeArea: AdminArea; onAreaChange: (area: AdminArea) => void; onSignOut: () => void; children: ReactNode }) {
  const [locale, setLocale] = useState<AdminLocale>('en');
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = ADMIN_COPY[locale];
  const shell = COPY[locale];
  const navCopy = NAV_COPY[locale];
  const active = ADMIN_AREAS.find((area) => area.id === activeArea) ?? ADMIN_AREAS[0];
  const activeLabel = navCopy[activeArea] || active.label;
  useEffect(() => setMenuOpen(false), [activeArea]);
  return <AdminLocaleContext.Provider value={locale}><div className="v2-admin-shell">
    <aside className={`v2-admin-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label={shell.primaryNavigation}>
      <div className="v2-admin-brand"><span className="v2-admin-mark">G</span><div><strong>{shell.brand}</strong><span>{copy.workspace}</span></div></div>
      <nav className="v2-admin-nav">{ADMIN_AREAS.map((area, index) => <button key={area.id} type="button" aria-current={activeArea === area.id ? 'page' : undefined} onClick={() => onAreaChange(area.id)}><span>{String(index + 1).padStart(2, '0')}</span>{navCopy[area.id] || area.label}</button>)}</nav>
      <div className="v2-admin-sidebar-footer"><label htmlFor="admin-locale">{copy.language}</label><select id="admin-locale" value={locale} onChange={(event) => setLocale(event.target.value as AdminLocale)}>{ADMIN_LOCALES.map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select><button type="button" onClick={onSignOut}>{copy.signOut}</button></div>
    </aside>
    {menuOpen && <button className="v2-admin-scrim" aria-label={shell.closeNavigation} onClick={() => setMenuOpen(false)} />}
    <main className="v2-admin-main"><header className="v2-admin-topbar"><button className="v2-admin-menu" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{`☰ ${shell.menu}`}</button><div><span>{shell.adminTitle}</span><h1>{activeLabel}</h1></div><b>{shell.adminIdentity}</b></header><section className="v2-admin-content">{children}</section></main>
  </div></AdminLocaleContext.Provider>;
}
