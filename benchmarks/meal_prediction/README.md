<!-- ABOUTME: Documents the isolated public benchmark and versioned pilot validation commands. -->
<!-- ABOUTME: Documents guarded frozen pilot replay while keeping genuine study evidence pending. -->

# Meal prediction benchmark

Run from `benchmarks/meal_prediction` using Python 3.12 and CPU only:

```sh
uv sync --frozen
uv run --frozen python -m pytest
uv run --frozen python -m meal_prediction public --output runs/uci
```

The public command verifies the pinned official [UCI Restaurant & consumer data archive](https://archive.ics.uci.edu/dataset/232/restaurant+consumer+data) (CC BY 4.0; DOI 10.24432/C5DP41). All 1,161 food-rating observations survive metadata joins. Food rating 2 is positive; codes 0/1 are negatives. Companion rating/service outcomes are excluded. Raw inputs, models and run outputs remain ignored by Git. Attribution and archive hash are retained in each report.

The seed-42 stratified approximately 70/15/15 split is saved in `data/uci-split-seed-42.json` and copied to the run. An incompatible saved split or nonempty output directory is an error; use another output path to preserve prior evidence. F1 is the public main information set; F0 is prespecified secondary. All three actual adapters (personalized sklearn logistic, native categorical CPU CatBoost, contextual River FM) attempt nine settings for each preset using seed 42. Settings, the primary F1 family and the reference rate control are selected by development participant-balanced log loss and fixed tie order M1/M2/M3, global/personal, then ascending grid index. The selected settings refit on train plus development with seeds 42/43/44. Seed 42 is primary; seeds 43/44 never select a winner. A failed setting consumes its grid slot. An unavailable family makes the full command exit nonzero and leaves failure evidence.

For a faster real-data integration check:

```sh
uv run --frozen python -m meal_prediction public --smoke --output runs/uci-smoke
```

Smoke fits only F1, the first approved setting and seed 42 per family. Its `smoke_verification_only` artifacts must never be cited as the full benchmark.

`runs/uci/freeze/manifest.json` records exact IDs, all grid outcomes, selected settings/times, fitting-row/feature/model hashes, Git revision and dirty paths, Python/dependency versions, lock/implementation hashes, runtime and peak process memory normalized to bytes. Feature states include the fitted vocabulary, imputation/scaling and frozen training-only profiles. Final scorers cannot update them. `manifest.sha256` checks the manifest bytes. `runs/uci/report/` contains `report.md`, `report.json` and per-observation `predictions.jsonl` with raw probabilities. These include both rate controls, all presets/seeds/pairs, F0→F1 increments, calibrated fixed-bin summaries, per-person metrics, warm/unseen user/item support and seed sensitivity.

Primary loss averages each participant's mean log loss equally. The event mean and participant-balanced Brier/calibration are also reported. Only log-loss computation clips to `[0.000001, 0.999999]`. Fixed calibration bins are `[0,.2)`, `[.2,.4)`, `[.4,.6)`, `[.6,.8)`, `[.8,1]`. Paired exploratory 95% percentile intervals use 2,000 shared seed-42 participant draws and preserve repeated participants. Empty/unrepresented subgroups are unsupported. UCI has no event dates, appetite, hunger or weather, so it has no date-block interval or useful pilot-gain claim. Its calibrated current-heuristic control is unavailable because there is no faithful dish mapping. Better prediction of observed restaurant ratings does not establish an effect on feed acceptance or consumption.

The programmatic `development_only(dataset, split)` strips **both** held-out events and targets before `fit_experiment(development_data, split, out_dir)`. The fitter rejects any extra held-out inputs. `score_experiment(freeze_dir, events, targets, out_dir)` verifies the manifest, runtime/implementation, split/settings and **all** artifact hashes before loading models; features/models receive outcome-free exposures, and labels reach only the evaluator. Public scoring requires the identical saved test IDs. Pilot scoring derives its common valid final IDs under the frozen study cutoffs; future observations are never inserted into a saved freeze. Use these functions only with trusted, locally produced freezes: pickle can execute arbitrary code, and editable hashes are integrity checks, not source authentication. Do not score downloaded/untrusted freezes.

Pilot collection uses the immutable study configuration and the existing Node exporter. From the repository root, use the project's Node 22 environment, frozen dependencies and built workspace artifacts:

```sh
eval "$(fnm env --shell zsh)"
fnm use 22.23.3
pnpm install --frozen-lockfile
pnpm --filter @meal-rec/common build
pnpm --filter @meal-rec/database build
# Copy/edit contracts/meal-prediction/study.example.json with the actual launch inputs first.
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:study --config /absolute/path/study.json
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:export --study-id STUDY_ID --phase development --destination /absolute/path/development-bundle
```

The example study file deliberately requires actual study dates, catalog identity and city options. Study creation is immutable. Use the explicitly intended database; these commands do not select infrastructure, enroll people or authorize weather access.

A published export is a newly reserved directory containing `snapshot.json`, `collection.json` and `SHA256SUMS`. The exporter writes the checksum completion marker last and refuses existing destinations. Production fitting/scoring require that complete directory and verify **both** file hashes before use. A standalone JSON file, missing marker, changed snapshot, changed collection audit, unsafe file or incompatible study fails before model loading or output creation. Generic validation continues to accept an explicit snapshot file:

```sh
# From benchmarks/meal_prediction:
uv run --frozen python -m meal_prediction validate --input /absolute/path/development-bundle/snapshot.json
uv run --frozen python -m meal_prediction fit --input /absolute/path/development-bundle --output /absolute/path/freeze
# If any final outcomes were already inspected, declare that when fitting:
# uv run --frozen python -m meal_prediction fit --input /absolute/path/development-bundle --output /absolute/path/retrospective-freeze --test-outcomes-inspected
```

Validation checks the strict version-one schema and receipt-safe half-open study cutoffs: training `[T0,T0+5d)`, development `[T0+5d,T0+7d)`, test `[T0+7d,T0+14d)`. Both display and receipt must belong to the same interval. A response crossing day five or seven is quarantined from both adjacent partitions. Yes/No are 1/0; Not sure, unanswered and invalidly timed exposures remain excluded and counted. Accepted timestamps retain their original raw spelling; nonzero fractional digits beyond six are rejected, while extra trailing zeroes are accepted. No input evidence is rounded or rewritten.

Pilot fitting accepts development exports only. It attempts nine fixed settings for each actual M1/M2/M3 family in **all F0–F3 presets**, selects settings and the F3 primary candidate/reference using development participant-balanced log loss and the fixed tie order, then refits the selected settings with seeds 42/43/44. There is no pilot smoke mode. All retained fitting rows have unit weight. The global rate, personal rate with five global-prior observations, and pinned `core-deterministic-v1` calibrated heuristic are attempted and reported. Heuristic fitting scores use strictly earlier definite receipts, map Yes/No to like/dislike, omit uncertainty and retain default quiz behavior. Its two-parameter logistic calibration uses L2 `C=1`, `lbfgs`, 2,000 iterations and tolerance `0.000001`. Development histories freeze at day five; final feature profiles and all control histories freeze at day seven. A missing class or failed setting/control is explicit; available baselines remain reportable without substituting a trained candidate.

`freeze/manifest.json` preserves the **original** development `source_manifest`, exact raw `development_snapshot_sha256`, separate semantic `development_sha256`, complete bundle checksums/audit availability, fitting IDs/input hashes, cutoffs, selection, models and feature states. `manifest.sha256` checks its exact bytes. Selection and freeze timestamps plus the `--test-outcomes-inspected` declaration determine classification: both timestamps must be at or before day seven with no declared inspection for `prospective`; late or inspected runs are `retrospective`. Software cannot verify that no outside inspection occurred. Hashes and the license-based `automated_fixture` indicator do not establish genuine collection.

After freezing, the existing Node CLI verifies the actual manifest checksum and exact study/version/catalog/cutoff/seed identity before publishing the linked final bundle. From the repository root:

```sh
MONGO_URL=YOUR_EXPLICIT_STUDY_DATABASE pnpm --filter @meal-rec/database pilot:export --study-id STUDY_ID --phase final --destination /absolute/path/final-bundle --freeze-manifest /absolute/path/freeze/manifest.json
```

Then, from `benchmarks/meal_prediction`:

```sh
uv run --frozen python -m meal_prediction score --freeze /absolute/path/freeze --input /absolute/path/final-bundle --output /absolute/path/report
```

Final scoring checks the strict final schema, exact raw FreezeLink, original immutable study identity, unchanged week-one exposures/context and fitting targets, and all freeze/runtime/feature/model checksums **before unpickling**. Only then are exact common valid final test IDs derived. Every candidate/control scores those outcome-free exposures; only the evaluator sees test labels. The saved freeze is never updated with future IDs or outcomes. New participants/items/content use frozen unknown-feature behavior; repeated scoring cannot mutate models or vocabularies. Use only trusted, locally produced freezes: checksums detect corruption, not an authenticated source, and pickle can execute code.

`report.md`, `report.json` and `predictions.jsonl` retain all families/presets/seeds, raw aligned probabilities, selected F3 candidate/reference, all pairwise group/date differences, F0→F1→F2→F3 increments, seed sensitivity, per-person/fixed-bin metrics, missing-context coverage, audit counts, freeze classification, runtime/memory and hashes. The collection audit is separate from binary fitting. Development mutable lifecycle is explicitly unavailable because it has no timestamped history; final lifecycle summarizes saved slot states, shortages and visit closure as of export.

Pilot exploratory intervals use 2,000 shared seed-42 participant draws and common circular two-day blocks concatenated/truncated to seven study dates. Group intervals need two represented participants; solo results are within-person. Empty resamples and unusable intervals are reported. Fewer than five nonempty test dates, one observed test class, or an unavailable selected comparison produces insufficient evidence. A provisional useful gain requires at least 5% relative log-loss reduction and positive available paired bounds (both group and time in group mode). Reports preserve that numeric/support result alongside the separate freeze classification and fixture provenance. Hunger/weather increments are predictive associations, not causal effects; absent usable weather cannot establish that weather has no value.

Automated replay fixtures are **constructed verification**, not a real pilot benchmark. An exporter fixture may show `automated_fixture=false` because the Node exporter records the fixed private-study license; that does not authenticate it. Reports describe the supplied inputs and measured results without authenticating collection. Actual study dates, enrollment, database/deployment access and weather access mode remain launch inputs. For this implementation task, genuine study comparison remains pending; predictive fit is not proof that deployment increases feed acceptance, purchase or consumption.
