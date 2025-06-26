# Meal Recommendation PWA – LLM Code‑Gen Prompt Set

Below are **20 self contained prompts**.  
Feed them *one by one* to your favorite code generation LLM, waiting for all tests to pass after each prompt before moving on.

---

## Prompt 01 — Initialize Monorepo ✅ COMPLETED

```text
You are ChatGPT acting as a senior full-stack engineer.

**Goal**: Bootstrap a TypeScript monorepo for the Meal Recommendation PWA.

Tasks  
1. Run `pnpm create next-app meal-rec --ts --eslint --tailwind --src-dir --import-alias @/*`.  
2. Add workspaces `"packages/*"` in root `package.json`.  
3. Create `packages/config` with shared `eslint`, `prettier`, and `vitest` configs.  
4. Install Vitest + Testing Library + jsdom.  
5. Configure Vitest in `vitest.config.ts` for React 18.  
6. Add first test `app/App.test.tsx` that renders `<Home />` and asserts “Hello MealRec”.  
7. Add GitHub Actions workflow `.github/workflows/ci.yml` running `pnpm lint && pnpm test`.  

Deliver  
- All code + config.  
- Command to run the tests (`pnpm test`) should exit 0.

Return **only** the diff/patch; no prose.
```

---

## Prompt 02 — Database Package & Schemas ✅ COMPLETED

```text
**Context**: Repository from Prompt01 exists. Create `packages/database`.

Tasks  
1. Inside `packages/database`, install `mongoose` and `ts-node`.  
2. Create `src/models/meal.ts` defining the schema:

```ts
{
  name: { type: String, required: true, index: true },
  cuisine: String,
  primaryIngredients: [String],
  allergens: [String],
  weather: [String],           // e.g., "cold", "hot", "rain"
  timeOfDay: [String],         // "breakfast", ...
  spiciness: { type: Number, min: 0, max: 5 },
  heaviness: { type: Number, min: 0, max: 5 },
  imageUrl: String,
  description: String,
  flavorTags: [String],
}
```

3. Add `src/models/user.ts` (username, hashedPin, preferences).  
4. Add `src/models/feedback.ts` (user, meal, type{like|interested|dislike}, timestamp).  
5. Write unit tests validating required fields and index creation.  
6. Export a helper `connect()` that reads `MONGO_URL` env var.  

Return the full code and passing tests only.
```

---

## Prompt 03 — Seed Script

```text
Write `packages/database/src/seed.ts`.

Tasks  
1. Read `data/meals.json` (we will provide this file later).  
2. Connect to Mongo, wipe existing `Meal` collection, bulk‑insert array.  
3. Exit process with code0 when done.  
4. Add npm script `"seed": "ts-node packages/database/src/seed.ts"`.  
5. No unit tests needed, but run script in CI behind a `--dry-run` flag.

Deliver code only.
```

---

## Prompt 04 — REST Endpoints: GET /api/meals & /random

```text
Add API routes in Next.js `src/pages/api/meals`.

Tasks  
1. `GET /api/meals` – query params `page`, `limit`; return paginated list.  
2. `GET /api/meals/random` – returns one random meal.  
3. Use the DB `connect()` helper.  
4. Add contract tests with Vitest + supertest; mock DB with in‑memory‑mongo.  

Return code + tests.
```

---

## Prompt 05 — Frontend MealCard Component

```text
Create `src/components/MealCard.tsx`.

Requirements  
- Displays meal image (fallback placeholder), name, flavor tag pills.  
- Accepts `onLike`, `onInterested`, `onDislike` callbacks.  
- Unit test renders props and fires callbacks on button clicks.  
- Style with Tailwind; card max-width420px; mobile‑first layout.

Return code + test.
```

---

## Prompt 06 — Page Wiring & Random Recommendation

```text
Build `src/pages/index.tsx`.

Steps  
1. On mount, fetch `/api/meals/random`.  
2. Render `MealCard`, wire buttons to POST `/api/feedback`.  
3. On feedback success, refetch random meal.  
4. Show SVG loader (“fork‑and‑knife spinner”) between requests.  
5. Add integration test with React Testing Library using `msw` to mock API.

Return code + tests.
```

---

## Prompt 07 — Feedback API & Model Tests

```text
Implement `POST /api/feedback`.

Specs  
- Body: `{ mealId: string, type: "like" | "interested" | "dislike" }`.  
- For guest (no session) save feedback in memory (TTL2h).  
- For auth user, persist in `Feedback` collection.  
- Respond `{ ok: true }`.

Write unit tests covering all branches (guest vs user).

Return code + tests.
```

---

## Prompt 08 — Quiz Flow & Local Storage

```text
Add `/quiz` route.

Tasks  
1. Multi-step form collecting ingredientsToAvoid (array), spiciness (0‑5), surpriseFactor (0‑10).  
2. Persist answers to `localStorage.quizAnswers`.  
3. Redirect to `/` after submission.

Provide component code + RTL tests (simulate form fill + submit).
```

---

## Prompt 09 — Recommendation Enginev1

```text
Create pure TS module `packages/core/recommender.ts`.

Requirements  
- Inputs: `quiz`, `recentFeedback`, `weather`, `candidateMeals`.  
- Output: best‑scored `Meal`.  
- Scoring rule:  
  • start = 1.0  
  • +0.4 if meal has tag liked in feedback last2weeks  
  • −0.4 if disliked  
  • Spiciness distance penalty: −0.05 × |quiz.spiciness − meal.spiciness|  
  • Weather match +0.2  
  • SurpriseFactor: multiply final score by `(1 + surprise/10 × random(−0.5…0.5))`.

Add 95% test coverage with deterministic random seed.

Return module + tests.
```

---

## Prompt 10 — Integrate Engine into `/api/recommend`

```text
Add new endpoint `/api/recommend`.

Flow  
1. Gather inputs (quiz answers from session or localStorage, user feedback last14d, weather util).  
2. Query DB for50 random candidate meals.  
3. Call `recommender.select()`.  
4. Return selected meal.

Add contract test mocking weather util and DB.

Code only.
```

---

## Prompt 11 — Username+ PIN Auth

```text
Use NextAuth with CredentialsProvider.

Tasks  
1. Sign‑up page collects username + 4‑digit PIN, hash with bcrypt.  
2. Login page, session cookies 7d.  
3. Protect feedback persistence: authenticated only.  
4. Unit tests for hashing + login flow.

Return code + tests.
```

---

## Prompt 12 — Persisted Feedback & Sliding Window

```text
Modify Feedback model & query helpers.

Requirements  
- Store timestamp.  
- Query helper `getRecentFeedback(userId, days=14)`.  
- CRON (node-cron) to delete feedback older than 14d.  
- Tests for helper and cron.

Code only.
```

---

## Prompt 13 — Weather & Geo Utilities

```text
Implement `packages/core/weather.ts`.

Steps  
1. Use Open-Meteo API (no key) for `lat,lon`.  
2. Function `getCurrentWeather() → "cold" | "hot" | "rain" | "normal"`.  
3. Cache response in memory10min.  
4. Unit tests mock fetch.

Return code + tests.
```

---

## Prompt 14 — Explore Tab Analytics

```text
Backend  
- Aggregation pipeline: top10 liked meals, top10 disliked, top flavor tags.  

Frontend  
- `/explore` page with three charts (use recharts) and textual summary.  
- Loading/error states.

Integration tests verifying chart renders with mock data.
```

---

## Prompt 15 — Admin Portal

```text
Add `/admin` route gated by role.

Tasks  
1. Seed first admin user via env.  
2. Meal list table with edit/delete dialogs.  
3. User list with ban/unban.  
4. Cypress E2E test for admin workflow.

Return code + tests.
```

---

## Prompt 16 — PWA & Service Worker

```text
Enable `next-pwa`.

Steps  
1. Generate `public/manifest.json` (name, short_name, icons).  
2. Configure `next-pwa` with runtime caching for `/api/(meals|recommend)`.  
3. Add offline fallback page.  
4. Write Playwright test checking PWA installability.

Code only.
```

---

## Prompt 17 — Open Graph & SEO

```text
Add `<Head>` tags in `_app.tsx`.

Fields  
- og:title, og:type, og:image, og:url, og:description  
- Use default meal image as fallback.

Add jest-axe test ensuring meta tags present.

Deliver code only.
```

---

## Prompt 18 — Performance & Monitoring

```text
1. Add `@sentry/nextjs`, DSN from env.  
2. Add `packages/scripts/loadtest.ts` (artillery).  
3. Update CI to run load test on PR label `performance`.  
4. Provide docs in `docs/performance.md`.

Return code + docs.
```

---

## Prompt 19 — Final E2E & Lighthouse Gate

```text
1. Playwright suite: guest flow, auth flow, admin flow.  
2. GitHub Actions step runs `pnpm lighthouse` on preview URL; fail if score <90.  

Commit code & CI yaml.
```

---

## Prompt 20 — Release & Handover

```text
Produce `RELEASE_NOTES.md` summarising features, env vars, and run‑book.

No code – just the markdown file.
```

---

*End of prompt set.*
