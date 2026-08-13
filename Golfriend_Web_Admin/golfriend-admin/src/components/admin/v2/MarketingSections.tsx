// ==========================================
// FILE: src/components/admin/v2/MarketingSections.tsx
// Read-only organized overview of the marketing library, grouped by purpose
// (app screenshots, store materials, golf-course letters, partner letters,
// campaigns, localized assets). Localized (8 locales). Presentation only — it
// reads the assets already loaded by V2MarketingLibrary and performs no writes,
// no publishing, and asserts no production inventory.
// ==========================================
import type { CSSProperties } from 'react';
import type { MarketingAsset } from './marketingLibraryModel.mjs';
import { useT } from '../../../i18n/hooks.ts';
import { MARKETING } from '../../../i18n/admin/marketing.ts';

type SectionKey = 'secScreenshots' | 'secStore' | 'secCourseLetters' | 'secPartnerLetters' | 'secCampaigns' | 'secLocalized';

const SECTIONS: Array<{ key: SectionKey; categories: string[] | 'localized' }> = [
  { key: 'secScreenshots', categories: ['app_screenshots'] },
  { key: 'secStore', categories: ['store_listing'] },
  { key: 'secCourseLetters', categories: ['golf_course_letters'] },
  { key: 'secPartnerLetters', categories: ['strategic_partner_letters', 'sponsor_introductions', 'community_media_introductions'] },
  { key: 'secCampaigns', categories: ['campaign_materials', 'social_content'] },
  { key: 'secLocalized', categories: 'localized' },
];

export default function MarketingSections({ assets }: { assets: MarketingAsset[] }) {
  const t = useT(MARKETING);
  const pick = (spec: string[] | 'localized') =>
    spec === 'localized'
      ? assets.filter((a) => a.locales && a.locales.length > 0)
      : assets.filter((a) => spec.includes(a.category));

  return (
    <section aria-label={t('title')} style={wrap}>
      <div style={{ marginBottom: 10 }}>
        <span style={eyebrow}>{t('title')}</span>
        <p style={{ color: '#888', fontSize: 13, margin: '4px 0 0' }}>{t('lead')}</p>
      </div>
      <div style={grid}>
        {SECTIONS.map((s) => {
          const items = pick(s.categories);
          return (
            <article key={s.key} style={card}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h4 style={{ margin: 0, color: '#d4af37', fontSize: 14 }}>{t(s.key)}</h4>
                <span style={{ color: '#888', fontSize: 12 }}>{items.length} {t('assetsLabel')}</span>
              </header>
              {items.length === 0 ? (
                <p style={{ color: '#555', fontSize: 12, margin: '8px 0 0' }}>{t('none')}</p>
              ) : (
                <ul style={list}>
                  {items.slice(0, 6).map((a) => (
                    <li key={a.id} style={row}>
                      <span style={{ color: '#eee', fontSize: 12 }}>{a.title}</span>
                      <span style={{ color: '#888', fontSize: 11 }}>{a.status} · {a.locales?.length || 0} {t('localesLabel')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

const wrap: CSSProperties = { padding: '16px 0', borderBottom: '1px solid #222' };
const eyebrow: CSSProperties = { color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 };
const card: CSSProperties = { backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, padding: 14 };
const list: CSSProperties = { listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 };
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' };
