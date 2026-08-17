import { ADMIN_NAVIGATION_AREAS, type AdminArea } from './adminNavigation';
import { ADMIN_ANALYTICS_PRESENTATION, ADMIN_PRESENTATION } from '../../../i18n/admin/presentation';
import { useAdminLocale } from './AdminLocaleContext';
export default function V2AdminOverview({ onOpen }: { onOpen: (area: AdminArea) => void }) {
  const locale=useAdminLocale();
  const copy={...ADMIN_PRESENTATION[locale], ...ADMIN_ANALYTICS_PRESENTATION[locale]};
  return <div className="v2-admin-overview"><section className="v2-admin-hero"><div><span>{copy.operations}</span><h2>{copy.heroTitle}</h2></div><p>{copy.heroLead}</p></section><section className="v2-admin-principles" aria-label={copy.boundaries}><article><span>{copy.authority}</span><strong>{copy.authorityTitle}</strong><p>{copy.authorityLead}</p></article><article><span>{copy.courseData}</span><strong>{copy.courseDataTitle}</strong><p>{copy.courseDataLead}</p></article><article><span>{copy.teeTimes}</span><strong>{copy.teeTimesTitle}</strong><p>{copy.teeTimesLead}</p></article></section><section className="v2-admin-area-grid" aria-label={copy.areas}>{ADMIN_NAVIGATION_AREAS.slice(1).map((area, index) => <button type="button" key={area.id} onClick={() => onOpen(area.id)}><span>{String(index + 2).padStart(2, '0')}</span><strong>{copy[area.id]}</strong><i aria-hidden="true">↗</i></button>)}</section></div>;
}
