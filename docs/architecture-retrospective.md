# Architecture Retrospective

## ABOUTME: Evidence-backed retrospective on the recommendation engine and the gap between documented and actual behaviour
## ABOUTME: Includes prior-work analysis, a scale-filtered survey of recommender techniques, and a prioritised remediation list

A rendered version of this document is available as a shareable page:
<https://claude.ai/code/artifact/dfedc1b3-6c87-41fe-821f-c165703f87ce>

Verified against commit `01f48a2`. Every finding below was produced by reading or
running the code, not by reading the documentation.

---

## Summary

`meal-rec` is a Next.js 15 PWA in a pnpm monorepo that shows a random meal and
collects a reaction. Around that sits a substantial amount of real engineering: a
pure-TypeScript scoring engine, MongoDB models, NextAuth, an analytics dashboard,
service-worker offline support, Sentry, load tests, and a CI pipeline with a Mongo
service container.

The scoring engine is not connected to the product. `meal-rec/src/app/page.tsx`
calls `/api/meals/random`. It has never called `/api/recommend`. The quiz writes
answers to `localStorage` and nothing reads them back. The weather module has no
callers.

The components are real. The composition is not. The recommendation system was not
abandoned mid-build — it was completed in isolation and never wired in, which means
the remaining work is small and the existing code is mostly worth keeping.

| Metric | Value |
| --- | --- |
| UI callers of `/api/recommend` | 0 |
| Meals in seed data | 91 (README claims 5000+) |
| Lines in the "ML" engine | ~180 |
| Lines of test code | 4,990 |
| Tests crossing an integration seam | 0 |

---

## Finding 1 — The recommendation path is dead

**Severity: critical.**

The engine, its API route, the quiz answers and the weather module form a complete
feature that is unreachable from the running application. What ships is a uniform
random meal picker.

```
$ grep -rn "api/recommend" --include="*.tsx" --include="*.ts" .
packages/scripts/loadtest.ts:75              url: '/api/recommend'    <- load test only
meal-rec/src/app/api/recommend/route.test.ts                          <- its own tests only
(no .tsx component anywhere)

$ grep -rn "quizAnswers" .
meal-rec/src/app/quiz/page.tsx:40            localStorage.setItem(...) <- write
(no corresponding read)

$ grep -rn "getCurrentWeather\|navigator.geo" .
packages/core/src/weather.ts:27              export async function ... <- definition only
(zero callers, no geolocation prompt anywhere)

$ sed -n '17p' meal-rec/src/app/page.tsx
      const response = await fetch('/api/meals/random');
```

Three separate features — quiz personalisation, feedback learning, and weather
awareness — terminate in dead ends. Each was built. None was wired.

---

## Finding 2 — It is not machine learning

**Severity: significant (documentation).**

The README describes "ML-based scoring with feedback loops" and an "ML-powered"
endpoint. `packages/core/src/recommender.ts` contains a hand-tuned linear scoring
function with five hard-coded constants:

```
score = 1.0                                   # base
      + (like ? +0.4 : dislike ? -0.4 : 0)    # exact meal ID match only
      - 0.05 * |quiz.spiciness - meal.spiciness|
      + (meal.weather.includes(w) ? 0.2 : 0)
score *= 1 + (surprise / 10) * rand(-0.5, 0.5)

return validMeals.sort(desc)[0]               # argmax - always the top one
```

There is no model, no training, and no data-derived weight. Every coefficient was
chosen by hand and is frozen. This is a reasonable heuristic for a v1; it is simply
not what "ML-powered" means to a reader.

---

## Finding 3 — Measured engine behaviour

**Severity: significant.**

Run against a synthetic 20-meal pool. These are measured results.

| Probe | Expected by the docs | Measured |
| --- | --- | --- |
| Surprise factor 0 | varied meals | 1 distinct meal / 200 calls |
| Surprise factor 10 (max) | high variety | 5 distinct / pool of 20 |
| User likes a meal, asks again | learns your taste | same meal 50 / 50 times |
| User dislikes a meal with an identical twin | avoids similar meals | serves the twin |
| PRNG seeded with `Date.now()` | uniform randomness | exceeds float precision |

Causes:

- **It takes the argmax, not a sample.** `selectRecommendation` sorts and returns
  `validMeals[0]`. With surprise at 0 the function is fully deterministic.
- **Liking something pins it.** A `like` adds `+0.4`, the largest term in the model,
  so the liked meal becomes the argmax and stays there. For a discovery product the
  sign is arguably backwards.
