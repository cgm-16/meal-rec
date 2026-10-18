# MealRec Three-Model Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement logistic regression, CatBoost, and a context-aware FM, compare them on real UCI data, and provide the agreed pilot collector/export/frozen-evaluation workflow.

**Architecture:** One file contract joins the existing Next/MongoDB collector to an independent local Python runner. Implement the public benchmark first, then collector persistence/UI and actual exports; the final browser/database/export check joins them. Keep all three candidates on common observations, features, and cutoffs without a hosted model service.

**Tech Stack:** Node 22, pnpm 10.12.3, Next/NextAuth/Mongoose/Vitest/Playwright; Python 3.12, uv, NumPy/SciPy/scikit-learn/CatBoost/River, pytest.

**Spec:** [Approved design](../specs/2026-10-18-meal-prediction-benchmark-design.md), approved by Ori after commit `c9c4521`. Read it alongside this plan.

## Global Constraints

- Implement and benchmark **all three** candidates: personalized regularized logistic regression, CatBoost, and a context-aware factorization machine.
- Yes is 1, No is 0, and Not sure remains a separate response excluded from binary fitting and scoring. Unanswered exposures remain unanswered.
- Use unit weights for retained training events. Primary log loss is calculated per participant and then averaged equally across participants with definite test labels.
- Training is `[T0, T0+5 days)`, development is `[T0+5 days, T0+7 days)`, and test is `[T0+7 days, T0+14 days)`.
- No second-week answer updates any candidate, baseline, profile, vocabulary, or feature.
- Nine settings per family/preset; tune with seed 42. Repeat selected stochastic fits with seeds 42/43/44; seed 42 is primary.
- Pilot F0/F1/F2/F3 progressively add identity/history, hunger, and weather; F3 is primary. Public UCI uses static F0/F1 only; F1 is the public main table.
- Five distinct eligible meals per participant-day; thirty-minute visits; weather timeout three seconds, maximum age one hour, maximum future offset five minutes.
- Use Python 3.12 in an isolated uv-managed project; use CPU only. Use the repository’s Node 22/pnpm conventions and frozen-lockfile installation.
- Follow TDD for functionality; real-data/model and real-system collector E2E use no mocked systems. Automated assessments never become genuine pilot evidence.
- Preserve unrelated edits and legacy recommendation/feedback behavior. New code keeps the repository’s two-line `ABOUTME` header. No backward compatibility or unrelated refactoring.
- Work in the existing isolated worktree. Before implementation create/reuse an appropriate feature branch; preserve the research history. Commit each coherent task with Conventional Commits.
- Do not contact volunteers, purchase access, deploy, merge, or replace the production engine. Study dates/enrollment/infrastructure/provider access remain launch inputs.

## Review Focus

1. Concurrent tabs, response retries after a successful write, and changed dietary exclusions must preserve one answer per exposure and five distinct daily allocations (Tasks 10–11).
2. Zero precipitation/code zero, partial/stale weather, and offline cached APIs must preserve missingness and provenance (Tasks 9, 11, 14).
3. Exact cutoff times, late responses, local-day/DST boundaries, and travelling participants must not move outcomes into earlier training or reset the quota (Tasks 2, 10, 13).
4. Empty/uncertain-only or single-class labels and sparse participant/day support must yield explicit insufficient-evidence reports (Tasks 4, 7).
5. Unseen IDs, never-active feature keys, altered held-out labels, and scoring order must not alter frozen feature/model/RNG state (Tasks 3, 6–7).

## File and interface map

`contracts/meal-prediction/` owns the version-1 document and small shared test examples. `benchmarks/meal_prediction/` owns `pyproject.toml`, `uv.lock`, the `meal_prediction/` module, tests, README and ignored `data/`/`runs/`; no build backend is needed (`tool.uv.package=false`). Python commands below run from that directory using `uv run --frozen python …`. JS commands run from the repository root unless a working directory is given. Initial dependency resolution intentionally creates a lock; subsequent installs/checks are frozen.

The Python contract defines frozen `Exposure` records without outcomes, `Target(event_id, y, received_at)`, `Dataset(source, manifest, events, targets, audit)`, `Split(train_ids, development_ids, test_ids, audit)`, and `FeatureBatch(ids, participant_ids, rows, events)`. Dataset events are an ordered tuple; targets map event ID to `Target`; audit entries contain event ID/reason. `rows` is an ordered tuple of dictionaries with string keys and float/string values; `events` retains aligned outcome-free exposures for the reference control. Candidate adapters consume only `rows`; metadata is reserved for alignment/evaluation/controls. IDs are strings; JSON timestamps are UTC ISO-8601 and become aware Python datetimes. Public event/receipt times are null. `labels_for(dataset, ids)` returns aligned binary targets; `events_for(dataset, ids)` returns outcome-free exposures.

The shared JSON envelope has `schemaVersion`, `source`, `manifest`, `participants`, `visits`, `allocations`, `exposures`, `responses`, and `audit`. Pilot responses use `yes|no|not_sure`; hunger uses `not_hungry|somewhat_hungry|very_hungry|null`. `manifest` contains study/protocol/catalog versions, UTC boundaries, quota timezone rule, seed, export phase/time, source provenance and freeze linkage. Each entity carries stable IDs/references; response receipt and display acknowledgement are distinct. `pilot-v1.example.json` is explicitly a test fixture; it is never an empirical input.

