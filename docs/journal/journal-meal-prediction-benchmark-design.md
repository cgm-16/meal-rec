# MealRec benchmark design journal

Interview in progress. These are agreed constraints; the detailed design and implementation plan remain open.

| Decision | Agreed scope |
| --- | --- |
| Models | Implement regularized logistic regression, CatBoost, and a context-aware factorization machine, then compare all three head to head. |
| Target | Immediate appeal, assuming the meal is ready and available to eat now. |
| Evidence | Public-data benchmarks plus an opt-in MealRec pilot with fresh appeal responses. |
| Pilot response | One meal at a time; Yes, No, or Not sure. Definite Yes/No responses are the primary labels; uncertainty is retained separately. |
| Participants | Prefer Ori plus a small volunteer group; allow a fallback to Ori alone. Recruitment and participant count are not confirmed. |

## Recruitment fallback

Use the same three-model comparison and response protocol in either participant mode. An Ori-only pilot produces within-person evidence; report it separately from a group pilot and do not treat repeated responses as additional independent people. Public-data benchmarking remains in scope in both cases.

The fallback does not select a simpler model or remove one of the three candidates. No participants have been contacted or enrolled by the agent.

## Open decisions

- Participant commitment, group size, and the pilot schedule.
- Common meal presentation, eligible candidates, and exposure policy.
- Context collection, weather inputs, and history/weather comparisons.
- Public dataset terms, training and holdouts, primary metrics, and the rule for declaring a useful gain.
- Compute budget, model-serving boundary, and pilot delivery.
- Review of the complete design, written specification, and executable implementation plan before model implementation.

The next interview question concerns participant commitment. Suggested schedules are proposals until Ori chooses one; no statistical power is claimed from a proposed schedule.

## Related records

- [Domain glossary](../../GLOSSARY.md)
- [Immediate-appeal benchmark target](../adr/0001-benchmark-immediate-meal-appeal.md)
- [Single-meal response protocol](../adr/0002-collect-meal-appeal-individually.md)
- [Research shortlist and benchmark candidates](../research/recommendation-engine/benchmark-shortlist.md)
