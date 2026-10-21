# MealRec benchmark design journal

The specification and implementation plan are approved by Ori. Subagent-driven execution was selected on 2026-10-19; setup is in progress and implementation remains unfinished.

| Decision | Agreed scope |
| --- | --- |
| Models | Implement regularized logistic regression, CatBoost, and a context-aware factorization machine, then compare all three head to head. |
| Target | Immediate appeal, assuming the meal is ready and available to eat now. |
| Evidence | Public-data benchmarks plus an opt-in MealRec pilot with fresh appeal responses. |
| Pilot response | One meal at a time; Yes, No, or Not sure. Definite Yes/No responses are the primary labels; uncertainty is retained separately. |
| Participants | Prefer Ori plus a small volunteer group; allow a fallback to Ori alone. Recruitment and participant count are not confirmed. |
| Participant commitment | About 5 meal cards per day for two weeks, near actual mealtimes, in either participant mode. |
| Weather location | Participant selects a city once and can change it; retrieve city-level weather for pilot visits. |
| Hunger context | One optional question at the start of each visit: Not hungry / Somewhat hungry / Very hungry. Applies to that visit’s cards; skipped answers remain unknown. |
| Meal selection | Five distinct eligible meals per participant-day, drawn uniformly at random and respecting dietary exclusions. Meals may repeat on later days. All three models are evaluated on the same shown cards using information available before each answer. |
| Pilot evaluation | Develop in week one; freeze fitted parameters, preprocessing, and response-derived histories; evaluate week two without learning from its answers. |
| Delivery | Extend MealRec to collect the pilot; train and compare all three models with an offline Python runner. A live model-scoring service is outside this implementation. |
| Initial public task | UCI Restaurant & Consumer: the highest food-rating category versus the other two categories. This is a static restaurant-rating proxy, separate from the pilot’s immediate-appeal target. |
| Primary measure | Participant-balanced log loss; additionally report Brier score, calibration, runtime, and uncertainty. |
| Reference comparisons | Training-only overall and personal Yes rates, plus a calibrated current MealRec heuristic where its inputs can be mapped faithfully. Select the reference on development data. |
| Information comparisons | Predefined feature sets progressively add preference history, hunger, and weather across the three candidates. |
| Useful-gain rule | Provisionally require at least 5% lower pilot log loss than the development-selected reference, with paired uncertainty supporting improvement. Model-to-model results may remain inconclusive. |
| Implementations | scikit-learn personalized logistic regression, CatBoost Logloss, and River logistic FM; local CPU, equal tuning budgets, and three fixed stochastic seeds. |
| Development details | Shared days 1–5 for training and days 6–7 for development; refit on week one, freeze learned state/histories, and score days 8–14. Training histories use only earlier responses. |
| Verification/delivery | Export validation, missingness and cold-start/frozen-state checks; real UCI model E2E and real browser/database/export checks; locked dependencies, repeatable commands, artifacts/predictions, and accuracy/calibration/uncertainty/runtime report. |

## Recruitment fallback

Use the same three-model comparison and response protocol in either participant mode. An Ori-only pilot produces within-person evidence; report it separately from a group pilot and do not treat repeated responses as additional independent people. Public-data benchmarking remains in scope in both cases.

The fallback does not select a simpler model or remove one of the three candidates. No participants have been contacted or enrolled by the agent.

## Participant commitment

Plan for about five meal assessments per day over two weeks, near actual mealtimes. This gives roughly 70 response opportunities per participant before missed visits or Not sure answers; it does not establish the number of definitive labels or statistical power. The target remains immediate appeal at the time of each response.

## Current review and remaining work

Ori approved the [complete specification](../superpowers/specs/2026-10-18-meal-prediction-benchmark-design.md) after its c9c4521 commit. The [implementation plan](../superpowers/plans/2026-10-18-meal-prediction-benchmark.md) maps the specification to fourteen testable tasks: common contract/public data/features/three candidates/evaluation, then eligibility/reference control, weather, collection, export, frozen replay, and real-system delivery. Ori approved the plan and selected Subagent-driven execution. A fresh implementer and a task-scoped spec/quality review will cover each task, followed by whole-branch review.

Launch inputs are group size/enrollment, shared study dates, usable database/deployment infrastructure, and weather provider access mode. These do not block building the configurable collector or all three public-data model implementations. No participants have been contacted.

Ori selected Subagent-driven execution. The existing isolated worktree is reused on feat/meal-prediction-benchmark; the main checkout remains untouched. A plan-specific ignored ledger records preflight checks, task reports, review ranges and fixes. The collector will use immutable study configuration and one versioned participant aggregate per study for atomic daily quotas/responses, flattening the shared export without requiring replica-set transactions. Configured city options keep collection usable when hosted provider access is disabled. These implementation decisions are part of the approved plan.

Implementation, real-system verification, public-data results, delivery, and the eventual genuine pilot comparison remain unfinished. During planning no product code or experiments were run. Execution setup now provides Node 22 and locked JS dependencies; baseline checks and task implementation follow. No model fitting, recruitment or collection has occurred.