The TS definitions live in `packages/database/src/pilot/types.ts`. Define `CitySelection` (stable city ID/label/country/coordinates/IANA zone), `WeatherSnapshot` (spec provenance/status/nullable fields), `MealSnapshot` (core Meal fields with string ID), `StudyConfig` (study ID/start/version/seed/city options), `StudyRecord` (config plus derived cutoffs), and `ExportManifest` (version/phase/times/hashes/provenance). Also name the shared `EnrollmentSettings`, `ParticipantView`, `VisitRecord`, `CardAllocation`, `ExposureRecord`, `ActionResult` records and `FreezeLink` (freeze-manifest SHA-256, freeze time, development-snapshot SHA-256) in that file. Use two Mongoose models: immutable study configuration and one participant aggregate per study/user, embedding that participant’s study-window allocations, visits, exposures and immutable responses. A versioned compare-and-swap update handles one participant’s transitions atomically without adding replica-set transaction infrastructure. Export flattens these records into the shared envelope. Database lifecycle functions take a trusted session-derived `userId` and explicit `now`; routes never accept identity from the body. JSON validation/types are local code, not a new schema framework. Export is a database-package CLI, keeping Python free of DB credentials.

All new/existing touched files and their test files are named in the tasks below; do not create additional service layers by default. The offline path (Tasks 1–7) is independently runnable; the collector/export path (Tasks 8–14) implements the same feature’s recorded-data contract.

## Task 1: Validate the common export and label contract

**Files:** Create `contracts/meal-prediction/v1.md`, `contracts/meal-prediction/pilot-v1.example.json`, `packages/database/src/pilot/types.ts`, `benchmarks/meal_prediction/{pyproject.toml,uv.lock}`, `benchmarks/meal_prediction/meal_prediction/{__init__.py,records.py}`, `benchmarks/meal_prediction/tests/test_records.py`; modify `.gitignore`.

**Interfaces:** Produce `load_snapshot(path: Path) -> Dataset`, `events_for(dataset, ids) -> tuple[Exposure, ...]`, and `labels_for(dataset, ids) -> ndarray`. Define all named records in the map above, including `Exposure.event_id/participant_id/item_id/displayed_at/meal/context` and `Target.event_id/y/received_at`. TS types mirror the JSON envelope, without database credentials or legacy feedback outcomes.

- [ ] **1. Write failing behavior checks:** `test_uncertainty_is_not_a_negative`, `test_snapshot_rejects_conflicting_answers`, and `test_wrong_version_or_references_fail`. With the shared fixture assert `set(d.targets) == {'e-yes','e-no'}`, `labels_for(d, ('e-no','e-yes')).tolist() == [0,1]`, and missing/Not sure remain in exposure/audit coverage. Duplicate response IDs, unsupported version, or unknown visit IDs raise `ValueError` identifying the field.
- [ ] **2. Bootstrap only what those checks need:** add the Python project/dependencies plus pytest dev dependency; use `uv lock`, then `uv sync --frozen`. Resolve/import all three ML libraries here; preserve an actual dependency failure as a blocker.
- [ ] **3. Run** `uv run --frozen python -m pytest tests/test_records.py -q`; expected RED for the absent loader, not an installation error.
- [ ] **4. Implement the records/validator** and document the exact JSON field names/nullability. Reject nonfinite numerics and booleans used as binary numeric targets; keep raw optional contexts and audit reasons. Ignore `.venv/`, caches, downloaded data, raw exports and run/model outputs; retain locks and fixtures.
- [ ] **5. Run the same test command:** expected GREEN. Verify `python -c` imports for sklearn/CatBoost/River using the locked uv environment and record resolved versions.
- [ ] **6. Commit** the listed files: `feat: define meal benchmark data contract`.

## Task 2: Import real UCI data and define reproducible partitions

**Files:** Create `meal_prediction/{datasets.py,splits.py}` and `tests/{test_datasets.py,test_splits.py}` under the Python project.

**Interfaces:** Consume Task 1 records. Produce `load_uci(zip_path: Path) -> Dataset`, `fetch_uci(destination: Path) -> Path`, `split_uci(dataset, seed=42) -> Split`, and `split_pilot(dataset) -> Split`. Preserve dataset observations independently of fit/score target arrays.

