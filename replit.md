# المصحف والصلاة

تطبيق عربي RTL للهاتف يجمع القرآن الكريم، مواقيت الصلاة، القبلة، الأذكار، والتقويم الهجري مع دعم PWA وحفظ التفضيلات محلياً.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mushaf-prayer run dev` — run the mobile-first web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mushaf-prayer/src/App.tsx` — application routes, state, public API clients, and page components
- `artifacts/mushaf-prayer/src/index.css` — shared RTL theme, light/dark tokens, and visual utilities
- `artifacts/mushaf-prayer/public/manifest.webmanifest` — install metadata for the PWA
- `artifacts/mushaf-prayer/public/sw.js` — app-shell and runtime cache service worker

## Architecture decisions

- The first release is frontend-only: public AlAdhan and AlQuran Cloud endpoints provide prayer and Quran data without a database.
- Device-specific state (settings, favorites, bookmarks, last read position, and adhkar progress) is kept in localStorage so the app works without accounts.
- Geolocation starts from a real Makkah coordinate as a permission-safe fallback and can be replaced by the device location from the visible refresh controls.
- Quran reading keeps a recitation configuration seam so an audio endpoint and reciter selector can be added without changing verse data.

## Product

The app provides a home overview with live prayer times and countdown, all 114 surahs with search and Arabic reading, qibla direction with sensor fallback, categorized adhkar with counters, Hijri/Gregorian dates, dark mode, prayer calculation settings, and PWA installation guidance.

## User preferences

- Arabic is the default language and the primary interaction direction is RTL.
- The requested experience is mobile-first, polished, fast, and suitable for Android browsers.

## Gotchas

- The artifact workflow supplies `PORT` and `BASE_PATH`; use the managed workflow or pass both when running a manual Vite build.
- Prayer times and Quran content require network access; retry states are part of the UI and should remain visible when APIs fail.
- Location and device orientation require browser permission and may not be available in a desktop preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
