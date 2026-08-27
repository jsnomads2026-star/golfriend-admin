import { useEffect, useState, type ReactNode } from 'react';
import { ADMIN_LOCALES, ADMIN_NAVIGATION_AREAS, type AdminArea, type AdminLocale } from './adminNavigation';
import { ADMIN_ANALYTICS_PRESENTATION, ADMIN_CONTROL_PRESENTATION, ADMIN_PRESENTATION } from '../../../i18n/admin/presentation';
import { AdminLocaleContext } from './AdminLocaleContext';
import './V2AdminShell.css';

export default function V2AdminShell({ activeArea, onAreaChange, onSignOut, children }: { activeArea: AdminArea; onAreaChange: (area: AdminArea) => void; onSignOut: () => void; children: ReactNode }) {
  const [locale, setLocale] = useState<AdminLocale>('en');
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = {...ADMIN_PRESENTATION[locale], ...ADMIN_ANALYTICS_PRESENTATION[locale], ...ADMIN_CONTROL_PRESENTATION[locale]};
  useEffect(() => setMenuOpen(false), [activeArea]);
  return <AdminLocaleContext.Provider value={locale}><div className="v2-admin-shell">
    <aside className={`v2-admin-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label={copy.primaryNavigation}>
      <div className="v2-admin-brand"><img className="v2-admin-mark" src="/brand/Golfriend-Play-Store-Icon-512(1).png" alt="Golfriend" /><div><strong>Golfriend Admin</strong><span>{copy.workspace}</span></div></div>
      <nav className="v2-admin-nav">{ADMIN_NAVIGATION_AREAS.map((area, index) => <button key={area.id} type="button" aria-current={activeArea === area.id ? 'page' : undefined} onClick={() => onAreaChange(area.id)}><span>{String(index + 1).padStart(2, '0')}</span>{copy[area.id]}</button>)}</nav>
      <div className="v2-admin-sidebar-footer"><label htmlFor="admin-locale">{copy.language}</label><select id="admin-locale" value={locale} onChange={(event) => setLocale(event.target.value as AdminLocale)}>{ADMIN_LOCALES.map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select><button type="button" onClick={onSignOut}>{copy.signOut}</button></div>
    </aside>
    {menuOpen && <button className="v2-admin-scrim" aria-label={copy.closeNavigation} onClick={() => setMenuOpen(false)} />}
    <main className="v2-admin-main"><header className="v2-admin-topbar"><button className="v2-admin-menu" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰ {copy.menu}</button><div><span>{copy.operations}</span><h1>{copy[activeArea]}</h1></div><b>V2 · {copy.admin}</b></header><section className="v2-admin-content">{children}</section></main>
  </div></AdminLocaleContext.Provider>;
}
