# MealRec three-model prediction benchmark

Date: 2026-10-18. Status: specification and implementation plan approved by Ori; Subagent-driven execution authorized.

## Outcome and scope

Implement and benchmark **all three** candidates: personalized regularized logistic regression, CatBoost, and a context-aware factorization machine. Build an opt-in MealRec collector and a local Python runner that give the candidates the same observations, information, and evaluation boundaries. Answer two separate questions: which model predicts held-out responses better, and whether preference history, hunger, or weather adds useful predictive information.

The product target is **immediate appeal**. The exact pilot prompt is:

> If this meal were ready to eat and available to you now, would you eat it?

Yes is 1, No is 0, and Not sure remains a separate response excluded from binary fitting and scoring. Unanswered exposures remain unanswered. These probabilities concern willingness to eat one meal; they do not sum to one across meals. Purchases, preparation effort, affordability, consumption, and satisfaction are different outcomes.

Deliver the collector, all three implementations, repeatable public-data results, and a runner ready for genuine pilot exports. A completed pilot comparison depends on collected responses. Live Python inference, production-engine replacement, purchase-data integrations, recruitment messaging, and deployment are outside this implementation. No empirical model comparison or pilot collection has occurred yet.

## Evidence tracks

| Track | Defined outcome | Evaluation and claim |
| --- | --- | --- |
| Initial public proxy | UCI Restaurant & Consumer: `food_rating == 2` versus codes 0 or 1 | Static held-out restaurant food-rating prediction; verifies the shared pipeline and permits a limited model comparison. |
| MealRec pilot | Definite Yes/No to the prompt above | Future-week immediate-appeal prediction, with current hunger/weather and frozen preference learning. |

Keep their models, labels, metrics, reports, and conclusions separate. UCI has no rating-event times, hunger, or weather. Do not invent occasions or attach weather to restaurant coordinates. Food.com and other previously researched datasets remain future extensions; they are not dependencies of this implementation.

