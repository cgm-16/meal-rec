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
| Meal selection | Random eligible meals respecting dietary exclusions; all three models are evaluated on the same shown cards using information available before each answer. |
| Pilot evaluation | Develop in week one; freeze fitted parameters, preprocessing, and response-derived histories; evaluate week two without learning from its answers. |
| Delivery | Extend MealRec to collect the pilot; train and compare all three models with an offline Python runner. A live model-scoring service is outside this implementation. |

## Recruitment fallback

Use the same three-model comparison and response protocol in either participant mode. An Ori-only pilot produces within-person evidence; report it separately from a group pilot and do not treat repeated responses as additional independent people. Public-data benchmarking remains in scope in both cases.

The fallback does not select a simpler model or remove one of the three candidates. No participants have been contacted or enrolled by the agent.

## Participant commitment

Plan for about five meal assessments per day over two weeks, near actual mealtimes. This gives roughly 70 response opportunities per participant before missed visits or Not sure answers; it does not establish the number of definitive labels or statistical power. The target remains immediate appeal at the time of each response.

## Open decisions

- Group size and recruitment arrangements.
- Common meal presentation, repeated-exposure rules, and detailed sampling mechanics.
- Specific weather inputs, context retrieval/failure handling, and the common context/history comparisons.
- Public-data source selection, detailed development cutoffs, primary metrics, and the rule for declaring a useful gain.
- Compute budget and detailed collector/export/runner behavior.
- Review of the complete design, written specification, and executable implementation plan before model implementation.

Ori selected pilot collection with an offline three-model runner over adding live shadow scoring. The next design review covers the comparison and success criteria, followed by collector/data flow and verification; routine implementation choices should be proposed together rather than asked one parameter at a time.

## Source and runtime evidence for the proposed design

A follow-up check did not establish an explicit Food.com research/noncommercial grant from the original release sources. UCI Restaurant & Consumer explicitly declares CC BY 4.0 and can provide a small initial public proxy; using it is a proposed source adjustment pending design review. Its restaurant food ratings cannot establish immediate meal appeal or context benefit.

An existing managed Python 3.12 interpreter and published compatible wheels support a plausible scikit-learn, CatBoost, and River FMClassifier CPU route. Installation, joint dependency resolution, and training have not been tested. These facts support the selected offline boundary; dependency resolution and actual execution remain implementation checks.

## Related records

- [Domain glossary](../../GLOSSARY.md)
- [Immediate-appeal benchmark target](../adr/0001-benchmark-immediate-meal-appeal.md)
- [Single-meal response protocol](../adr/0002-collect-meal-appeal-individually.md)
- [Common random exposures](../adr/0003-use-common-random-meal-exposures.md)
- [Frozen pilot evaluation](../adr/0004-freeze-pilot-models-before-evaluation.md)
- [Offline benchmark delivery](../adr/0005-collect-pilot-and-benchmark-offline.md)
- [Research shortlist and benchmark candidates](../research/recommendation-engine/benchmark-shortlist.md)