- [ ] **1. Write tests:** `test_uci_left_join_preserves_unique_pairs`, `test_uci_companion_outcomes_are_not_features`, `test_pilot_cutoffs_require_both_timestamps`. The real-file audit asserts `len(d.events)==1161`, `sum(t.y for t in d.targets.values())==516`, unique event IDs and 288 missing-cuisine observations. A small unit fixture exercises multivalued joins and `?`. At exactly `T0+5d`, display/receipt are development; a display before that instant with receipt after it is audited and absent from every primary split. At exactly `T0+14d`, omit the assessment.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_datasets.py tests/test_splits.py -q`; expected RED for missing adapters. Fetch the actual official ZIP for the real-data assertions, not a substituted sample.
- [ ] **3. Implement** official-source download/hash verification, CP1252 handling, aggregate-before-left-join logic and `food_rating==2`. Preserve 0/1 as valid negatives; exclude overall/service outcomes. UCI split uses seed-42 stratified 15% test, then `0.15/0.85` development from the remainder; save actual IDs. Pilot partitions use the manifest’s shared half-open cutoffs and strict receipt rules.
- [ ] **4. Run the tests:** expected GREEN. Repeat splitting twice and assert identical IDs, disjoint partitions and full accounting of valid/audited records. No weather/time is invented for UCI.
- [ ] **5. Commit:** `feat: import UCI ratings and freeze benchmark splits`.

## Task 3: Build shared features and strictly prior profiles

**Files:** Create `meal_prediction/features.py`, `tests/test_features.py`.

**Interfaces:** Consume `Dataset`, `Exposure`, `Target` and `Split`. Produce `fit_features(fit_events, fit_targets, *, preset, source) -> tuple[FeatureState, FeatureBatch]` and `transform_features(state: FeatureState, events: tuple[Exposure,...]) -> FeatureBatch`. `FeatureState` saves training-only vocabularies/scalers/medians, known active keys, and frozen response profiles; scoring accepts no targets.

- [ ] **1. Write tests:** `test_training_profile_excludes_own_and_future_label`, `test_public_profile_is_leave_one_out`, `test_heldout_targets_cannot_change_features`, and `test_unknown_and_never_active_features_are_neutral`. For a person’s first exposure assert smoothed rate `0.5`, count `0`; after one earlier Yes assert `2/3`, count `1`. A response received at the prediction instant is excluded. Changing a later target leaves earlier features identical. An entirely missing numeric field stays missing/neutral rather than becoming a new FM feature at scoring.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_features.py -q`; expected RED.
- [ ] **3. Implement** F0–F3 exactly from the spec. Flatten set-valued content deterministically, treat hunger/WMO as categorical, use local cyclic hour/day-of-week only where known, and supply explicit person × cuisine/ingredient/flavor/spiciness/heaviness and context × content interactions to every family. Training histories are chronological for pilot and leave-one-out for UCI; score profiles are frozen. Medians/scaling/vocabulary/active keys are fit-only; unknown categories have neutral contributions.
- [ ] **4. Run the tests:** expected GREEN. Assert F0 contains no IDs/history and public presets contain no clock/hunger/weather; serializing/scoring/reloading `FeatureState` leaves its hash unchanged.
- [ ] **5. Commit:** `feat: add common contextual features without future labels`.

## Task 4: Fit personalized logistic and rate controls

**Files:** Create `meal_prediction/models/{__init__.py,base.py,logistic.py}`, `meal_prediction/controls.py`, `tests/test_logistic.py`, `tests/test_controls.py`.

**Interfaces:** Define `FittedModel.predict_proba(batch: FeatureBatch) -> ndarray`, `save(path: Path) -> None`, and `load_fitted(path: Path) -> FittedModel`. Use stdlib pickle for owned fitted wrappers; Task 7 verifies manifest/hash/version before loading. Produce `fit_logistic(batch, y, params, seed) -> FittedModel` and `fit_rate_control(kind, fit_events, fit_targets) -> FittedModel` for `global|personal`. Every probability vector has one `P(y=1)` per input ID.

- [ ] **1. Write tests:** `test_content_interactions_personalize_ranking`, `test_personal_rate_shrinks_to_global`, `test_no_two_class_fit_is_reported`. Use a fixture where two people have opposite cuisine responses and assert the fitted rankings differ; a user intercept alone cannot pass. Assert a new person gets `(yes+1)/(n+2)` and known person gets `(user_yes+5*global_rate)/(user_n+5)`. A single-class fit yields `NotEstimable`, not a pretend trained constant model.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_logistic.py tests/test_controls.py -q`; expected RED.
- [ ] **3. Implement** sparse deterministic encoding and L2 logistic (`lbfgs`, max 2,000 iterations, tolerance `1e-6`), plus the two fixed controls. Nine `C` values are `numpy.logspace(-2,2,9)`. Catch/assert solver warnings as failed fits. Define `NotEstimable` and structured fitting failure types in `models/base.py`.
- [ ] **4. Run tests:** expected GREEN, including aligned finite probabilities in `[0,1]` and save/load prediction equality using actual libraries. No class weighting or synthetic rows.
- [ ] **5. Commit:** `feat: add personalized logistic benchmark and rate controls`.

## Task 5: Fit the CatBoost candidate

**Files:** Create `meal_prediction/models/catboost.py`, `tests/test_catboost.py`.

**Interfaces:** Consume `FeatureBatch/FittedModel`; produce `fit_catboost(batch, y, params, seed) -> FittedModel` with the identical ordered probability contract.

- [ ] **1. Write** `test_catboost_real_fit_handles_missing_and_unseen_categories`: fit two-class data, score a known and unseen person/meal with nullable-derived context; assert finite aligned probabilities and unchanged fitted-state hash. Assert raw WMO/hunger enter categorical columns and the input batch is unmodified.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_catboost.py -q`; expected RED.
- [ ] **3. Implement** actual CPU `CatBoostClassifier(loss_function='Logloss')`, one thread, learning rate `0.05`, 300 iterations; depth `{2,4,6}` × L2 leaf regularization `{1,3,10}`. Use native categorical columns plus shared numeric/derived fields; disable unsolicited model-file outputs. Keep test outcomes outside the adapter.
- [ ] **4. Run tests:** expected GREEN, including actual CatBoost save/load parity through `load_fitted` and two-class failure behavior matching Task 4.
- [ ] **5. Commit:** `feat: add CatBoost meal prediction candidate`.

