<!-- ABOUTME: Runs the opt-in collector and immutable three-model pilot benchmark. -->
<!-- ABOUTME: Separates constructed verification and public ratings from pending genuine study evidence. -->

# Meal-appeal pilot runbook

The collector at `/pilot` is separate from the production recommendation feed. The [measured full UCI result](results/uci-three-models.md) compares observed restaurant ratings: the personal-rate control had the lowest main-table loss, and no reliable candidate advantage was established. UCI has no immediate appetite, hunger or weather observations. Predictive fit does not establish increased feed acceptance, purchase or consumption.

**Genuine pilot launch, enrollment and the actual 14-day response window remain unfinished empirical work.** Automated browser records, export/fit/score fixtures and CI smoke outputs are constructed verification, never participant evidence. A private-study license or `automated_fixture=false` does not authenticate collection.

## Configure the study before enrollment

Use Node 22, the repository's pnpm version, Python 3.12 and the locked environments. From the repository root:

```sh
eval "$(fnm env --shell zsh)"
fnm use 22.23.3
pnpm install --frozen-lockfile
pnpm --filter @meal-rec/database build
```

Copy `contracts/meal-prediction/study.example.json` to a private location. Replace every placeholder with the actual study ID, study/protocol version, frozen catalog version and SHA-256, shared UTC start, seed 42, and disambiguated city options (GeoNames ID, label, country/admin area, coordinates and canonical IANA timezone). Retain the exact frozen catalog bytes and configuration outside Git. The CLI derives immutable day-five, day-seven and day-fourteen cutoffs from the start. Do not substitute example dates or a catalog hash unrelated to the intended catalog.

Use an explicitly selected study database; never run the destructive E2E seed against participant data:

```sh
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:study --config /absolute/private/study.json
```

Study configuration is immutable. Set the app's `MONGO_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` and **matching** `PILOT_STUDY_ID` before building/starting the app with the existing deployment workflow. An unset study ID disables the pilot; a configured missing study is an error. Deployment/database access, actual study dates and enrollment are launch inputs; these commands neither provision infrastructure nor enroll people. Keep credentials and private exports out of Git. Set `NEXT_PUBLIC_SENTRY_DSN` to an explicit empty string when uploads should be disabled; an unset variable retains the default monitoring destination.

Use the normal username/PIN signup and signin screens. Each person must explicitly opt in, select a server-resolved city match and enter any dietary exclusions. Enrollment timezone fixes the participant-day quota; travel city timezone affects the prediction clock. Settings changes require a fresh visit/context. Each visit lasts 30 minutes. Optional hunger is `not_hungry`, `somewhat_hungry`, `very_hungry` or missing.

The collector samples up to five distinct compatible meals per participant-day and records a smaller eligible pool as shortage. It acknowledges an exposure only after display. Yes means 1, No means 0; Not sure is retained separately and excluded from binary fitting/scoring. Skip and leaving a displayed card supply no binary answer. Save retries and refreshes preserve the saved allocation/exposure IDs. Reconnecting no longer automatically reloads the app, so a pending pilot save remains available for manual retry. This applies throughout the app. Pilot API reads and `/pilot` navigation require the network; a service-worker cache must never supply their responses while offline.

## Choose authorized weather access

Default `PILOT_WEATHER_ACCESS_MODE=disabled` still runs the actual collector and records unavailable weather with `access_disabled`. Configured city choices remain usable. The live provider check was not run for implementation acceptance because no authorized access was configured.

Before enabling `noncommercial`, confirm that the actual use qualifies for the provider's terms; use `customer` only with authorized `PILOT_WEATHER_CUSTOMER_KEY`. Do not expose that key in client code or artifacts. Sources are [Open-Meteo](https://open-meteo.com/) and [GeoNames](https://www.geonames.org/); retain attribution and provider/access/grid provenance. Weather is model-based, not an observation at the participant's exact location. Requests time out after three seconds; data older than one hour or more than five minutes in the future is unavailable. Missing fields and timezone mismatches remain explicit. Do not infer that weather has no predictive value from a run without usable weather.

With authorized access configured, exercise normal city search and a new visit, inspect the saved provider host/access mode, valid/retrieval clocks, grid coordinates, units and nullable measurements, then confirm those exact values in an export. Provider errors remain missing context, not synthetic weather. No provider account, purchase or access permission is created by this runbook.

## Export week one, select settings and freeze

Keep raw inputs, models, bundles and reports in private directories outside Git. Private-study attribution is `cgm-16`, with Open-Meteo and GeoNames attribution retained; no redistribution license is granted for study data. From `benchmarks/meal_prediction`:

```sh
uv sync --frozen
```

From the repository root, publish a **new** development directory:

```sh
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:export --study-id STUDY_ID --phase development --destination /absolute/private/development-bundle
```

A complete bundle contains `snapshot.json`, `collection.json` and `SHA256SUMS`, written last as the completion marker. The exporter refuses an existing destination. Production fit/score require the directory and verify **both** digests; explicit-file `validate` is schema validation only. Do not edit JSON, relink a hand-built manifest or regenerate hashes to bypass a failed check. Supported timestamp spellings are retained raw: nonzero fractional digits beyond six are rejected; extra trailing zeroes are accepted.

