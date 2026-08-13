// ============================================================================
// Golfriend Admin locale switcher — the app-wide, persisted language control.
//
// Reads/writes the central I18nProvider, so a choice here persists across the
// whole Admin app and survives reloads (localStorage: golfriend.admin.locale).
// Interim global placement (top corner); later slices relocate it into the
// V2 admin shell header. Endonym labels come from the canonical contract.
// ============================================================================
import type { CSSProperties } from 'react';
import { LOCALES, type CanonicalLocale } from './locales.ts';
import { useI18n } from './hooks.ts';

export function LocaleSwitcher({ style }: { style?: CSSProperties }) {
  const { locale, setLocale } = useI18n();
  return (
    <label style={{ ...wrap, ...style }}>
      <span style={srOnly}>Language / ภาษา</span>
      <select
        aria-label="Language"
        value={locale}
        onChange={(event) => setLocale(event.target.value as CanonicalLocale)}
        style={select}
      >
        {LOCALES.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const wrap: CSSProperties = { display: 'inline-flex', alignItems: 'center' };

const select: CSSProperties = {
  backgroundColor: '#121212',
  color: '#d4af37',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: '32px',
};

const srOnly: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};