## Task 6: Fit the FM and make frozen prediction state-invariant

**Files:** Create `meal_prediction/models/fm.py`, `tests/test_fm.py`.

**Interfaces:** Consume Task 3 active-key state and Task 4 `FittedModel`; produce `fit_fm(batch, y, params, seed) -> FittedModel`. The test-local `fitted_state_bytes(model)` returns the saved owned-artifact bytes using Task 4’s serializer.

- [ ] **1. Write** `test_fm_unknown_predictions_do_not_initialize_latents` and `test_fm_prediction_order_and_reload_are_stable`. Let `before=fitted_state_bytes(model)`; score unseen IDs, an unseen category, and a formerly all-zero field; assert `fitted_state_bytes(model)==before`. Score the same rows reversed and restore order: assert equal predictions. Save/reload must preserve the same outputs and RNG/latent state.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_fm.py -q`; expected RED. Demonstrate the lazy-initialization failure with the actual locked River implementation before fixing the adapter.
- [ ] **3. Implement** actual `facto.FMClassifier` with explicit logistic loss and nonzero L2 for both weights/latents. Grid rank `{4,8,16}` × L2 `{1e-5,1e-3,0.1}`, both learning rates `0.01`, 25 deterministic seeded passes through precomputed fitting rows. Canonically order features; neutralize unseen/inactive keys before River prediction. Freeze the active vocabulary and all RNG/latent/weight state after fitting; do not learn or allocate on score calls.
- [ ] **4. Run tests:** expected GREEN with finite probabilities, repeatability and no mutation. If library behavior requires a different minimal freeze mechanism, preserve the tests/three-family requirement and record evidence rather than weakening the guard.
- [ ] **5. Commit:** `feat: add frozen contextual factorization machine`.

## Task 7: Evaluate, select, freeze and run the public comparison

**Files:** Create `meal_prediction/{metrics.py,experiment.py,report.py,__main__.py}`, `tests/{test_metrics.py,test_experiment.py,test_public_e2e.py}`, `benchmarks/meal_prediction/README.md`; modify `meal_prediction/models/{__init__.py,base.py}`; create compact `docs/research/recommendation-engine/results/uci-three-models.md` after the measured run.

**Interfaces:** Produce `evaluate(batch_ids, participant_ids, y, probabilities) -> MetricSummary`, `paired_intervals(predictions, *, source, study_start, seed=42) -> IntervalSummary`, `fit_experiment(development_data: Dataset, split: Split, out_dir: Path) -> FreezeManifest`, and `score_experiment(freeze_dir, events, targets, out_dir) -> Report`. Before calling fit, strip all test targets/events from `development_data`; the pilot also requires export phase `development`. A freeze records exact IDs/config/seed/feature/control/model hashes and selection time. The scorer passes outcome-free events to models; only metrics receive targets.

- [ ] **1. Write tests:** `test_user_balancing_and_bootstrap_multiplicity`, `test_test_inputs_cannot_change_freeze`, `test_empty_or_sparse_evidence_is_explicit`, `test_public_all_families_share_test_ids`. For people with 1 and 9 observations assert macro loss equals the mean of the two person losses, not pooled loss. Bootstrap a draw containing the same person twice and preserve both draws. Assert fitting receives no test IDs/outcomes; changing held-out inputs cannot change selected settings/fitting rows/profiles. Score the same saved freeze with changed test targets and assert unchanged model/settings/vocabulary hashes, allowing only reported metrics to differ. Empty/one-class fitting is not estimable; fewer than five pilot dates or one test class cannot flag useful gain.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_metrics.py tests/test_experiment.py tests/test_public_e2e.py -q`; expected RED.
- [ ] **3. Implement** all nine settings/family/preset, development selection and fixed tie order, refit/freeze, seed-42 primary and seed-43/44 sensitivity, exact grid/failure accounting, rate-control selection and future heuristic registration. Use the spec’s clipping, bins, Brier/log-loss weighting, 2,000 paired person/time-block replicates and provisional 5% pilot rule. Report empty resamples, coverage, secondary pairs/feature increments, timings and platform-normalized peak memory. Public reports have no appetite/weather useful-gain claim.
- [ ] **4. Add concrete CLI commands:** `python -m meal_prediction public --output runs/uci`; `python -m meal_prediction validate --input SNAPSHOT`; `python -m meal_prediction fit --input SNAPSHOT --output FREEZE`; `python -m meal_prediction score --freeze FREEZE --input SNAPSHOT --output REPORT`. The public runner/validation work at this stage; Task 13 completes the guarded pilot fit/score workflow. Provide an explicitly labeled `public --smoke` path for CI that fits one preset/config per family on the real dataset; it cannot be reported as the full benchmark. Reject an output directory containing incompatible hashes rather than overwriting evidence. A full public run exits nonzero if any candidate is unavailable.
- [ ] **5. Run the Task 7 tests:** expected GREEN, including a real-UCI smoke with aligned three-family predictions and explicit insufficient-evidence cases.
- [ ] **6. Run the full** `uv run --frozen python -m meal_prediction public --output runs/uci`; expected all three families scored on the same saved IDs, F0/F1 tables, reference/seed results and actual measured reports. Inspect failures/warnings and record runtime; do not assert a preferred winner.
- [ ] **7. Write** the compact source-linked result with actual values, revision, versions and limitations. Keep raw/model outputs ignored.
- [ ] **8. Commit:** `feat: benchmark all three models on UCI food ratings`.

