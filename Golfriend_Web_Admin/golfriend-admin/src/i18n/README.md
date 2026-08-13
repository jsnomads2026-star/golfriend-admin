# Golfriend Admin i18n foundation (L0)

Central, framework-light localization foundation for Golfriend Admin. This is the
**L0 foundation only** — it establishes the contract, provider, persistence, and
the cross-surface handoff. Migrating individual screens/dictionaries and adding
locale-aware date/number formatting are later slices (L1–L4).

## Files

| File | Role |
|---|---|
| `locales.ts` | **Single source of truth** — canonical 8 codes, order, endonym labels, `DEFAULT_LOCALE`, `isCanonicalLocale`, `coerceLocale`. |
| `core.ts` | Pure, DOM-free logic: English-fallback `translate()`, persistence (`readStoredLocale`/`writeStoredLocale`), handoff parsing (`readHandoffParam`/`readHandoffCookie`), `resolveInitialLocale`. Unit-tested under `node --test`. |
| `context.ts` | React context object + `I18nContextValue` type (kept out of the component file). |
| `I18nProvider.tsx` | Provider component wrapping `core`. Resolves initial locale, persists changes, reflects `<html lang>`, strips the one-time `?lang=` param. |
| `hooks.ts` | `useLocale`, `useSetLocale`, `useI18n`, `useT`. |
| `LocaleSwitcher.tsx` | App-wide, persisted language `<select>` (endonym labels). Interim global placement; relocates into the V2 shell header later. |

## Canonical contract

```
en, th, ko, ja, zh, es, fr, de   (this exact order)
```

Order and codes MUST match `golfriend-web/public/js/i18n.js` and the App. Never
re-declare this array elsewhere — import `LOCALE_CODES` / `CanonicalLocale` /
`LOCALES` from `locales.ts`. The guardrail test
`scripts/i18n/no-duplicate-locale-literals.test.mjs` fails the build if a new
file hard-codes the set.

> **Known duplication debt:** twelve legacy files still hard-code the set because
> existing gates (`c2b`/`c2c`/`c2d`/`c2e`/`c3a`/`c3b`, `*-verify`) assert those
> literals by value/text. They are frozen in the guardrail's `LEGACY_LEDGER` and
> will be consolidated in a dedicated slice that updates those gates in lockstep.
> Removing them now would break the gate suite.

## Fallback rules

`translate(dict, locale, key)` resolves: **requested locale → English → the key
itself** (never returns blank). Invalid/unknown locale codes resolve through
English. This mirrors the Web engine's fallback.

## Persisted selection

The operator's choice is stored in `localStorage` under `golfriend.admin.locale`
and restored on load, so language survives reloads and navigation.

## Cross-surface locale handoff (Web/Portal → Admin)

Golfriend Web (`golfriend.co`) and Admin run on different origins, so
`localStorage` cannot be shared. The documented, safe handoff uses two channels:

1. **URL parameter (explicit, highest priority).** When Web links to Admin it
   appends `?lang=<code>` (see `GolfriendI18n.linkWithLocale(url)` in
   `golfriend-web`). On load, Admin reads and validates it, persists it, then
   **strips the param** from the URL so it does not linger.
2. **Shared cross-subdomain cookie (ambient).** Web writes
   `golfriend.locale=<code>` on the registrable parent domain. Admin reads it as
   a fallback when no explicit param or stored choice exists.

Resolution precedence in `resolveInitialLocale`:

```
?lang= param  >  persisted Admin choice  >  shared cookie  >  navigator.language  >  en
```

Every step is validated against the canonical contract, so an unknown code can
never leak through. If neither surface provides a locale, the browser language
(then English) is used.

## Tests

```bash
npm run test:i18n     # contract, fallback, persistence, duplication ratchet
```

Also wired into the aggregate `npm run gate` as `gate:i18n`.