The [UCI release](https://archive.ics.uci.edu/dataset/232/restaurant+consumer+data) declares CC BY 4.0. Retain its citation, source, license, and transformation description with derived artifacts. Use the official ZIP with audited SHA-256 `dc61ec3779db8d3bd2cde8d65abf87dc07e9b22ae94f9b9ad6375d57f627e333`. It contains 1,161 unique user–restaurant observations: 516 high food ratings and 645 lower ratings. Codes zero and one are valid lower ratings. Other same-observation overall/service ratings are excluded from predictors.

Aggregate multivalued cuisine tables before left joins, preserve all observations, and retain missing-cuisine indicators. Thirty-five rated restaurants lack cuisine entries. Decode `geoplaces2.csv` as CP1252 and recognize `?` as missing. Initial shared metadata are user/restaurant IDs, stated cuisine preferences, restaurant cuisine, cuisine compatibility, price, and ambience. Payment tables are unnecessary for this task.

## Architecture and ownership

| Component | Responsibility and interface | Location |
| --- | --- | --- |
| Pilot UI/API | Opt-in, participant settings, visits, random cards, display acknowledgements, response submission; authenticated session supplies identity. | Existing `meal-rec` application, with a separate `/pilot` flow and `/api/pilot` routes. |
| Pilot persistence | Study configuration, participant membership/settings, visit context, allocations, displayed exposures, immutable responses, and required uniqueness. | `packages/database`, using existing Mongoose/connection patterns. |
| Export command | Read one study from an explicitly selected database; write a versioned snapshot and validate its consistency. | Existing TypeScript script/database boundary; no public bulk-export endpoint. |
| Offline benchmark | Import UCI or pilot exports, make splits/features, fit candidates/controls, score common rows, save artifacts and report. | Independent `benchmarks/meal_prediction` Python project with its own dependency lock. |

The Python runner consumes files and does not need production database credentials. Collector and export share the recorded schema; model implementations share the same event/split/feature contract. A small internal `fit`/`predict_proba`/save-load boundary accommodates the three libraries without a plugin framework or serving service.

Existing recommendation/feedback behavior is preserved. The latest user–meal feedback record cannot represent repeated pilot exposures, so pilot history is recorded separately. Reuse dietary eligibility rules through a focused shared helper if needed; do not change their product semantics or refactor unrelated recommendation behavior.

## Pilot collection protocol

Prefer Ori plus a small volunteer group, with an Ori-only fallback. Recruitment and participant count are launch inputs. Both modes use the same three candidates and protocol; solo evidence is within-person. Approximately five cards per day for fourteen days yields about seventy opportunities per participant before missed visits and Not sure answers, not a power guarantee.

Before collection, create an immutable study manifest with study ID, protocol/catalog version, randomization seed, shared UTC cutoffs, and dataset/export schema version. Start time must be explicit, never inferred from the export date. Membership requires a signed-in participant’s explicit opt-in; server endpoints derive participant identity from the normal session. Reuse the existing username/PIN signup and signin flow. Present the purpose, duration, and recorded context before opt-in; serve assessments only within the configured study window.

Participants select dietary exclusions and a specific city from matching city/country/administrative-area choices. Store the selected city ID, coordinates, and IANA timezone. Use the enrollment timezone to define the participant’s daily quota throughout this pilot; retain the current selected city’s timezone for local prediction context when travelling. City/exclusion changes apply prospectively and remain represented in subsequent snapshots.

At each visit ask one optional hunger question: Not hungry / Somewhat hungry / Very hungry. Skipping means unknown. Capture one weather snapshot at visit start. A visit lasts at most thirty minutes; afterwards a new visit obtains fresh context. Context remains immutable for cards assessed within the visit.

Draw five distinct eligible meals per participant-day uniformly without replacement from the full eligible catalog, independently of every model. Persist the daily allocation so refreshes/concurrent requests do not redraw favorable cards or exceed the quota. There is no repeat avoidance across days. If exclusions change, replace only unshown now-ineligible allocations by a uniform draw from the remaining eligible meals. A pool smaller than five yields the available distinct meals and a recorded shortage; an empty pool yields no cards.

Show one card at a time using meal name, image or a consistent missing-image placeholder, and ingredients, with the exact prompt and Yes / No / Not sure buttons. Do not display scores or alter cards by model. An explicit skip leaves the exposure unanswered. Leaving the page also supplies no label. Record allocations separately from display acknowledgement: server issuance alone is not evidence that a card was displayed.

An acknowledged display creates an exposure with a stable ID, meal metadata snapshot, visit/context reference, server receipt time, and client display time. Retries and rerenders within the same assessment reuse that ID. A later assessment is a new exposure. An expired unanswered card stays unanswered and is not reassessed that day. Response retries return the original successful record; a conflicting second answer is rejected rather than overwriting it. Do not advance the UI after an unsuccessful response save; retain a retry path. Persist unanswered exposures as well as responses.

## Weather contract

Use a server-side adapter for the [Open-Meteo current fields](https://open-meteo.com/en/docs) `temperature_2m`, `precipitation`, and `weather_code`, with explicit Celsius/mm units, Unix timestamps, and timezone information. [City lookup](https://open-meteo.com/en/docs/geocoding-api) supplies the selected place. The existing coarse weather helper discards provenance and substitutes `normal` on failure; the pilot needs a separate snapshot result rather than that fallback.

Record provider, requested city coordinates, returned grid coordinates, weather-valid time, source interval, application request/retrieval times, raw WMO code, temperature, precipitation, units, and `ok`/`partial`/`unavailable` status. Current values are model-based conditions; retrieval time is neither a station-observation time nor a model-issuance time. Zero precipitation and code zero remain valid values. Preserve nullable fields and unfamiliar integer condition codes. No later weather fetch may fill a failed earlier visit.

Operational defaults are one request per visit, a three-second timeout, no-store requests, and network-only treatment of pilot APIs in the service worker. Accept usable partial fields and record their missingness. Treat data with absent valid time, more than one hour of age, or over five minutes in the future as unavailable for weather features while preserving the raw response/status for audit. Weather failure permits assessment with unknown weather; it does not become normal weather. Local clock features use the selected city timezone rather than a silently substituted browser/server timezone.

Hosted API access and data licensing are separate: the [data license](https://open-meteo.com/en/licence) is CC BY 4.0; [free hosted access](https://open-meteo.com/en/terms) is restricted to eligible noncommercial use. Provider host/access mode and any customer key are launch configuration inputs, with credentials kept server-side. Do not create a paid account or assume that small pilot size establishes eligibility. With no configured authorized provider, record weather as unavailable and mark weather-benefit evidence unavailable. Include Open-Meteo/GeoNames attribution in collector context/source information and export provenance. Access restrictions do not block implementation of the collector or the UCI benchmark.

## Event and export contract

Use schema version 1 and one canonical binary observation per definite response. The exported snapshot includes:

- Study manifest, protocol/catalog versions, cutoffs, randomization details, source/license notes, export time, and file hashes.
- Stable study-specific pseudonymous participant IDs; enrollment time/timezone and setting snapshots needed to interpret exposures. Exclude usernames, PIN hashes, authentication/session data, and database connection secrets.
- Visit IDs, start/expiry times, selected city/timezone, optional hunger, weather snapshot/status, and context timestamps.
- Allocation/exposure IDs, participant/day/visit associations, meal ID/content snapshot, server/client display times, dietary setting version, and selection probability/eligible-pool size.
- Optional immutable response ID, Yes/No/Not sure value, client action time, and server receipt time.

Identity mapping stays in the application database. Export all exposures, including unanswered/uncertain ones, so coverage can be reported. Preserve variable catalog metadata at exposure time rather than joining today’s mutable catalog. Use UTC for stored instants and retain IANA zones for local features.

Reject duplicate response IDs, contradictory outcomes for one exposure, broken participant/visit references, invalid enums/types, and inconsistent study/cutoff versions. Distinguish an absent optional context value from an invalid payload. Record failed context retrieval without dropping its response. Retain timestamp anomalies in the audit output, but omit impossible/expired assessments from binary evaluation using fixed validation rules shared by all three models. Apply exclusions before model fitting and report their counts/reasons.

The prediction point is acknowledged display; the response is accepted only after that acknowledgement and before visit expiry. A development response becomes available for history when the server receives it, strictly before the next prediction point. Display and response receipt must lie within the same train/development/test interval; a cutoff-crossing assessment is omitted from all primary fitting/scoring and retained in the audit. The export identifies both display and receipt time; a single mutable timestamp is insufficient.

## Shared features and information comparisons

Use unit weights for retained training events. Fit vocabularies, scaling/imputation, learned statistics, and any feature selection on the relevant fitting partition only. Numeric missing values use training medians plus missing indicators; an entirely missing numeric field uses zero with its missing indicator. Preserve categorical missingness; hunger and WMO condition are categorical, not numeric ordinal scales. No held-out label may determine a vocabulary or aggregate.

Prespecify this pilot ladder for every family:

| Preset | Information |
| --- | --- |
| F0 | Meal cuisine, ingredients, flavor/weather/time tags, spiciness/heaviness; local cyclic hour and day-of-week. No participant/meal identity or response-derived feature. |
| F1 | F0 plus known participant/meal IDs, explicit participant × content interactions, and strictly prior definite-response counts/rates and cuisine/ingredient/flavor affinities. |
| F2 | F1 plus optional visit hunger, missingness, and hunger × meal-content interactions. |
| F3 | F2 plus current temperature, precipitation, WMO condition, missingness, and weather × meal-content interactions. |

F3 is the common primary information set, not a feature set selected on the test week. F0–F2 and paired increments are prespecified secondary analyses. All families receive the same raw information and deterministic derived interactions within a preset, using library-appropriate representations. Report feature coverage; a weather comparison with no usable weather is not evidence against weather’s potential value. These are predictive associations, not causal weather effects.

Prior user/content rates use fixed symmetric smoothing `(yes + 1) / (definite_count + 2)` and retain counts. Training-event histories use only earlier received responses and never the row’s own label. Development histories freeze at day five; final-test histories freeze at day seven. No second-week answer updates any candidate, baseline, profile, vocabulary, or feature.

UCI runs F0 and F1 with the available static metadata only. Public F0 contains restaurant/cuisine attributes and stated cuisine compatibility; public F1 adds known user/restaurant identities, user × cuisine interactions, and training-only rating profiles. Because event order is absent, leave each fitting row’s own label out of its rating-derived profiles; development/test profiles use only the corresponding fitting partition. Omit unavailable clock, hunger, and weather features rather than fabricating them.

## Model implementations and controls

Use Python 3.12 in an isolated uv-managed project with jointly resolved, locked NumPy/scikit-learn/CatBoost/River dependencies. Compatible wheels were found in research, but installation/import/training remain unverified. Use CPU only. Library/version resolution is an implementation check, not permission to omit a family if setup fails.

| Candidate | Required behavior | Initial nine-setting development grid |
| --- | --- | --- |
| M1: personalized logistic | scikit-learn `LogisticRegression`, L2 regularization, sparse encodings and explicit person–content/context interactions. A user intercept alone is insufficient personalization. | Nine logarithmically spaced `C` values from 0.01 to 100; `lbfgs`, 2,000 maximum iterations, tolerance 0.000001. |
| M2: boosted trees | `CatBoostClassifier`, CPU `Logloss`, native categorical fields and common numeric/derived inputs. | Depth 2/4/6 × L2 leaf regularization 1/3/10; 300 iterations, learning rate 0.05. |
| M3: context-aware FM | River `facto.FMClassifier`, explicit logistic loss, second-order interactions, nonzero L2 for both weights and latent factors. Train offline by replaying fixed feature rows. | Rank 4/8/16 × L2 0.00001/0.001/0.1; weight/latent learning rates 0.01; 25 passes. |

Nine settings per family/preset give equal search counts, not equal wall-clock cost; measure runtime separately. Tune with seed 42. For the selected settings, repeat stochastic fits with seeds 42/43/44; seed 42 is the prespecified primary result, and the others measure training sensitivity rather than provide best-seed selection. Persist settings/order and require finite losses/probabilities; treat solver convergence warnings as failed settings rather than silently accepting them. An invalid setting is recorded as failed without quietly expanding its family’s budget. If no setting for a family fits, report the blocker and keep implementation incomplete for that comparison.

Freeze learned feature identities and deterministic ordering. Unknown IDs/categories contribute no newly randomized parameter; known content and priors remain usable. Features never active after preprocessing in the fitting partition contribute zero at scoring, including all-zero missingness indicators or numeric fields, rather than activating an untrained FM vector. In particular, River’s lazy latent initialization must not mutate the model or introduce random unseen embeddings during prediction. Verify order invariance, repeated scoring, save/load parity, and unchanged fitted state on unfamiliar inputs. Parameters, preprocessing, and rating histories must be frozen together.

Controls are a smoothed global positive rate, a personal positive rate shrunk toward that global rate with five prior observations, and the calibrated current heuristic in the pilot. For a new person the personal control uses the global rate. Map prior pilot Yes/No to the heuristic’s like/dislike effects, retain its default quiz behavior where no declared input exists, and omit Not sure from preference history. Extract deterministic scores before surprise/sampling noise; fit their two-parameter logistic calibration with L2 `C=1` and M1’s solver criteria on fitting rows whose history excludes their own/future labels. Record the pinned heuristic implementation and input mapping. UCI has no faithful dish-level heuristic mapping, so that control is unavailable there. Existing feedback records are not silently treated as immediate-appeal labels.

## Splits, selection, and frozen evaluation

The pilot study start `T0` is one shared UTC instant. Training is `[T0, T0+5 days)`, development is `[T0+5 days, T0+7 days)`, and test is `[T0+7 days, T0+14 days)`. Participation may begin late, but individual enrollment does not shift the study’s cutoffs. Test-only participants are cold starts. Log distinct support by person, date, meal, label, and missing context.

Use development participant-balanced log loss to choose settings within each family/preset, choose the reference control, and identify one primary F3 candidate before examining test outcomes. Break exact ties by fixed order M1/M2/M3 and global/personal/heuristic controls, then ascending grid order. Refit candidates/controls on all valid week-one responses with the selected settings; recompute training profiles chronologically and freeze final histories at day seven. The development export exposes only week-one data, and fit/freeze accepts only that partition. Record the selection/freeze time and artifact hashes before unsealing second-week outcomes for evaluation. Lock the selection protocol by the day-seven boundary; flag a late freeze or prior inspection of test outcomes as retrospective rather than claiming a prospective untouched holdout. Final scoring uses outcome-free feature rows; only the evaluator receives their labels.

For UCI, use a seed-42 label-stratified approximately 70/15/15 observation split and save the exact observation IDs. Select settings on development, refit on train plus development, and evaluate once on the same test observations for every family. Report warm-user/item and unseen-user/item support as subgroups. Empty cold-start groups are unsupported rather than evidence of generalization. This remains a static observed-rating comparison.

## Metrics, uncertainty, and useful gain

Primary log loss is calculated per participant and then averaged equally across participants with definite test labels. Also report event-averaged log loss, participant-balanced Brier score, calibration in the fixed bins `[0,0.2)`, `[0.2,0.4)`, `[0.4,0.6)`, `[0.6,0.8)`, `[0.8,1]`, coverage/missingness, per-participant results, training/scoring time, and peak process memory. Calibration uses the same participant-balanced observation weights. Clip probabilities to `[0.000001, 0.999999]` for log-loss computation only; retain raw probabilities in predictions. Do not tune calibration or bins on test labels.

Compare predictions on identical observation IDs. Use 2,000 seed-42 paired bootstrap replicates: resample participant-level loss vectors for the group interval, preserving the multiplicity of participants drawn more than once; additionally sample common circular two-day blocks of study dates, concatenate and truncate to seven days, for a pilot time-sensitivity interval. Use the same draws for all candidate/control differences, recompute participant-balanced losses per draw, and report percentile intervals. Omit empty resamples and report their count and the number of usable replicates; an unavailable interval cannot support a useful-gain flag. A group interval requires at least two represented participants; the solo mode uses only time blocks and is labeled within-person. UCI uses participant resampling only because it has no event dates. These intervals are exploratory, particularly with few participants or seven test days; report their support and do not imply a powered trial.

For the development-selected F3 candidate versus the development-selected reference, report relative gain `(reference_loss - candidate_loss) / reference_loss`. Flag a provisional useful pilot gain only when the observed reduction is at least 5% and the available paired 95% interval(s) support positive improvement. Require both group and time support in group mode; solo findings remain within-person. Fewer than five nonempty test dates or a single observed test class yields an insufficient-evidence status rather than a useful-gain flag. These are reporting guards, not sample-size/power claims.

Publish the full M1/M2/M3 table, all pairwise differences, seed variation, and feature increments regardless of the primary candidate’s result. Their intervals are descriptive secondary comparisons; distinguish the lowest observed loss from a reliably established winner. Feature/model selection never uses the second week. Better prediction on random exposed meals is not proof that deploying a model increases feed acceptance, purchase, or consumption.

No fitting partition with fewer than two observed classes can support the agreed three-family fit. Report baselines/coverage where possible and mark candidate fitting not estimable; do not relabel uncertain/missing responses, add synthetic pilot observations, or substitute a constant predictor while calling it a trained candidate. A small public dataset or pilot may yield an inconclusive result.

## Verification and delivery acceptance

Follow TDD for functionality. Required checks are:

1. **Unit:** label/missingness handling, eligibility-before-sampling, sampling without daily duplicates or model influence, split/cutoff boundaries, strictly prior/leave-one-out profiles, participant weighting, paired metric alignment, and immutable cold-start predictions.
2. **Integration:** real MongoDB persistence/uniqueness, ownership and opt-in enforcement, safe response retries, visit expiry/context snapshots, export referential integrity, UCI join coverage, all three fit/predict/save-load paths, and final-fit isolation from test labels. Provider failure cases may be exercised at the unit boundary; E2E does not use mocked systems.
3. **Real-data model E2E:** fetch/verify the official UCI artifact and run all three families on the common saved split. Require all 1,161 source observations to survive valid joins, finite aligned predictions and reports, and reproducible artifacts; do not assert that a chosen family must win.
4. **Real-system collector E2E:** use normal UI signup/signin, opt in, show/answer cards, then assert the same exposure/response/context in the dedicated MongoDB and actual export. Pass the same database selection explicitly to server, assertions, and exporter. Use real provider calls when authorized access is configured; otherwise report the live-weather check unrun and test the real collector’s unavailable-weather path. Avoid local-server reuse that could attach to another database/application.

Use the repository’s Node 22/pnpm conventions, frozen-lockfile installation, built workspace artifacts, and real isolated MongoDB/browser prerequisites. Existing E2E seeding is destructive; use a dedicated test database and keep automated assessment records separate from genuine pilot exports. Do not weaken auth or add a test bypass. Record missing infrastructure or failed checks rather than claiming verification.

The implementation must provide documented install, public-run, study-configuration, export, fit/freeze, and score/report commands. Every run records Git revision, locked runtime/dependencies, input hashes, exact split IDs, feature/config/seed choices, model artifacts, frozen-state hashes, per-observation predictions, exclusions, timings/memory, and a Markdown plus machine-readable comparison report. Keep raw pilot exports, identity mappings, credentials, generated models, and bulky run outputs out of Git; track code, locks, configs, compact summary reports, and provenance.

Implementation acceptance means the collector and all three real-data model paths pass their relevant checks and the public report contains measured results. The pilot runner must be usable with a valid real export. The full empirical objective also requires the study window and actual responses; a pending pilot comparison remains unfinished work. Study dates, participant enrollment, database/deployment access, and weather access mode are launch inputs, not reasons to omit one of the three models.

## Decision and source references

- [Domain glossary](../../../GLOSSARY.md) and [design journal](../../journal/journal-meal-prediction-benchmark-design.md).
- [Target](../../adr/0001-benchmark-immediate-meal-appeal.md), [response protocol](../../adr/0002-collect-meal-appeal-individually.md), [random exposures](../../adr/0003-use-common-random-meal-exposures.md), [frozen holdout](../../adr/0004-freeze-pilot-models-before-evaluation.md), [offline delivery](../../adr/0005-collect-pilot-and-benchmark-offline.md), [pilot history](../../adr/0006-preserve-pilot-exposures-and-responses.md).
- [Research shortlist](../../research/recommendation-engine/benchmark-shortlist.md) and [dataset evidence](../../research/recommendation-engine/benchmark-data-evidence.md). This specification supersedes the earlier conditional Food.com-first suggestion for the initial implementation.
- [UCI source/citation](https://doi.org/10.24432/C5DP41), [official ZIP](https://archive.ics.uci.edu/static/public/232/restaurant+consumer+data.zip), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [LogisticRegression API](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html), [CatBoostClassifier API](https://catboost.ai/docs/en/concepts/python-reference_catboostclassifier.html), [River FMClassifier API](https://riverml.xyz/latest/api/facto/FMClassifier/), and [versioned FM implementation](https://raw.githubusercontent.com/online-ml/river/0.26.1/river/facto/base.py).

These documents and runtime/source checks support the design. Joint dependency installation, model performance, provider connectivity, and collector correctness remain implementation/experiment checks.