## Task 8: Reuse eligibility and pin the heuristic reference

**Files:** Modify `packages/core/src/{recommender.ts,index.ts,recommender.test.ts}`, `meal_prediction/{controls.py,experiment.py}`, `meal_prediction/models/__init__.py`, `tests/test_experiment.py`; create `contracts/meal-prediction/heuristic-v1.example.json`, `meal_prediction/heuristic.py`, `tests/test_heuristic.py`.

**Interfaces:** Export `isMealEligible(meal: Pick<Meal, 'primaryIngredients'|'allergens'>, avoided: readonly string[]): boolean` and `scoreMealDeterministically(meal: Meal, quiz: QuizAnswers, recentFeedback: readonly FeedbackEntry[], weather: WeatherCondition, asOf: Date): ScoredMeal`. Python produces `heuristic_score(event: Exposure, prior_events, prior_targets) -> float` and a fitted calibrated heuristic implementing `FittedModel`; its `predict_proba` uses the aligned outcome-free `FeatureBatch.events` with its saved fitting history. The shared example contains inputs/expected deterministic scores only.

- [ ] **1. Write TS parity/eligibility tests** before extraction, pinning existing seeded selections at fixed `Date.now`, alias/allergen exclusions, exact feedback `±0.4`, similarity cap `0.2`, spice penalty `-0.05`, weather bonus `0.2`, and the original RNG draw order. Write Python `test_heuristic_matches_core_vectors_and_history_cutoff` using the same examples and assert its future/self targets cannot affect a score.
- [ ] **2. Prepare the JS checks:** verify Node 22/fnm and corepack first, then `pnpm install --frozen-lockfile` and required workspace builds. Follow the repository’s corepack-help rule if it is actually unavailable.
- [ ] **3. Run** `pnpm --filter @meal-rec/core exec vitest run src/recommender.test.ts` and Python `uv run --frozen python -m pytest tests/test_heuristic.py -q`; expected RED for the missing new interfaces/reference, not absent dependencies, with existing behavior tests still meaningful.
- [ ] **4. Extract minimal shared core helpers** while preserving comments/legacy behavior and seeded selection. Implement the small Python reference formula for file-only benchmarking, pinned by the actual-core shared vectors; this avoids requiring a JS runtime/DB connection in the Python runner. Benchmark history is latest definite response per meal strictly before the prediction point, using its meal snapshot and explicit as-of clock; default quiz spiciness is `2`, surprise is excluded, native missing-weather fallback is recorded as baseline behavior. Fit fixed L2 `C=1` score calibration on fitting rows only; UCI marks this control unavailable.
- [ ] **5. Run both checks and existing core suite:** expected GREEN. Verify every shared score vector against the actual TS helper and Python formula; do not silently let one drift from the pinned control. Extend pipeline tests so a pilot source requires the third control rather than skipping it.
- [ ] **6. Commit:** `feat: expose eligible meals and pin the heuristic benchmark control`.

## Task 9: Capture city and weather context honestly

**Files:** Create `meal-rec/src/lib/pilot/{weather.ts,weather.test.ts}`.

**Interfaces:** Consume TS `CitySelection/WeatherSnapshot` from Task 1. Produce `searchCities(query: string, configured: readonly CitySelection[]): Promise<CitySelection[]>` and `captureWeather(city: CitySelection, startedAt: Date): Promise<WeatherSnapshot>`. Study configuration includes a small explicit city-option list with names/coordinates/IANA zones, usable without a live lookup. Authorized hosted geocoding can extend those options. Provider mode is server config `disabled|noncommercial|customer` with any customer key; default disabled. Network access is never inferred from pilot size.