## Approved collector and data flow

Reuse MealRec sign-in for an opt-in pilot page. Participants set dietary exclusions and a weather city, then optionally report hunger at each visit. Show each meal’s name, image, and ingredients with the agreed ready-and-available-now prompt; use five distinct randomly drawn eligible meals per participant-day, allowing repeats on later days.

Record each displayed meal exposure with its meal metadata, display time, city, hunger, and weather available at that visit. Keep unknown hunger and failed weather retrieval explicitly unknown. Store each Yes/No/Not sure response against its exposure in a separate append-only pilot record; unanswered exposures remain unanswered, duplicate submissions are handled safely, and a failed save supports retry.

A versioned export with pseudonymous participant IDs feeds the common Python runner. All three models receive the same records and cutoffs. Existing MealRec feedback remains a separate source, and the collector supports both volunteer-group and Ori-only modes using the same protocol.

## Comparison interpretation

The 5% useful-gain threshold is an agreed provisional engineering criterion, not a dataset-derived effect estimate or a deployment guarantee. All three models use the same retained observations and information within each comparison; the initial UCI proxy and direct MealRec pilot remain separate tasks. Do not choose feature sets, reference controls, or model settings using second-week pilot answers. A small pilot may not distinguish candidates, and an Ori-only run supports within-person conclusions.

## Source and runtime evidence

A follow-up check did not establish an explicit Food.com research/noncommercial grant from the original release sources. UCI Restaurant & Consumer explicitly declares CC BY 4.0 and is the approved initial public proxy. Its restaurant food ratings cannot establish immediate meal appeal or context benefit.

An existing managed Python 3.12 interpreter and published compatible wheels support the selected scikit-learn, CatBoost, and River FMClassifier CPU route. Installation, joint dependency resolution, and training have not been tested. Dependency resolution and actual execution remain implementation checks.

Bounded follow-ups verified that existing username/PIN UI authentication can support real-system collector checks without an auth bypass. The current coarse weather helper replaces failures with normal and loses provenance, so the pilot needs its separate nullable weather-snapshot contract. Open-Meteo data licensing and hosted access terms are distinct; the specification leaves authorized access mode/credentials as launch configuration and records unavailable weather honestly when access is absent. Neither follow-up ran tests or provider endpoint smoke checks.

## Related records

- [Domain glossary](../../GLOSSARY.md)
- [Immediate-appeal benchmark target](../adr/0001-benchmark-immediate-meal-appeal.md)
- [Single-meal response protocol](../adr/0002-collect-meal-appeal-individually.md)
- [Common random exposures](../adr/0003-use-common-random-meal-exposures.md)
- [Frozen pilot evaluation](../adr/0004-freeze-pilot-models-before-evaluation.md)
- [Offline benchmark delivery](../adr/0005-collect-pilot-and-benchmark-offline.md)
- [Pilot exposure and response history](../adr/0006-preserve-pilot-exposures-and-responses.md)
- [Research shortlist and benchmark candidates](../research/recommendation-engine/benchmark-shortlist.md)

## 2026-10-21 — implementation and verification outcome

