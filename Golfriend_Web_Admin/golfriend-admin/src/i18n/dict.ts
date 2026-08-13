// Shared dictionary type for localized surfaces.
// Record<CanonicalLocale, Record<K, string>> makes TypeScript enforce, at
// compile time, that EVERY canonical locale defines EVERY key — so a missing
// locale or a missing key is a build error, not a runtime surprise. The runtime
// i18n gates (scripts/i18n) provide defense-in-depth for .js/.mjs consumers.
import type { CanonicalLocale } from './locales.ts';

export type LocaleDict<K extends string> = Record<CanonicalLocale, Record<K, string>>;