- [ ] **1. Write unit tests** `zero_is_valid`, `timeout_is_unknown`, `partial_and_stale_provenance_is_preserved`, `ambiguous_city_is_not_auto_selected`, and `access_disabled_uses_configured_cities_without_network`. Assert `0 mm`/WMO `0` survive, absent valid time or age over 3,600 seconds/future offset over 300 seconds is unavailable, timeouts end at 3,000 ms, and fetch failures never yield normal weather. With access disabled, configured cities remain selectable and neither provider endpoint is called. Unit fetch/fake timers are allowed here; they are not E2E mocks.
- [ ] **2. Run** `pnpm --filter meal-rec exec vitest run src/lib/pilot/weather.test.ts`; expected RED.
- [ ] **3. Implement** official current-only Celsius/mm/Unix requests, GeoNames-backed city options/IANA-zone validation, finite/null field checks and original request/retrieval/valid/interval/grid coordinates. Preserve partial raw records and unfamiliar codes. Add no-store and redact credentials/provider errors. Do not reuse or change the legacy normal-on-failure helper; no paid account is created.
- [ ] **4. Run the tests:** expected GREEN; include a city-zone/returned-grid-zone mismatch fixture that preserves the selected zone and flags the discrepancy. A live authorized request is a later explicitly reported check, not a fabricated fixture result.
- [ ] **5. Commit:** `feat: capture nullable pilot weather snapshots`.

## Task 10: Persist the pilot lifecycle with atomic daily allocations

**Files:** Create `packages/database/src/models/pilot-{study,participant}.ts`, `packages/database/src/pilot/{service.ts,service.integration.test.ts}`; modify `packages/database/src/index.ts`.

**Interfaces:** Consume Task 1 TS types. Database service owns `enrollParticipant(userId, studyId, settings, now): Promise<ParticipantView>`, `updateParticipant(userId, studyId, settings, now): Promise<ParticipantView>`, `createVisit(userId, studyId, operationId, context, now): Promise<VisitRecord>`, `nextCard(userId, studyId, visitId, operationId, pool: EligiblePool, now): Promise<CardAllocation|null>`, `acknowledgeDisplay(userId, studyId, allocationId, visitId, settingsVersion, clientTime, now): Promise<ExposureRecord>`, and `submitAction(userId, studyId, exposureId, action, clientTime, now): Promise<ActionResult>`. All IDs/client timestamps are strings, `now` is a `Date`, settings are `EnrollmentSettings`, context is the immutable city/hunger/weather snapshot, and settingsVersion is numeric. `EligiblePool` contains the settings version and the app’s full eligible meal snapshots. A stale version produces conflict/reload. Actions are `yes|no|not_sure|skip`; only the first three create a response. Throw `PilotError(code)` for `invalid|not_enrolled|not_found|closed|expired|conflict`.

- [ ] **1. Write real-Mongo integration checks:** repeated opt-in yields one participant/pseudonym; two concurrent daily initializations yield one day/five distinct allocations; all selected meals respect exclusions before draw; changing exclusions replaces only unshown incompatible slots; city changes retain enrollment quota timezone. A repeated same answer after expiry returns its original success, conflicting answer returns conflict, different actor cannot access the exposure, skip/leave remain unlabelled, and visit expiry after thirty minutes requires fresh context. Include zero/smaller-than-five pools, invalid city zones, local midnight/DST/travel, duplicate operation IDs, concurrent successful answers and an exclusion-change/ack race.
- [ ] **2. Run** `pnpm --filter @meal-rec/database exec vitest run src/pilot/service.integration.test.ts`; expected RED. Use the existing real `MongoMemoryServer` test infrastructure, inspect connection output, and never target participant data.
- [ ] **3. Implement** immutable study and unique `(study,user)` participant models. Embed days keyed by enrollment-zone date, five slots/day, visits with unique operation IDs, one exposure per slot and at most one response per exposure. The transition computes a complete next aggregate from the current version and writes it with an atomic version predicate/increment; on CAS conflict reload and replay the idempotent operation. Seeded Fisher–Yates uses the full eligible pool, not a sampled shortlist. Immutable snapshots/answers stay immutable; skip/close are monotonic lifecycle markers. An answered/expired/skipped slot cannot become active again. Visits preserve one captured context; issuance does not create a display. Persist eligible-pool size and conditional draw probability.
- [ ] **4. Run checks:** expected GREEN; now-ineligible unshown cards are rejected/replaced before acknowledgement and concurrent successful answers are retained. Avoid a runtime database↔core package cycle: the app computes `EligiblePool` using Task 8’s helper; the database requires a matching settings version. Refuse new empty visits after daily slots are exhausted.
- [ ] **5. Commit:** `feat: persist opt-in pilot exposures and immutable responses`.

## Task 11: Add authenticated pilot routes and assessment UI

**Files:** Create `meal-rec/src/app/pilot/page.tsx`, `meal-rec/src/components/{PilotStudy.tsx,PilotStudy.test.tsx}`, `meal-rec/src/lib/pilot/{api.ts,api.test.ts}`, route files `meal-rec/src/app/api/pilot/{route.ts,enrollment/route.ts,cities/route.ts,visits/route.ts,cards/route.ts,exposures/route.ts,responses/route.ts}`; modify `meal-rec/src/components/Navigation.tsx` and its existing test.

**Interfaces:** Routes consume session identity, DB service, full eligible catalog and weather adapter. JSON API: GET `/api/pilot` returns study/enrollment/current-card/progress; POST/PATCH `enrollment` uses exclusion/city settings and opt-in; GET `cities?q=` returns explicit options; POST `visits` takes operation ID/hunger; POST `cards` takes visit/operation IDs; POST `exposures` acknowledges allocation/display time; POST `responses` submits exposure/action/client time. Responses expose only owned records. All are no-store; map invalid→400, unauthenticated→401, not-enrolled→403, absent→404, expired/closed/conflict→409.

