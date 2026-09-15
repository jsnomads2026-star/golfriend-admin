// Hooks for the Admin i18n foundation. Separate from the provider component so
// the provider file exports only a component (react-refresh friendly).
import { useCallback, useContext } from 'react';
import { I18nContext, type I18nContextValue } from './context.ts';
import { translate } from './core.ts';
import type { CanonicalLocale } from './locales.ts';

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useLocale(): CanonicalLocale {
  return useContext(I18nContext).locale;
}

export function useSetLocale(): (next: CanonicalLocale) => void {
  return useContext(I18nContext).setLocale;
}

/** Bind a locale->key dictionary once; returns a `t(key)` for that dictionary. */
export function useT(dict: Record<string, Record<string, string> | undefined>): (key: string) => string {
  const { locale } = useContext(I18nContext);
  return useCallback((key: string) => translate(dict, locale, key), [dict, locale]);
}