- **Feedback cannot generalise.** Scoring keys on `meal._id` and nothing else. The
  system can memorise "not this exact record", never "you dislike shellfish".
  `getLikedFlavorTags()` exists to solve exactly this, is exported and unit-tested,
  and is called by nothing.
- **Modelled signal goes unused.** `timeOfDay`, `heaviness` and `cuisine` are defined
  in the schema, populated in the seed data, rendered in the UI, and never scored.
- **The PRNG is broken.** The LCG computes `seed * 9301 + 49297`; seeded from
  `Date.now()` that is approximately 1.66e16, past `Number.MAX_SAFE_INTEGER`
  (9.01e15), so it silently loses integer precision.

In production the variety users perceive comes from `$sample: { size: 50 }` in the
API route, not from the scorer — and since the home page never calls that route, none
of it is live.

---

## Finding 4 — Documentation accuracy

**Severity: critical.** This is the part actively misleading a reader. The README and
`FUTURE_ENHANCEMENTS.md` contradict each other within the same repository.

| Claim | Verified |
| --- | --- |
| "Weather Integration ✅ Complete" | zero callers; `FUTURE_ENHANCEMENTS.md` lists it as missing |
| "5000+ meal entries" | 91 entries in `data/meals.json` |
| "96% unit/integration test coverage" | pass rate, not coverage; app has no coverage instrumentation |
| "Recommendation Engine — ML-based scoring" | fixed linear formula, 5 hand-set constants |
| "ML-powered recommendations" endpoint | route exists; no UI reaches it |
| "Comprehensive Testing" | 4,990 test LOC, zero tests on the integration gap |

`docs/test-failures-analysis.md` correctly says "~96% *pass rate*". The README
rewrote this as "96% test coverage" and then "97% test coverage across all layers".
Nothing measures coverage for the app package; only `packages/core` configures
thresholds, and CI runs `pnpm test` without the coverage flag, so even those are never
enforced.

Test suite run after `pnpm -r build`, as CI does:

```
 Test Files   3 failed | 16 passed (19)
      Tests   127 passed | 19 skipped (146)
      exit code: 1
```

In fairness: 146 total matches the README, and the 19 skips are DB-backed route tests
requiring `mongodb-memory-server` to fetch a binary — they likely pass in CI where
Mongo runs as a service. The suite exits non-zero, so CI does catch real failures.
The concern is that when the database is unreachable those 19 skip *silently*, and
`CLAUDE.md` requires test output to be pristine.

---

## Finding 5 — Correctness and security

| Issue | Severity | Detail |
| --- | --- | --- |
| Two identity mechanisms | significant | `/api/feedback` uses `getServerSession()`; `/api/recommend` reads and trusts a raw `x-user-id` header. Anyone can pass another user's ID. |
| PIN hashed on the client | significant | `auth/signup/page.tsx` runs `bcrypt.hash()` in the browser and POSTs `hashedPin`, stored verbatim. Server never verifies the PIN is four digits or that the value is a bcrypt hash. 4-digit space, no rate limiting or lockout anywhere. The `banned` field is never read. |
| Guest feedback is write-only | minor | Guest ratings go into a module-level `Map` nothing reads; the recommend route only loads feedback from Mongo by user ID. Per-instance on Vercel. For logged-out users the buttons do nothing. |
| Signup writes non-existent fields | minor | Route sets `preferences: { dietaryRestrictions, preferredCuisines, spiceLevel }`; `UserSchema` defines `spiciness`, `surpriseFactor`, `ingredientsToAvoid`. Mongoose silently discards all three. |
| Serverless-hostile DB setup | minor | `connect()` calls `mongoose.connect()` per request with no cached-connection guard and `minPoolSize: 5`. `startFeedbackCleanupCron()` schedules a `node-cron` job that is never called and could not fire reliably on Vercel; there is no `vercel.json` cron either. |

---

## How this happened

Fifty commits: ten in late June/early July 2025, a two-month gap, then forty between
September 2nd and 5th. The September titles are the diagnosis:

```
Fix E2E testing timeout by restoring sufficient analytics test data
Fix E2E test timeouts by using real database operations
Skip failing PIN validation E2E test temporarily
Fix Playwright tests to match actual implementation
fix: complete test suite overhaul - achieve 100% test success
Disable Sentry in E2E tests to prevent DSN initialization errors
```

Almost the entire final push was test and CI firefighting. *"Fix Playwright tests to
match actual implementation"* is the tell: at the end, tests were reshaped to fit the
code, while `CLAUDE.md` mandates the opposite.