- [ ] **1. Write behavior tests:** a failed save keeps the same card/retry ID, a double click makes one pending action, missing image uses one placeholder, sign-in/opt-in precede assessment, Not sure differs from skip, and changing city/exclusions affects the next valid visit/card. Route units assert actor identity comes from session, not JSON, and expired/racing requests map to explicit errors. Test the exact agreed prompt and accessible Yes/No/Not sure/Skip buttons.
- [ ] **2. Run** `pnpm --filter meal-rec exec vitest run src/components/PilotStudy.test.tsx src/lib/pilot/api.test.ts src/components/Navigation.test.tsx`; expected RED. Unit mocks do not substitute for Task 14’s real-system check.
- [ ] **3. Implement** the separate flow with purpose/duration/context opt-in copy, explicit city match selection, optional three-way hunger per visit, five-card progress, random uniform cards, model-blind name/image/ingredients presentation, and save-before-advance behavior. Reuse normal auth; do not add login bypasses. Include linked Open-Meteo/GeoNames source attribution in context information. Resolve `/pilot` disabled/not-started/ended/empty-pool states plainly; keep the existing home feedback flow unchanged.
- [ ] **4. Run component/API tests plus web typecheck/build:** expected GREEN. Known ready-visit retries reuse their stored weather context rather than refetching it. Service-worker behavior is implemented and verified against a real browser in Task 14, not assumed from response headers.
- [ ] **5. Commit:** `feat: collect immediate meal appeal in an opt-in pilot`.

## Task 12: Export exact study snapshots and configure studies by CLI

**Files:** Create `packages/database/src/pilot/{export.ts,cli.ts,export.integration.test.ts}`; modify database `package.json` scripts; create `contracts/meal-prediction/study.example.json`.

**Interfaces:** Produce `createStudy(config: StudyConfig): Promise<StudyRecord>` and `exportPilot(studyId: string, phase: 'development'|'final', destination: string, now: Date, freezeLink?: FreezeLink): Promise<ExportManifest>`. CLI scripts are `pilot:study` and `pilot:export`, running the built `dist/pilot/cli.js`; final export requires `--freeze-manifest FILE` to supply the link, while development export forbids final-outcome inclusion. The CLI reads an explicit `MONGO_URL` and exports schema-1 JSON plus SHA-256 sidecar; no public export route.

- [ ] **1. Write** `test_export_is_exact_and_pseudonymous`, `test_development_export_never_contains_week_two`, `test_manifest_is_immutable`. Populate actual MongoDB records; assert exposure/response/context equality, unanswered/uncertain retention, zero usernames/PIN/session/connection values, exact UTC timestamps, and stable pseudonyms. Requests to rewrite study cutoffs or export final outcomes as development fail explicitly.
- [ ] **2. Run** `pnpm --filter @meal-rec/database exec vitest run src/pilot/export.integration.test.ts`; expected RED.
- [ ] **3. Implement** explicit-date study validation, configured city options, protocol/catalog/seed manifest and immutable creation. Flatten the participant aggregates into visits/allocations/exposures/responses, preserving original IDs and settings snapshots. Development export includes only week-one records; final export includes the study and links the freeze hash/time for audit. Atomically finish export and sidecar, reject accidental overwrite, preserve snapshots and original failures rather than refetching weather. The example is labeled an editable configuration, not a live launch. Do not edit `connect.ts` for unrelated existing logging.
- [ ] **4. Build and run tests:** `pnpm --filter @meal-rec/database build`; same integration command expected GREEN. Run `uv run --frozen python -m meal_prediction validate --input SNAPSHOT` on a test-only real MongoDB export; assert validation accepts it and reports label/coverage counts, never presenting test fixtures as appetite results. Full pilot fit/score integration belongs to Task 13.
- [ ] **5. Commit:** `feat: export versioned pilot data for frozen evaluation`.

## Task 13: Prove pilot replay boundaries and reference calibration

**Files:** Create `tests/test_pilot_replay.py`; extend `meal_prediction/{experiment.py,splits.py,heuristic.py,report.py}`, `benchmarks/meal_prediction/README.md`.

**Interfaces:** Consume actual schema-1 snapshots and the Task 7 fit/freeze/score CLI. Produce a pilot report with all F0–F3 families, selected F3 candidate/reference, audit counts, freeze timing classification and explicit pending/insufficient status. No additional inference service.

