// ============================================================================
// Golfriend canonical eight-locale contract — SINGLE SOURCE OF TRUTH (Admin).
//
// This is the one place in golfriend-admin that defines the canonical locale
// set. All Admin code should import LOCALE_CODES / CanonicalLocale / LOCALES
// from here rather than re-declaring the array. The order and codes MUST match
// the Golfriend Web contract (golfriend-web/public/js/i18n.js) and the app.
//
// See ./README.md for the cross-surface handoff contract.
// ============================================================================

/** Canonical locale codes, in canonical order. Do not reorder or extend without
 *  a coordinated update across Web, Admin, and the App. */
export const LOCALE_CODES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;

export type CanonicalLocale = (typeof LOCALE_CODES)[number];

/** The fallback locale used whenever a value is missing or a code is invalid. */
export const DEFAULT_LOCALE: CanonicalLocale = 'en';

export interface LocaleDescriptor {
  code: CanonicalLocale;
  /** Endonym — the language's own name, shown in selectors. */
  label: string;
}

/** Display descriptors (endonyms) for building selectors. Order = canonical. */
export const LOCALES: readonly LocaleDescriptor[] = [
  { code: 'en', label: 'English' },
  { code: 'th', label: 'ไทย' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

/** Type guard: is the value one of the canonical locale codes? */
export function isCanonicalLocale(value: unknown): value is CanonicalLocale {
  return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

/** Coerce any value to a canonical locale, falling back to DEFAULT_LOCALE. */
export function coerceLocale(value: unknown): CanonicalLocale {
  return isCanonicalLocale(value) ? value : DEFAULT_LOCALE;
}
