# MealRec benchmark design journal

Interview in progress. These are agreed constraints; the detailed design and implementation plan remain open.

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

## Recruitment fallback

Use the same three-model comparison and response protocol in either participant mode. An Ori-only pilot produces within-person evidence; report it separately from a group pilot and do not treat repeated responses as additional independent people. Public-data benchmarking remains in scope in both cases.

The fallback does not select a simpler model or remove one of the three candidates. No participants have been contacted or enrolled by the agent.

## Participant commitment

Plan for about five meal assessments per day over two weeks, near actual mealtimes. This gives roughly 70 response opportunities per participant before missed visits or Not sure answers; it does not establish the number of definitive labels or statistical power. The target remains immediate appeal at the time of each response.

## Open decisions

- Group size and recruitment arrangements.
- Specific weather inputs, feature definitions, and operational details of context retrieval; missing hunger or failed weather retrieval is explicitly unknown.
- Detailed development cutoffs, uncertainty estimation, and fixed reference-selection mechanics.
- Compute budget, model-fitting/verification defaults, and reproducible runner outputs.
- Review of the complete design, written specification, and executable implementation plan before model implementation.

Ori selected pilot collection with an offline three-model runner over adding live shadow scoring. Ori approved the comparison/success criteria and collector/data flow. The final conversational design review covers fitting, verification, and delivery; routine implementation choices should be proposed together rather than asked one parameter at a time.

## Approved collector and data flow

Reuse MealRec sign-in for an opt-in pilot page. Participants set dietary exclusions and a weather city, then optionally report hunger at each visit. Show each meal’s name, image, and ingredients with the agreed ready-and-available-now prompt; use five distinct randomly drawn eligible meals per participant-day, allowing repeats on later days.

Record each displayed meal exposure with its meal metadata, display time, city, hunger, and weather available at that visit. Keep unknown hunger and failed weather retrieval explicitly unknown. Store each Yes/No/Not sure response against its exposure in a separate append-only pilot record; unanswered exposures remain unanswered, duplicate submissions are handled safely, and a failed save supports retry.

A versioned export with pseudonymous participant IDs feeds the common Python runner. All three models receive the same records and cutoffs. Existing MealRec feedback remains a separate source, and the collector supports both volunteer-group and Ori-only modes using the same protocol.

## Comparison interpretation

The 5% useful-gain threshold is an agreed provisional engineering criterion, not a dataset-derived effect estimate or a deployment guarantee. All three models use the same retained observations and information within each comparison; the initial UCI proxy and direct MealRec pilot remain separate tasks. Do not choose feature sets, reference controls, or model settings using second-week pilot answers. A small pilot may not distinguish candidates, and an Ori-only run supports within-person conclusions.

## Source and runtime evidence for the proposed design

A follow-up check did not establish an explicit Food.com research/noncommercial grant from the original release sources. UCI Restaurant & Consumer explicitly declares CC BY 4.0 and is the approved initial public proxy. Its restaurant food ratings cannot establish immediate meal appeal or context benefit.

An existing managed Python 3.12 interpreter and published compatible wheels support a plausible scikit-learn, CatBoost, and River FMClassifier CPU route. Installation, joint dependency resolution, and training have not been tested. These facts support the selected offline boundary; dependency resolution and actual execution remain implementation checks.

## Related records

- [Domain glossary](../../GLOSSARY.md)
- [Immediate-appeal benchmark target](../adr/0001-benchmark-immediate-meal-appeal.md)
- [Single-meal response protocol](../adr/0002-collect-meal-appeal-individually.md)
- [Common random exposures](../adr/0003-use-common-random-meal-exposures.md)
- [Frozen pilot evaluation](../adr/0004-freeze-pilot-models-before-evaluation.md)
- [Offline benchmark delivery](../adr/0005-collect-pilot-and-benchmark-offline.md)
- [Pilot exposure and response history](../adr/0006-preserve-pilot-exposures-and-responses.md)
- [Research shortlist and benchmark candidates](../research/recommendation-engine/benchmark-shortlist.md)