- [ ] **1. Write** `test_frozen_replay_never_learns_week_two`, `test_late_freeze_is_retrospective`, and `test_cross_cutoff_response_is_quarantined`. On unit replay fixtures assert equal freeze hashes/predictions after altering week-two outcomes; only evaluation metrics may differ. Put a response across `T0+7d` and assert it contributes neither to refit nor test. Assert the calibrated heuristic uses chronological fitting scores, day-five frozen development history, and day-seven frozen test history.
- [ ] **2. Run** `uv run --frozen python -m pytest tests/test_pilot_replay.py -q`; expected RED for unwired pilot orchestration.
- [ ] **3. Implement** the pilot-specific orchestration around shared features/models/evaluator, strict final-input/freeze schema checks, study-manifest/hash compatibility, all four presets and baseline availability. Selection must occur before opening final outcomes; declare late/unsealed runs retrospective. No test-only labels enter a model argument, calibrated control, active vocabulary or affinity profile.
- [ ] **4. Run pilot replay and all Python tests:** expected GREEN. Clearly label the replay as verification with constructed test data. It is not a real pilot benchmark; preserve the genuine study comparison as pending.
- [ ] **5. Commit:** `feat: enforce frozen pilot replay and contextual comparisons`.

## Task 14: Verify the real collector/export path and deliver the branch

**Files:** Create `meal-rec/tests/pilot.spec.ts`, `meal-rec/scripts/e2e-pilot-study.js`, `docs/research/recommendation-engine/pilot-runbook.md`; modify `meal-rec/playwright.config.ts`, `meal-rec/scripts/e2e-seed.js`, `meal-rec/src/sw.ts`, `.github/workflows/ci.yml`, `README.md`, `benchmarks/meal_prediction/README.md`.

**Interfaces:** Consume the normal UI auth, configured study, real DB export CLI and real Python validator. Produce a repeatable browser→database→export proof, optional authorized-provider check, CI integration, measured public report and a reviewable PR. A real pilot result remains conditional on its actual window/responses.

- [ ] **1. Write failing E2E assertions:** normal signup/signin and opt-in; five distinct compatible displayed cards or recorded smaller pool; Yes/No/Not sure/Skip retain distinct meanings; retry and refresh preserve IDs; database/exact export values match the shown card/context and signed-in user. Unauthenticated/non-opted writes fail. Assert pilot responses are never returned from a service-worker cache after going offline. Use a real second browser context for ownership checks, not session injection or intercepted APIs.
- [ ] **2. Prepare isolated E2E prerequisites/setup:** use installed locked JS dependencies/builds, Playwright browsers and dedicated `meal-rec-e2e-test` MongoDB shared explicitly by server, assertions and CLI. Create the real test study/configured city options and test catalog there; enforce the dedicated DB name and set `PILOT_STUDY_ID` consistently. Refuse an unrelated listening server and disable server reuse for these checks. The current seed is destructive and must never touch participant data.
- [ ] **3. Run** `pnpm --filter meal-rec exec playwright test tests/pilot.spec.ts --project=chromium`. Reproduce actual integration/cache failures with the correctly configured real systems; failure caused solely by absent infrastructure is a blocker, not a TDD demonstration. Preserve already passing behaviors; do not break them to manufacture RED.
- [ ] **4. Implement the evidenced integration/cache fixes:** prepend network-only rules for `/api/pilot` and `/pilot`, exclude pilot precaching, and preserve/narrow the existing cache comment where needed. Update seed cleanup for pilot collections. Run the real disabled-weather path by default; execute the actual provider branch only with configured authorized access and report it unrun otherwise. CI adds locked Python 3.12/uv tests and real UCI smoke, retaining Node 22/MongoDB 8 and existing checks; do not run full research sweeps on every PR.
- [ ] **5. Run GREEN gates once after relevant fixes:** Python full suite; package/database/core/web tests, root lint/typecheck/build, Chromium and WebKit pilot E2E plus affected existing flows; public CLI full-budget run if new model/feature changes invalidated Task 7’s measured result. Expected: each required gate exits zero with inspected output and exact test counts; a missing gate remains explicitly unverified. Capture commands, warnings, unrun provider checks and genuine infrastructure blockers. No mocked E2E and no preferred-model assertion.
- [ ] **6. Write the runbook:** study configuration/opt-in, authorized weather mode/attribution, week-one export, settings selection, fit/freeze before outcome inspection, final export/score, late-freeze labels, input/output locations and missing-data/solo limits. Link the real public results. Retain raw pilot/model artifacts outside Git and record the pending pilot launch/enrollment/window as unfinished empirical work.
- [ ] **7. Commit:** `test: verify pilot collection through benchmark export`. Run the selected execution workflow’s whole-branch review, fix evidenced findings and re-run affected gates. Commit fixes coherently; stage exact paths. Push the feature branch and open a draft PR under the repository delivery protocol after local verification, using the PR skill/template; no merge or deployment. If auth/permissions block delivery, preserve commits/artifacts and report branch, checks and the concrete failing action.

## Self-review and execution handoff

Coverage: contract/labels (1), UCI/partitions (2), common information/history (3), all three families/controls (4–6,8), fair evaluation/artifacts/public evidence (7), weather (9), safe pilot records/sampling (10), presentation/auth (11), actual export/study config (12), frozen pilot fitting/reporting (13), real-system/cache checks and delivery (14). The five Review Focus cases have named assertions in their owning tasks.

Review this plan before implementation. Recommended execution is **Native**: the collector/export/feature interfaces are coupled, and one implementer can keep them consistent with a fresh whole-branch review at the end. **Subagent-driven** execution adds fresh implementer/reviewer gates for each task at greater context cost. Preserve all unfinished empirical pilot work whichever method Ori selects.
