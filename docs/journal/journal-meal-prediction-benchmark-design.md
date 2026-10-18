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

## Recruitment fallback

Use the same three-model comparison and response protocol in either participant mode. An Ori-only pilot produces within-person evidence; report it separately from a group pilot and do not treat repeated responses as additional independent people. Public-data benchmarking remains in scope in both cases.

The fallback does not select a simpler model or remove one of the three candidates. No participants have been contacted or enrolled by the agent.

## Participant commitment

Plan for about five meal assessments per day over two weeks, near actual mealtimes. This gives roughly 70 response opportunities per participant before missed visits or Not sure answers; it does not establish the number of definitive labels or statistical power. The target remains immediate appeal at the time of each response.

## Open decisions

- Group size and recruitment arrangements.
- Common meal presentation, eligible candidates, and exposure policy.
- Specific weather inputs, context retrieval/failure handling, and the common context/history comparisons.
- Public dataset terms, training and holdouts, primary metrics, and the rule for declaring a useful gain.
- Compute budget, model-serving boundary, and pilot delivery.
- Review of the complete design, written specification, and executable implementation plan before model implementation.

The next interview question concerns meal selection during the pilot: a shared random eligible sample versus meals chosen by the models. No exposure policy has been selected yet.

## Related records

- [Domain glossary](../../GLOSSARY.md)
- [Immediate-appeal benchmark target](../adr/0001-benchmark-immediate-meal-appeal.md)
- [Single-meal response protocol](../adr/0002-collect-meal-appeal-individually.md)
- [Research shortlist and benchmark candidates](../research/recommendation-engine/benchmark-shortlist.md)
