# V2 Browser-UI Gap Audit — authoritative dependency

**Question posed:** are the launched Web/Admin/Small-Business Portal/Enterprise Portal the wrong surfaces (V2 exists elsewhere) or was the V2 browser UI never implemented?

**Determination: the V2 browser UI was NEVER implemented.** `golfriend-admin` (the launched app) is the **only** browser/web application in the workspace and is the **old V1 UI**. The approved V2 experience exists **only in the mobile app** (`golfriend-app`, Expo/React-Native). No V2-branded browser build exists on any branch, worktree, or repo. This is **not** a wrong-surface launch.

## Audit evidence
| Checked | Finding |
|---|---|
| `golfriend-admin` branches (16 feature + main) | Only Lane C **backend/authority** work (server-authoritative writes, non-financial booking, emulator/precommission). **Zero** UI/redesign/rebrand/theme/lounge commits on any branch. |
| `golfriend-app` + ~25 worktrees (clubhouse, locker-room, play-golf, practice, lounge, match, …) | All **Expo/React-Native mobile**. V2 lives here: rooms + `constants/V2Theme.ts`. Not browser. |
| `golfriend-web` repo | Static 4-file marketing site (`index.html`: "Your Ultimate Golf Companion / Matchmaking"), last touched 2026-07-24. V1, no app. |
| All `C:/Golfriend/*` projects | The only Vite/React **web** app is `golfriend-admin`. No Next/Vite V2 web app anywhere. |
| Issue #19 (all comments) | **Zero** approved V2 **browser/web/admin/portal** UI design decisions. All V2 design decisions are mobile. |
| Brand kit `brand/gf-production` + `V2Theme.ts` | Approved V2 visual language **exists** (courseGreen `#123F31`, clubhouseCream `#F7F3E8`, warmWhite `#FFFCF5`, fairway `#2E6B4D`, gold `#B89552`; gf-icon on-dark/on-light SVGs; spacing/radius/type/shadow tokens) — applied **only in mobile**, never in the browser. |
| `golfriend-admin` aesthetic | Dark console theme `#0a0a0a`/`#121212`/`#d4af37`; copy "Matchmaking Platform", "Golfriend Local Injector", "$199/$499" tiers; **no** import of the brand kit or `V2Theme`; `public/` has only a generic favicon. V1. |

Expo-web is not an alternative: the mobile app renders consumer **rooms** (Lounge/Play/golfers/rounds), not the B2B/admin browser surfaces (Web/Admin/SB-Portal/Enterprise-Portal).

## Surface-by-surface gap map (V1 present → V2 missing)

**Global (all four):** no `V2Theme` tokens; no `brand/gf-production` logo/icon; generic favicon; ad-hoc inline styles with no shared V2 token layer; **and Issue #19 defines no approved V2 layout/nav/copy for these surfaces — the target is undefined as well as unbuilt.**

1. **Web (public)** — `src/components/public/LandingPage.tsx`, `B2BStorefront.tsx`. Missing V2 branding/hero; V1 "matchmaking" copy; storefront shows **$199/$499 financial tiers** (contradicts approved non-financial V2). No V2 landing/marketing components exist.
2. **Admin** — `src/App.tsx` Dashboard + ~30 consoles. V1 dark console shell; missing V2 branding, information architecture/navigation, layouts, and copy. No V2 admin exists.
3. **Small-Business Portal** — `src/components/B2B/SmallBusinessDashboard.tsx`. Tier differentiation exists as a component but is **V1-styled** and gated by the V1 $199 storefront; missing V2 branding/layout/copy.
4. **Enterprise Portal** — `src/components/B2B/EnterpriseDashboard.tsx`. V1-styled enterprise dashboard ($499 tier); missing V2 branding/navigation/layout/copy.

## What exists (not UI completion)
- Backend/auth/emulator foundation (server-authoritative, non-financial booking, fail-closed local-Firebase precommission mode). **Backend wiring — explicitly not counted as UI completion.**
- The functional V1 browser shell.
- The approved V2 visual language (brand kit + mobile `V2Theme`) — available to adopt, never applied to the browser.

## Dependency
No completed V2 browser UI exists to launch; producing it is a **new implementation** and first requires an **approved V2 browser design decision in Issue #19 — screen by screen for Web, Admin, Small-Business Portal, and Enterprise Portal** — which does not yet exist. No design proposal or UI implementation was drafted here per instruction.