This is how a disconnected engine survives 4,990 lines of tests. The E2E test named
**"Quiz Flow — Take quiz and get recommendations"** completes all three quiz steps,
lands on the home page, and asserts:

```ts
await expect(page.locator('[data-testid="meal-card"]')).toBeVisible();
```

That passes whether or not the quiz influenced anything. Every test checks that a
component *renders*; none checks that the product *works*. The problem is not too few
tests — it is that they all sit inside vertical slices and none crosses a seam.

**Diagnosis:** the project was built from a 20-prompt code generation plan. Each
prompt produced a coherent, typed, tested component. No prompt owned the space
*between* components. That is the characteristic failure mode of plan-driven
codegen — integration is assumed to be the trivial remainder, and it is where the
product actually lives. The documentation then described the plan rather than the
artifact.

---

## Prior work — the 2022 weather-classifier thesis

A 2022 undergraduate thesis (HUFS, AI Convergence) predicts which food keyword tops
Korea's national daily search trend from weather and calendar variables. It is the
intellectual ancestor of the `+0.2` weather term, and the live question is whether
meal-rec should *learn* that relationship instead of hard-coding it.

**Method:** `HistGradientBoostingClassifier` over daily avg/min/max temperature,
`is_rain`, `is_snow`, `is_holiday`. Label: top-ranked of ~18 Korean dishes by Naver
DataLab search index. One year of data expanded to 16,425 rows via rank-weighted
duplication (rank 1 → 20x, rank 2 → 10x, …), split 70/30 at random.

**Result:** 0.44 accuracy, and the failure pattern matters more than the number.

| Dish | AUC | Reading |
| --- | --- | --- |
| Chicken | 0.46 | worse than random |
| Tteokbokki | 0.49 | coin flip |
| Gimbap | 0.51 | coin flip |
| Naengmyeon | 0.94 | strong seasonal signal |
| Samgyetang | 0.98 | strong seasonal signal |
| Sundae | 1.00 | n=30, small-sample artifact |

**Transferable conclusion:** weather predicts strongly seasonal dishes and says almost
nothing about staples. People eat chicken in every kind of weather.

**Verdict: keep the hand-tuned weather term; do not learn it.** At ~16,000 rows of
real national-scale data, a tuned gradient-boosted model could not beat a coin flip on
the items people eat most. meal-rec would attempt the same with individual-level
rather than population-level data, at a fraction of the volume, on a stack with no
Python runtime, no training pipeline and no feature store.

### Was it the data or the method?

The data critique is real and dominant:

- **The label is a normalised index, not counts.** DataLab returns a relative 0–100
  search index, so the rank-duplication weights are a fabricated cardinality — an
  assumed distribution imposed on data that never contained one. No model choice
  fixes that.
- **Search interest is a proxy for consumption**, not a measure of it. Payment- or
  order-backed data would be a far better label.
- **Weather was coarsened twice** — national daily aggregates with no regional
  granularity, and rain/snow reduced to threshold-derived booleans.

Two problems are methodological, and both bias the reported accuracy *optimistically*,
meaning true out-of-sample performance was likely worse than 0.44:

- **A random 70/30 split on an autocorrelated time series leaks.** Adjacent days share
  weather and share trends, so training on January 14th and testing on the 15th lets
  the model see its own answer. A chronological or rolling-origin split is correct here.
- **Rank duplication inflates *n* without adding information.** 365 days became 16,425
  rows, but there are still only 365 independent observations. Every metric behaves as
  though there were ~45x more evidence than exists — which is what AUC 1.00 at n=30 is
  showing.

One issue is both at once: **the strongest available predictor went unused.**
Yesterday's ranking is almost certainly the best single predictor of today's, and lag
features cost nothing. The same blind spot about temporal structure both leaked signal
through the split and left signal on the table in the feature set.

A structural note relevant to this codebase: the thesis collapses a ranked
distribution into single-winner classification, discarding most of the label's
information. Per-dish regression on the index would have used all of it. That is the
same argmax-instead-of-distribution decision `selectRecommendation` makes, one layer up.

Model rot stands independently and is decisive: this approach decays without periodic
data collection and retraining, and meal-rec has no scheduled-job infrastructure to
carry that.

---

## Recommender techniques, filtered by scale

Sorted by whether each survives contact with a 91-item catalog and near-zero
interaction history. Most famous techniques do not, because they solve a problem this
project does not have.