The fixed half-open intervals are training `[T0,T0+5d)`, development `[T0+5d,T0+7d)` and test `[T0+7d,T0+14d)`. Display and receipt must be in the same interval. Cross-cutoff, uncertain, unanswered and otherwise invalid rows are excluded and counted, never coerced to negative labels. Development exports withhold week-two outcomes. Development mutable lifecycle counts are unavailable because timestamped history does not exist; final lifecycle counts describe persisted states as of export, not historical reconstruction.

From `benchmarks/meal_prediction`:

```sh
uv run --frozen python -m meal_prediction validate --input /absolute/private/development-bundle/snapshot.json
uv run --frozen python -m meal_prediction fit --input /absolute/private/development-bundle --output /absolute/private/freeze
```

Fit/freeze before inspecting test outcomes. If any test outcomes were already inspected, add `--test-outcomes-inspected` at fit time and retain that declaration. Prospective classification requires **both** `selected_at` and `frozen_at` at or before day seven and no declared inspection; late or inspected freezes are retrospective. Allow enough time for fitting; accept the retrospective label when late. Never backdate timestamps, change cutoffs or suppress an inspection declaration. Software cannot prove that no outside viewing occurred. Final scoring also requires unchanged week-one source inputs; additional or altered fitting evidence is incompatible with the saved freeze.

The native CPU run attempts nine prespecified settings per family in all F0–F3 presets (108 tuning slots), selects by participant-balanced development log loss with fixed ties, selects primary F3 and its reference without week-two labels, and refits seeds 42/43/44. All three actual families run: sklearn logistic, categorical CatBoost and River FM. Global rate, personal rate and the calibrated pinned production heuristic are retained controls. Failed settings and NotEstimable cases remain visible; no preferred-model assertion, post-test retuning or test-selected seed is permitted. There is no pilot smoke mode.

Keep `freeze/manifest.json`, `manifest.sha256` and every artifact together. The original development `source_manifest`, exact raw `development_snapshot_sha256`, semantic `development_sha256`, cutoffs, selected settings, runtime and feature/model hashes are distinct evidence. Pilot freezes have no future test IDs; scoring derives common valid final IDs without changing the freeze. Only load trusted locally produced freezes: hashes detect corruption, not authenticity, and pickle can execute code.

## Export the final window and score once under the frozen protocol

After the actual study window and responses are complete, use the **actual** frozen manifest in the Node CLI, from the repository root:

```sh
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:export --study-id STUDY_ID --phase final --destination /absolute/private/final-bundle --freeze-manifest /absolute/private/freeze/manifest.json
```

The CLI verifies the manifest checksum, raw development hash and immutable study/version/catalog/cutoff/seed identity before publishing the final bundle. From `benchmarks/meal_prediction`:

```sh
uv run --frozen python -m meal_prediction score --freeze /absolute/private/freeze --input /absolute/private/final-bundle --output /absolute/private/report
```

The scorer verifies the complete bundle, exact FreezeLink, original study identity, unchanged week-one evidence and freeze/runtime/artifact hashes before loading models. Candidate features see outcome-free exposures; only the evaluator sees final labels. No feature vocabulary, history or model is updated by scoring. New people/items use frozen unknown-feature behavior.

Retain `report.md`, `report.json` and `predictions.jsonl`, including all families/presets/seeds, controls, raw aligned probabilities, support/missingness, paired differences, calibration, collection audit, runtime/memory and integrity hashes. Report participant-balanced log loss as primary; event means are secondary. The 2,000 paired seed-42 participant draws and circular two-day date blocks are exploratory. Group intervals need two represented participants; solo results are within-person. Fewer than five nonempty test dates, one observed class or an unavailable selected comparison is insufficient evidence. A provisional useful gain needs at least 5% relative loss reduction and positive available paired bounds (both group and time for group mode). Preserve that numeric/support result alongside retrospective/constructed provenance; it is not an authenticity or causal claim. Hunger/weather increments are predictive associations.

## Repeat the constructed acceptance check safely

Use a dedicated MongoDB 8 database named exactly `meal-rec-e2e-test`, locked installed browsers, the built workspace packages, and the Python environment above. Nothing else may be listening on port 3000; Playwright refuses reuse. Supply the same explicit URI to the test process; configuration passes it to the app and assertions/export CLI retain it:

```sh
node meal-rec/scripts/e2e-pilot-study.js --self-check
pnpm build
MONGO_URL=mongodb://127.0.0.1:27017/meal-rec-e2e-test pnpm --filter meal-rec exec playwright test tests/pilot.spec.ts tests/e2e-flows.spec.ts tests/pwa-installability.spec.ts --project=chromium --project=webkit --reporter=list
```

**This resets that dedicated database**, creates the constructed study and three test meals, and uses normal UI authentication/opt-in, a real second browser context, offline retry/cache checks, MongoDB assertions, the built Node exporter and Python validator. The smaller pool/shortage and all four action meanings are asserted. Export proof and a screenshot are retained in a `meal-rec-pilot-*` temporary directory and attached to Playwright results. Use a different URI port for your own isolated MongoDB, never a participant database. Stop only resources you own after preserving artifacts. This check cannot replace an actual study window or the authorized live-weather check.

CI keeps Node 22/MongoDB 8 and existing checks, installs frozen JS/Python dependencies, runs the Python suite including the real official UCI three-family smoke test, and runs the real browser acceptance paths. It does not run a full research sweep on each PR. CI configuration is local until an actual workflow run supplies remote evidence.
