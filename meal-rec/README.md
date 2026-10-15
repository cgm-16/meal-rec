<!-- ABOUTME: README for the meal-rec Next.js app package inside the monorepo -->
<!-- ABOUTME: Covers app-level commands; the root README.md covers setup and architecture -->

# meal-rec (Next.js app)

The web app for the meal recommendation PWA. Setup, environment variables and architecture are in the [root README](../README.md); this package depends on `@meal-rec/core` (scoring engine) and `@meal-rec/database` (Mongoose models).

## Commands

Run from this directory with pnpm:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server on http://localhost:3000 (service worker disabled) |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint over `src/` |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm test:e2e` | All Playwright specs against a production build; needs MongoDB on `localhost:27017` |

## Layout

- `src/app/` — pages and API routes (`/api/recommend`, `/api/feedback`, `/api/auth/*`, `/api/meals`, `/api/analytics`)
- `src/components/` — `MealCard`, `Navigation`, `LoadingSpinner`
- `src/lib/` — NextAuth configuration, constants, Open Graph helpers
- `src/sw.ts` — Serwist service worker
- `tests/` — Playwright specs; `scripts/e2e-seed.js` seeds their database