The planning statements above describe the pre-execution stage. The approved three-model offline benchmark, opt-in collector, immutable export and frozen pilot replay are now implemented for cgm-16. The [versioned data contract](../../contracts/meal-prediction/v1.md), [measured UCI report](../research/recommendation-engine/results/uci-three-models.md) and [pilot runbook](../research/recommendation-engine/pilot-runbook.md) are the operational records for [issue #65](https://github.com/cgm-16/meal-rec/issues/65). This is an engineering checkpoint before the final scoped review, remote CI and draft-PR delivery; issue #65 still includes genuine study work.

The 2026-10-19 CPU UCI run at `8e3418c` used 1,161 real ratings, the fixed 812/174/175 split, all 54 tuning settings and 18 selected-seed refits. F1 participant log loss was 0.546418 for the selected personal-rate reference, 0.557713 for logistic regression, 0.576755 for CatBoost and 7.511275 for FM. The poor but finite FM result was retained without test-guided retuning. Paired uncertainty did not establish a candidate advantage over the reference. These are static restaurant-rating results; they do not establish immediate appetite, hunger/weather benefit or improved purchases, consumption or feed acceptance.

Recorded acceptance and the final review-fix readings have distinct conditions:

- The earlier full Python gate at `f2da66a` reported 312 passes in 61.94 seconds using Python 3.12.12, uv 0.12.9 and pytest 9.1.1 on Darwin arm64/CPU, with an already populated public cache. The final review then demonstrated two real CatBoost cold-cache failures before fitting. All four direct UCI test consumers now invoke the existing pinned-hash fetch helper; suite order and CI configuration were not changed. The repaired test bytes, committed as `8596c00`, passed seven focused native-model/feature cases from four separate empty caches and a full `uv run --frozen python -m pytest -rP`: 312 passes in 61.15 seconds, starting with the actual worktree ZIP absent. The owned original ZIP was preserved and restored byte-identically; the measured public split/freeze and its 20 artifacts still match their recorded hashes.
- The earlier full production-browser gate at `3cd4c35` reported 32 passes in 43.0 seconds: 16 Chromium and 16 WebKit, covering 18 legacy, 10 PWA and four pilot cases. The current affected gate reran exactly the four pilot cases against a production build and real MongoDB 8.0.34, using Node 22.23.3/pnpm 10.12.3, Chromium 156.0.8078.4 and WebKit 27.2 at 1280×720, one worker and zero retries. It reported four passes in 28.8 seconds with no failures, skips or flaky cases. Normal UI sign-in/enrollment and second-user ownership checks reached actual Mongo records, the built Node export CLI and Python validation; Yes/No remained 1/0, while Not sure, skip and unanswered exposures stayed out of binary targets. All 236 tracked source hashes matched across the run. This is current affected-case evidence plus historical full-suite evidence, not a fresh 32-case claim.
- The cache test's text-only expected-error set accepted unrelated or duplicate failures in the review calibration. Its replacement at `bc81c35` asserts exact browser-specific diagnostic/request multisets: three owned GET URLs, method, null body, offline phase, source/location and exact multiplicity, with zero extras. The phase closes before reconnection and assertions follow completed online requests. The actual old predicate violated 24 of 30 calibration requirements; the repaired predicate passed all 30. Both real browser cases retained three null offline statuses, empty sensitive CacheStorage and no monitoring uploads.
- The fixture seed's missing/wrong study ID formerly failed after resetting the dedicated database. Actual sentinel experiments showed both invalid configurations changed the five fixture collections. The same-value preflight now runs before fixture mutation (`45c33ab`), retaining both database-name guards; both invalid configurations leave every collection snapshot unchanged. The valid seed path passed the four real browser cases. Node 22 type checking, changed-spec ESLint, both script syntax checks and the extended existing guard self-check all passed. No dependency, model, schema, limit, compatibility layer or test layer was added.

Raw final-wave logs, reporter, sentinel snapshots, source hashes and constructed export/screenshot indexes are retained locally under `/tmp/meal-rec-final-fix-_0w85mud`. The current production build succeeds while still printing the preexisting Sentry/OpenTelemetry `require-in-the-middle` static-extraction warning; it is not warning-free. The unchanged 552-JavaScript suite, full 32-browser suite and full native research budget were not repeated for these repairs.

Genuine enrollment, shared study dates, authorized study infrastructure and the actual 14-day response window remain unfinished. Configured live-provider success, remote CI, production-service benefit, load performance and broad visual/manual accessibility assessment remain unverified. Automated browser/export/fit/score bundles are constructed verification even when `automated_fixture=false`; metadata cannot prove human authenticity or absence of outside outcome inspection. Checksums establish integrity, not authenticity, and pickle freezes must be trusted local artifacts. Logical completion markers do not establish power-loss durability. The accepted bounded timezone/precision policies remain in force. No volunteer was contacted, deployment performed or production recommendation engine replaced by this work.

## 2026-10-21 — hosted CI and MongoDB runner compatibility

CI run `39560197520` tested synthetic PR merge `8d368e55fc4bfef95a37a1fa4c909b646ee4d417`: the [Python job](https://github.com/cgm-16/meal-rec/actions/runs/39560197520/job/119089331287) passed 312 tests under Python 3.12.12/uv 0.12.9, and the [application job](https://github.com/cgm-16/meal-rec/actions/runs/39560197520/job/119089331642) passed 552 tests in 35 files under Node 22.23.3/pnpm 10.12.3. The Docker MongoDB service fatally rejected its host kernel (`SERVER-121912`); separate MongoMemoryServer 8.0.34 processes support the application tests. The [browser job](https://github.com/cgm-16/meal-rec/actions/runs/39560197520/job/119090132593) failed all three database-health attempts before executing any browser case. These readings do not establish a pristine full CI pass; existing build/action advisories remain.

Ori approved pinning only the two MongoDB jobs to `ubuntu-22.04`, preserving their services, commands and guards. The [published candidate image](https://github.com/actions/runner-images/releases/tag/ubuntu22%2F20261012.322) uses kernel 6.8.0-1064-azure, within the [MongoDB-supported range](https://www.mongodb.com/docs/v8.0/release-notes/8.0/); this is image metadata, not a job `uname` reading. Ubuntu 22.04 is deprecated and [retires on 2027-04-17](https://github.com/actions/runner-images/issues/14254), requiring migration to a supported kernel before then. Fresh real hosted CI remains pending Ori's workflow-commit push; text/config checks cannot establish service startup or browser success.

Earlier local `/tmp` raw evidence is missing for an unknown reason. Actual CI logs are retained in the ignored delivery directory; the measured public run's 20 artifacts, split and freeze hashes remain retained. The inherited [dependency audit failure](https://github.com/cgm-16/meal-rec/actions/runs/39560198237/job/119089332443), with ten moderate findings, belongs to a separately authorized dependency PR; its threshold and exceptions remain unchanged here.
