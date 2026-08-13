// ============================================================================
// Golfriend Admin i18n provider — central React context over the pure core.
//
// Responsibilities:
//   - Resolve the initial locale (handoff param > persisted > cookie > browser).
//   - Persist the operator's choice to localStorage (golfriend.admin.locale).
//   - Reflect the locale on <html lang> and strip the one-time handoff param.
//
// Context lives in ./context.ts and hooks in ./hooks.ts so this file exports
// only the provider component. English fallback lives in core `translate()`.
// ============================================================================
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type CanonicalLocale } from './locales.ts';
import {
  HANDOFF_PARAM,
  readHandoffCookie,
  readHandoffParam,
  readStoredLocale,
  resolveInitialLocale,
  translate,
  writeStoredLocale,
} from './core.ts';
import { DEFAULT_LOCALE } from './locales.ts';
import { I18nContext, type I18nContextValue } from './context.ts';

function computeInitialLocale(): CanonicalLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  return resolveInitialLocale({
    param: readHandoffParam(window.location.search),
    stored: readStoredLocale(),
    cookie: typeof document !== 'undefined' ? readHandoffCookie(document.cookie) : null,
    navigator: typeof navigator !== 'undefined' ? navigator.language : null,
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<CanonicalLocale>(computeInitialLocale);

  const setLocale = useCallback((next: CanonicalLocale) => {
    setLocaleState(next);
    writeStoredLocale(next);
    try {
      document.documentElement.setAttribute('lang', next);
    } catch {
      /* ignore */
    }
  }, []);

  // On mount: persist the resolved locale, reflect it on <html lang>, and strip
  // the one-time ?lang= handoff param so it does not linger in the URL/history.
  useEffect(() => {
    writeStoredLocale(locale);
    try {
      document.documentElement.setAttribute('lang', locale);
    } catch {
      /* ignore */
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(HANDOFF_PARAM)) {
        url.searchParams.delete(HANDOFF_PARAM);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      /* ignore */
    }
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (dict, key) => translate(dict, locale, key) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
