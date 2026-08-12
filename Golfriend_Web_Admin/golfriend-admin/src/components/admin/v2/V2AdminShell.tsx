import { useEffect, useState, type ReactNode } from 'react';
import { ADMIN_AREAS, ADMIN_COPY, ADMIN_LOCALES, type AdminArea, type AdminLocale } from './adminNavigation';
import { AdminLocaleContext } from './AdminLocaleContext';
import './V2AdminShell.css';

export default function V2AdminShell({ activeArea, onAreaChange, onSignOut, children }: { activeArea: AdminArea; onAreaChange: (area: AdminArea) => void; onSignOut: () => void; children: ReactNode }) {
  const [locale, setLocale] = useState<AdminLocale>('en');
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = ADMIN_COPY[locale];
  const active = ADMIN_AREAS.find((area) => area.id === activeArea) ?? ADMIN_AREAS[0];
  useEffect(() => setMenuOpen(false), [activeArea]);
  return <AdminLocaleContext.Provider value={locale}><div className="v2-admin-shell">
    <aside className={`v2-admin-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
      <div className="v2-admin-brand"><span className="v2-admin-mark">G</span><div><strong>Golfriend Admin</strong><span>{copy.workspace}</span></div></div>
      <nav className="v2-admin-nav">{ADMIN_AREAS.map((area, index) => <button key={area.id} type="button" aria-current={activeArea === area.id ? 'page' : undefined} onClick={() => onAreaChange(area.id)}><span>{String(index + 1).padStart(2, '0')}</span>{area.label}</button>)}</nav>
      <div className="v2-admin-sidebar-footer"><label htmlFor="admin-locale">{copy.language}</label><select id="admin-locale" value={locale} onChange={(event) => setLocale(event.target.value as AdminLocale)}>{ADMIN_LOCALES.map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}</select><button type="button" onClick={onSignOut}>{copy.signOut}</button></div>
    </aside>
    {menuOpen && <button className="v2-admin-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="v2-admin-main"><header className="v2-admin-topbar"><button className="v2-admin-menu" type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰ Menu</button><div><span>GOLFRIEND OPERATIONS</span><h1>{active.label}</h1></div><b>V2 · Admin</b></header><section className="v2-admin-content">{children}</section></main>
  </div></AdminLocaleContext.Provider>;
}