| Technique | Fits? | Reason |
| --- | --- | --- |
| Content-based filtering on item attributes | **Yes** | Standard answer for a small catalog with no behavioural data; features already in the schema |
| Sampling from top-K instead of argmax | **Yes** | Directly fixes lock-in and variety; self-contained change |
| Thompson sampling / contextual bandits | **Later** | Hand-rollable in TypeScript, but needs impression logging the schema lacks |
| Item-to-item collaborative filtering | No | The 91x91 table is trivial, but its similarity comes from co-purchase volume that does not exist |
| Matrix factorisation / latent factors | No | Degrades under sparsity, no cold-start story of its own |
| Two-stage candidate generation → ranking | No | Solves large-corpus retrieval; 91 items can be scored in full every request |
| Learned session embeddings (Airbnb, Pinterest) | No | Trained on ~800M sessions and ~3B-node graphs — six to ten orders of magnitude away |
| Learning-to-rank | Not yet | No labelled preference volume, no offline harness to prove it beats five constants |
| Trained weather/calendar classifier | No | Its own results argue against it, at far larger scale |

### Two findings that change the fix

**Noise before an argmax is not sampling.** The `surprise` multiplier cannot fix
lock-in however it is tuned. A `like` adds `+0.4`, which exceeds the noise band the
multiplier produces, so the favoured meal still wins deterministically. The selection
step itself has to change.

**The tag vocabulary is nearly as large as the catalog.** The seed data holds **86
unique `flavorTags` across 91 meals**, and ~39 cuisines of which most have one or two
entries. Overlap between any two meals will usually be zero or one tag, so flavour-tag
similarity is a thin, noisy signal. Content-based scoring should lean on coarse
attributes — `cuisine` group, `heaviness`, `spiciness` band — before fine-grained tags,
and the tag vocabulary probably needs consolidating first.

---

## Remediation, ordered

1. **Correct the README.** Weather is not implemented. 91 meals, not 5000+. "Pass
   rate", not "coverage". Describe the engine as heuristic scoring, not ML. Zero risk,
   and it removes the only part of this project that actively misleads.
   *(~1 hour, no code change)*

2. **Wire the engine to the home page.** Read `quizAnswers` from localStorage, POST to
   `/api/recommend`, render the result. This is the change that makes the headline
   feature true. *(~half a day)*

3. **Sample from the top K instead of taking the argmax.** Weighted-random or softmax
   selection over the top handful of scored meals. Tuning `surprise` is not an
   alternative — see above. Keep the `randomSeed` path intact so deterministic tests
   still hold. *(~1 hour)*

4. **Make feedback generalise.** Score attribute overlap, not just exact meal ID, and
   add the symmetric dislike signal. Start with coarse attributes because of the tag
   sparsity above. `getLikedFlavorTags()` is already written and tested. *(~1 day)*

5. **Unify identity on the session.** Drop the trusted `x-user-id` header from
   `/api/recommend`. *(~1 hour)*

6. **Add one test that crosses the seam.** Set a quiz preference excluding an
   ingredient, then assert the recommended meal does not contain it. One test of this
   shape would have caught everything above. *(~2 hours)*

Steps 2 through 4 are the whole gap between "random meal picker" and the product the
README describes — roughly two days.

**Deliberately deferred:** Thompson sampling over per-meal arms is the principled
version of step 3 and subsumes it, but needs impression logging — `Feedback` holds one
row per `(user, meal)` with only the latest reaction, and a bandit needs successes
*and* trials. Ship the simpler fix first. Also worth revisiting eventually:
`$sample: { size: 50 }` draws more than half a 91-item catalog every request, which is
not candidate generation, just cost.

---

## What is worth keeping

- **The `packages/core` boundary is textbook.** The recommender is a pure function
  over plain data — no database, no framework, no I/O. That is why its 36 tests run in
  550ms and why steps 3 and 4 are cheap. The engine being unplugged is a wiring
  failure, not a design failure; the seam is in the right place.
- **`scoreBreakdown` on every scored meal.** Every result carries its per-term
  contributions — real foresight for debuggability.
- **The injectable `randomSeed`.** Designing the determinism hook in from the start is
  why the behavioural probes above were possible to write.
- **The analytics feature genuinely works.** `/explore` aggregates real feedback into
  top liked/disliked meals and popular flavour tags, end to end, with no gap between
  claim and behaviour. The README undersells it.
- **Real infrastructure.** CI with a Mongo service container, lint and build gating,
  centralised constants, working PWA offline support, Sentry wired properly.
