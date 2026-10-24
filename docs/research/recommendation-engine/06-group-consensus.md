# 06. Group consensus: an acceptable meal for everyone

**Thesis:** For an explicitly opted-in shared meal session, intersect every participant's hard constraints, protect individual vetoes, then balance enjoyment and repeated decision fairness.

This is a **conditional product expansion**, not a necessary replacement for today's individual recommender. Its distinct objective is agreement among several people who will share a decision. Recommend this direction only if Ori wants households or small dining groups in the product.

## Evidence and hypothesis

Masthoff compares ways to combine individual preferences, including average, least misery, and average without misery. Her television experiments find several plausible strategies and attention to fairness; they do not identify one universally correct social objective. [Group Modeling, 2004](https://www.researchgate.net/publication/220116386_Group_Modeling_Selecting_a_Sequence_of_Television_Items_to_Suit_a_Group_of_Viewers)

PolyLens demonstrates a working group movie recommender and treats group membership, social value functions, and preference disclosure as separate design choices. Its experience supports taking consent and privacy seriously, but does not imply that people will share dietary constraints or enjoy the same group interface. [PolyLens: A Recommender System for Groups of Users](https://files.grouplens.org/papers/poly-camera-final.pdf)

Stratigi and colleagues define satisfaction relative to individual recommendations, track disagreement across rounds, and adapt aggregation between average and least misery. Their evaluation uses MovieLens and constructed group scenarios, not observed shared meal negotiations. [Fair Sequential Group Recommendations, 2020](https://homepages.tuni.fi/konstantinos.stefanidis/docs/sac20.pdf)

**MealRec hypothesis:** a transparent acceptability floor plus modest priority for repeatedly underserved members will produce more acceptable decisions than averaging preferences alone. This is a product and social-policy hypothesis; predicted utility is not consent, and low dispersion alone can mean everyone is equally unhappy.

## Fit with the current repository

The [home page](../../../meal-rec/src/app/page.tsx) presents one card to one browser. The [recommendation route](../../../meal-rec/src/app/api/recommend/route.ts) uses the authenticated session's user ID, one quiz, and one feedback history. There is no group, membership, room, shared choice, or per-participant acceptance model. The [feedback model](../../../packages/database/src/models/feedback.ts) stores the latest individual reaction per meal, not a negotiated group outcome.

The [quiz](../../../meal-rec/src/app/quiz/page.tsx) supplies ingredients to avoid, spice tolerance, and surprise preference. These could initialize each person's inputs but cannot be merged by averaging exclusions or assuming one browser represents everyone. The [meal schema](../../../packages/database/src/models/meal.ts) has basic ingredient/allergen metadata; it lacks preparation, venue availability, and verified recipe detail. Shared choice cannot establish that a real dish will meet all requirements.

## Proposed mechanism

Use a small group session with a fixed, confirmed membership list. Each person explicitly joins and supplies current constraints. Personal histories remain separate. Group members need not see who excluded an ingredient or another person's private likes; show that a candidate fails a group requirement without naming the person.

First form the common feasible set:

`F = intersection(eligibleMeals(participant))`

Every hard ingredient/allergen exclusion remains hard. Existing string matching is a limited initial gate, not comprehensive allergen validation. Unknown metadata cannot be converted into a safety claim. If the intersection is empty, stop with an honest explanation and let participants revise their own inputs or choose another arrangement. The host cannot silently remove someone else's exclusion.

For the smallest study, ask each person to privately rate a short feasible candidate set using the same anchored scale: 0 = cannot accept this meal now, 1 = acceptable, 2 = appealing, 3 = enthusiastic. A zero is an explicit current-meal veto; it is not automatically a permanent dislike or an allergy. Missing responses mean unresolved, not approval.

Remove vetoed candidates, then rank the remainder. With no group history, use equal-weight average preference above that acceptability floor. For recurring groups, compute each member's cumulative satisfaction from **confirmed group choices**, normalized against their best acceptable candidate in each round. Give a capped increase in ranking weight to members with lower cumulative satisfaction:

`weight(person) = 1 + lambda * (1 - cumulativeSatisfaction(person))`

`groupScore(meal) = weightedMean(individualPreference(meal))`

This is a proposed modest turn-taking mechanism, not a claim to reproduce the cited algorithm. A member who has repeatedly accepted compromises gains priority among mutually acceptable options. Hard constraints and current vetoes never become negotiable fairness credits. No debt is accrued merely because a card was shown. For a one-off group, omit historical weighting entirely.

Finally, ask everyone to confirm the proposed choice. A predicted positive score cannot provide their confirmation. If a person leaves, membership and the constraints are recomputed explicitly; if someone joins, regenerate the proposal before confirming it.

## Hypothetical meal negotiation

Three people plan dinner. One excludes dairy, so Chicken Tikka Masala is removed before voting because the [seed entry](../../../data/meals.json) lists dairy. Consider these illustrative current-meal ratings for candidates that pass the known metadata exclusions:

| Candidate | Alex | Bea | Casey | Average |
| --- | ---: | ---: | ---: | ---: |
| Feijoada | 3 | 3 | 0 | 2.00 |
| Falafel Wrap | 1 | 1 | 3 | 1.67 |
| Congee | 2 | 2 | 1 | 1.67 |

Plain averaging favors Feijoada while Casey cannot accept it. The floor removes it. Falafel Wrap and Congee tie under equal weights; if Casey has repeatedly compromised in confirmed earlier decisions, the bounded fairness weight can favor Falafel Wrap. Everyone still confirms. These scores and histories are hypothetical, and passing seed metadata is not verification of a real recipe's safety.

## Existing and required data

Existing meal attributes and individual quizzes provide only initial inputs. Required additions are explicit membership/consent, per-person constraints, session-specific ratings/vetoes, unresolved-response state, proposal exposure, and individual confirmation. Recurring fairness additionally needs group identity, stable membership history, confirmed choices, and each participant's own satisfaction reports. Never write a group choice into every member's personal “like” history.

Record enough to explain a ranking without revealing private reasons. Establish who can see, revise, and delete session data. Guest participation would need a deliberate identity and consent design; today's guest feedback rejection does not supply it.

## Smallest falsifiable experiment

Start with a facilitated prototype, provisionally 12 real groups of two to four consenting adults. Use meal-selection tasks with inspectable catalog metadata; the experiment need not involve eating. First verify that the veto floor blocks cases like the table and that an empty intersection remains empty. These checks validate mechanics, not product usefulness.

For recurring-group testing, compare equal-weight averaging with bounded fairness weighting across three real group decisions per condition, counterbalancing order. Clone initial preference/fairness state and use independent comparable task sets so treatment history cannot leak into control. Both conditions preserve identical hard exclusions, explicit vetoes, and final individual confirmation. This isolates historical fairness; human memory remains a crossover limitation.

Measure the proportion of tasks ending in unanimous explicit acceptance, time to agreement, and each person's privately reported satisfaction. Track the least satisfied member, cumulative satisfaction gap, and whether the same person repeatedly compromises. Report group-level uncertainty; three decisions do not constitute independent new groups.

**Provisional gates:** proceed if unanimous acceptance improves by at least 10 percentage points, or the cumulative satisfaction gap falls by 20% with acceptance no more than 5 points worse and median decision time no more than 20% longer. Require zero known constraint/veto violations and no deterioration in the least satisfied member's reported satisfaction. Reject if only average satisfaction improves, if privacy or participation burden prevents completion, or if members regard weighting as unfair. Sparse or noisy evidence remains inconclusive; estimate a follow-up study size from pilot variation.

## Costs, failures, and readiness

Vetoes can stall decisions or be used strategically. Rating habits differ, so arithmetic means are conveniences rather than interpersonal utility measurements. Social pressure can make apparent unanimity unreliable; private responses help but do not prove honest consent. Membership changes invalidate accumulated fairness comparisons. A long-term compensation policy is inappropriate for an accidental one-off group. More participants can sharply shrink the feasible set.

**Readiness:** research prototype only, conditional on product demand. Draft 01 could later supply individual preference estimates; it cannot decide the social objective. Draft 04 tracks one person's exposure timing, whereas this history concerns whose confirmed choices were served. Draft 08 supplies practical feasibility inputs. Group fairness is neither cross-user collaborative taste transfer in draft 09 nor an excuse to override hard requirements.

## Primary sources read

- Masthoff, linked above: aggregation alternatives, acceptability, and human judgments; author-uploaded full text read.
- O'Connor et al., linked above: a deployed group prototype and explicit membership/disclosure choices.
- Stratigi et al., linked above: satisfaction and disagreement across rounds; MovieLens-based evidence limits.
