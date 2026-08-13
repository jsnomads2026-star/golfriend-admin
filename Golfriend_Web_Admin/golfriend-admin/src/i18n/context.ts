// React context + value type for the Admin i18n foundation.
// Kept separate from the provider component so the provider file can export only
// a component (satisfies react-refresh/only-export-components).
import { createContext } from 'react';
import { DEFAULT_LOCALE, type CanonicalLocale } from './locales.ts';
import { translate } from './core.ts';

export interface I18nContextValue {
  locale: CanonicalLocale;
  setLocale: (next: CanonicalLocale) => void;
  /** Translate a key against a locale->key dictionary with English fallback. */
  t: (dict: Record<string, Record<string, string> | undefined>, key: string) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (dict, key) => translate(dict, DEFAULT_LOCALE, key),
});
