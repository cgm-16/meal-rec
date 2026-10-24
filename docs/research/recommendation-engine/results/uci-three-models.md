<!-- ABOUTME: Records the full measured three-family UCI rating comparison and provenance. -->
<!-- ABOUTME: Separates static predictive evidence from unresolved pilot and optimization claims. -->

# UCI three-model benchmark — measured full run

Full CPU run, 2026-10-19. **The personal-rate control had the lowest observed main-table loss.** Development selected logistic M1; its test loss exceeded the selected personal control by 0.011294 (2.07% relative), and their paired interval includes zero. M1 also had lower observed loss than CatBoost, with an interval spanning zero. This does not establish a reliably better candidate.

[Restaurant & consumer data](https://archive.ics.uci.edu/dataset/232/restaurant+consumer+data), [DOI 10.24432/C5DP41](https://doi.org/10.24432/C5DP41), CC BY 4.0; creators Rafael Ponce Medellín and Juan Gabriel González Serna; donors Blanca Vargas-Govea and Juan Gabriel González Serna. The verified official archive supplies 1,161 observed ratings, 138 people and 130 restaurants. Target: `food_rating == 2` (516 positives); codes 0/1 are negatives. Metadata sets were aggregated and missing values normalized; companion rating/service outcomes are excluded.

The saved seed-42 stratified split has **812 train / 174 development / 175 test** observations. Final fitting uses only the 986 train+development rows. The common test contains 95 people, 86 restaurants, 78 positives and 97 negatives. Every test user and item is known from final fitting; both unseen groups have zero observations and are **unsupported**. Cuisine is missing for 288 source observations and 36 test observations (20.57%); test payment coverage is 90.86%.

F1 is the prespecified public main feature set (static content plus known identities, interactions and fitting-only rating profiles); F0 omits identities/history. All 54 planned tuning settings (9 × 3 families × 2 presets) were attempted with seed 42; **0 failed settings, 0 failed refits, no warnings**. Each selected candidate refit uses seeds 42/43/44, with 42 fixed as primary. Controls use smoothed global and personal rates; the heuristic is unavailable because UCI has no faithful dish-level mapping.

## Main table: F1, seed 42

| Model | Participant log loss | Event log loss | Participant Brier |
| --- | ---: | ---: | ---: |
| M1 logistic | 0.557713 | 0.549494 | 0.188247 |
| M2 CatBoost | 0.576755 | 0.573559 | 0.196539 |
| M3 FM | 7.511275 | 7.657741 | 0.543684 |
| Global rate | 0.689224 | 0.687246 | 0.248040 |
| Personal rate (selected reference) | 0.546418 | 0.537847 | 0.182366 |

Primary loss averages within-person losses equally; fitting uses unit event weights. Only log-loss computation clips to `[0.000001,0.999999]`; Brier, fixed-bin participant-balanced calibration and saved predictions use raw probabilities.

## Preset selection and seed sensitivity

| Preset / family | Selected setting | Development loss | Test seed 42 | Test seed 43 | Test seed 44 | Tuning seconds (9 fits) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| F0/M1 | C=0.01 | 0.680893 | 0.688302 | 0.688302 | 0.688302 | 0.317 |
| F0/M2 | depth=2, l2_leaf_reg=1 | 0.678998 | 0.684281 | 0.681716 | 0.679207 | 3.735 |
| F0/M3 | l2=0.1, n_factors=16 | 0.723723 | 0.688410 | 0.705627 | 0.692287 | 32.405 |
| F1/M1 | C=0.31622777 | 0.604651 | 0.557713 | 0.557713 | 0.557713 | 0.824 |
| F1/M2 | depth=2, l2_leaf_reg=10 | 0.614970 | 0.576755 | 0.565716 | 0.569512 | 5.879 |
| F1/M3 | l2=1e-05, n_factors=4 | 1.166881 | 7.511275 | 6.510257 | 6.643564 | 59.535 |

Development reference losses: global 0.679860, personal 0.605127. Development selected M1/F1 (`C=0.31622776601683794`, loss 0.604651), then all selected settings refit on train+development. No test outcome selected settings, family, control or seed. Exact ties use M1/M2/M3, global/personal, then ascending grid index.

FM/F1 performed poorly and saturated: all 175 seed-42 probabilities lie outside the clipping bounds (169 above 0.999999; 6 below 0.000001). Its seed loss range is 1.001018. These are finite valid probabilities under the declared protocol, so the result remains reported. They merit a separate optimization diagnosis before drawing a general conclusion about factorization machines; no post-test retuning was performed.

## Paired exploratory intervals

2,000 seed-42 paired participant resamples preserve duplicate person draws; all 190 pairs among 20 outputs share draws and IDs. Every pair has 2,000 usable and 0 empty replicates. There is no time interval because UCI has no event dates. Differences below are first loss minus second loss; negative favors the first.

| Comparison (seed 42) | Difference | 95% percentile interval |
| --- | ---: | --- |
| F1/M1/42 − F1/M2/42 | -0.019042 | [-0.066717, 0.025960] |
| F1/M1/42 − F1/M3/42 | -6.953563 | [-8.266880, -5.757154] |
| F1/M2/42 − F1/M3/42 | -6.934520 | [-8.260895, -5.723140] |
| F1/M1/42 − personal | 0.011294 | [-0.027223, 0.049474] |
| F1/M2/42 − personal | 0.030337 | [-0.015610, 0.079510] |
| F1/M3/42 − personal | 6.964857 | [5.772783, 8.269806] |

| Feature increment: F0 minus F1 (seed 42) | Difference | 95% percentile interval |
| --- | ---: | --- |
| M1 | 0.130589 | [0.065920, 0.197076] |
| M2 | 0.107526 | [0.022879, 0.190555] |
| M3 | -6.822865 | [-8.134302, -5.604517] |

These descriptive intervals are exploratory, not a powered trial or a causal estimate. UCI has no immediate-appetite, hunger or weather measurements. **No useful appetite/weather gain is claimed.** Predicting observed ratings does not establish an effect on feed acceptance, purchases or consumption; genuine pilot evidence remains pending.

## Reproduction and artifacts

From `benchmarks/meal_prediction`:

```sh
uv sync --frozen
uv run --frozen python -m meal_prediction public --output runs/uci
```

Use a fresh output path if evidence already exists. This result is the **full benchmark**, not `--smoke` verification.

- Measured code: `8e3418c4898ac280034015f2a6007ad409be0608`; Git clean at launch and freeze. The later result-document commit does not change measured code.
- Python 3.12.12; uv 0.12.9; macOS 27.0.1 arm64, CPU. Locked NumPy 2.5.4, SciPy 1.18.1, scikit-learn 1.9.1, CatBoost 1.2.10, River 0.26.1.
- Total command wall time **144.54 s** (`/usr/bin/time -l`); fit pipeline 142.249447 s; score/evaluation 0.355786 s. Full-command peak RSS **287,064,064 bytes**; in-process report snapshot **285,802,496 bytes**. These are shared process peaks, not isolated family memory.
- Selection 2026-10-19T03:40:34.915179+00:00; freeze 2026-10-19T03:41:14.281667+00:00.
- Official ZIP SHA-256: `dc61ec3779db8d3bd2cde8d65abf87dc07e9b22ae94f9b9ad6375d57f627e333`.
- Exact split SHA-256: `b5bbbea8f6fc51d97b47985e24448906c36cde58923e6689e4e836f3944e9b78`.
- Freeze manifest SHA-256: `ce6eaccc0177c6bc73577087f119a3bd6d246e46ad6d3835da4d0a4a69c5639d`.
- Lock SHA-256: `f5f6f012ad4cc0fd5a8716979d9d20f48452bb8c2317065e63bdde1d9903bc1a`; implementation SHA-256: `c4beafa668736490514e3524ab6979646fc013e67999cd94f6f594f25dfbc7ff`.
- Ignored measured outputs: `benchmarks/meal_prediction/runs/uci/{split.json,freeze/,report/}`; full log `runs/task7-full-public.log`; independent metric/alignment/hash audit `runs/task7-full-public-audit.{json,log}`. The audit passed all assertions without refitting.
- The machine report preserves all raw predictions, calibration/person/subgroup summaries, all pairs/seeds, complete settings/failure/timing evidence and actual feature/model hashes. Hashes check integrity, not authenticity: score only trusted local freezes because pickle can execute code.
- Verification: `uv run --frozen python -m pytest -q` — 247 passed; Task7 focused checks — 30 passed. Pilot heuristic and guarded pilot fit/score remain explicitly pending their later tasks.
