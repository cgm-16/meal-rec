<!-- ABOUTME: Documents the isolated public benchmark and versioned pilot validation commands. -->
<!-- ABOUTME: Distinguishes measured static-rating evidence from pending guarded pilot evaluation. -->

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

The programmatic `development_only(dataset, split)` strips **both** held-out events and targets before `fit_experiment(development_data, split, out_dir)`. The fitter rejects any extra held-out inputs. `score_experiment(freeze_dir, events, targets, out_dir)` verifies the manifest, runtime/implementation, split/settings and **all** artifact hashes before loading models; features/models receive outcome-free exposures, and labels reach only the evaluator. Scoring requires the identical saved test IDs. Use these functions only with trusted, locally produced freezes: pickle can execute arbitrary code, and editable hashes are integrity checks, not source authentication. Do not score downloaded/untrusted freezes.

Pilot snapshot commands are exposed now:

```sh
uv run --frozen python -m meal_prediction validate --input SNAPSHOT
uv run --frozen python -m meal_prediction fit --input SNAPSHOT --output FREEZE
uv run --frozen python -m meal_prediction score --freeze FREEZE --input SNAPSHOT --output REPORT
```

Validation checks the version-one contract, splits with receipt-safe shared study boundaries and reports exclusions. Yes/No are binary; Not sure and unanswered exposures remain excluded. The synthetic contract example is labeled automated fixture evidence. Pilot fit/score deliberately return an explicit pending error until Task8 supplies the required calibrated heuristic and Task13 completes guarded development/final export, freeze linkage and timing checks. No pilot comparison silently drops a required control. Genuine pilot results, collector/infrastructure setup, actual study dates and enrollment remain later work.
