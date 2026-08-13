// ============================================================================
// Golfriend Admin i18n core — pure, framework-free logic.
//
// Everything here is dependency-free and side-effect-free (storage/cookie
// access is guarded and injectable) so it can be unit-tested under `node --test`
// without a DOM. The React layer (I18nProvider) is a thin wrapper over this.
// ============================================================================
import { LOCALE_CODES, DEFAULT_LOCALE, isCanonicalLocale, type CanonicalLocale } from './locales.ts';

/** localStorage key holding the operator's explicit Admin language choice. */
export const STORAGE_KEY = 'golfriend.admin.locale';
/** URL query param used for the Web/Portal -> Admin one-time handoff. */
export const HANDOFF_PARAM = 'lang';
/** Cross-subdomain cookie name shared by all Golfriend web surfaces. */
export const HANDOFF_COOKIE = 'golfriend.locale';

/** Minimal Storage surface so tests can inject a shim. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Translate a key with guaranteed English fallback.
 * Lookup order: requested locale -> English -> the key itself (never blank).
 */
export function translate(
  dict: Record<string, Record<string, string> | undefined>,
  locale: string,
  key: string,
): string {
  const resolved = isCanonicalLocale(locale) ? locale : DEFAULT_LOCALE;
  const inLocale = dict[resolved]?.[key];
  if (inLocale != null && inLocale !== '') return inLocale;
  const inEnglish = dict[DEFAULT_LOCALE]?.[key];
  if (inEnglish != null && inEnglish !== '') return inEnglish;
  return key;
}

/** Read the persisted Admin locale, or null if absent/invalid. */
export function readStoredLocale(storage: StorageLike | undefined = defaultStorage()): CanonicalLocale | null {
  try {
    const value = storage?.getItem(STORAGE_KEY) ?? null;
    return isCanonicalLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist the Admin locale choice. Silently no-ops if storage is unavailable. */
export function writeStoredLocale(
  locale: CanonicalLocale,
  storage: StorageLike | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable (private mode, SSR) — ignore */
  }
}

/** Parse the handoff locale from a URL search string (e.g. "?lang=th"). */
export function readHandoffParam(search: string): CanonicalLocale | null {
  try {
    const value = new URLSearchParams(search || '').get(HANDOFF_PARAM);
    return isCanonicalLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Read the shared cross-subdomain handoff cookie from a cookie string. */
export function readHandoffCookie(cookie: string): CanonicalLocale | null {
  const match = (cookie || '').match(new RegExp('(?:^|;\\s*)' + HANDOFF_COOKIE.replace('.', '\\.') + '=([^;]+)'));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isCanonicalLocale(value) ? value : null;
}

export interface ResolveSources {
  /** From ?lang= (highest priority — an explicit cross-surface handoff). */
  param?: string | null;
  /** The operator's previously persisted Admin choice. */
  stored?: CanonicalLocale | null;
  /** The shared cross-subdomain cookie. */
  cookie?: CanonicalLocale | null;
  /** navigator.language (browser preference). */
  navigator?: string | null;
}

/**
 * Resolve the initial locale.
 * Precedence: handoff param > persisted Admin choice > shared cookie >
 * browser language > DEFAULT_LOCALE. Every step is validated against the
 * canonical contract, so an unknown value can never leak through.
 */
export function resolveInitialLocale(sources: ResolveSources): CanonicalLocale {
  if (isCanonicalLocale(sources.param)) return sources.param;
  if (isCanonicalLocale(sources.stored)) return sources.stored;
  if (isCanonicalLocale(sources.cookie)) return sources.cookie;
  const nav = (sources.navigator ?? '').slice(0, 2).toLowerCase();
  if (isCanonicalLocale(nav)) return nav;
  return DEFAULT_LOCALE;
}

/** Re-export for convenience so consumers can import the whole contract here. */
export { LOCALE_CODES, DEFAULT_LOCALE, isCanonicalLocale };
export type { CanonicalLocale };
