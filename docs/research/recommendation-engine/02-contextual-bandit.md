# 02 — A contextual bandit with accountable exploration

**Thesis:** Learn which eligible meal to present through a small, controlled exploration policy whose selection probabilities and attributed outcomes are logged; the distinctive contribution is an evaluable decision policy, rather than another taste score.

## Evidence and hypothesis

Li and colleagues formulate recommendation as sequential choices using context and feedback observed only for the selected item. Their randomized-log evaluator illustrates why ordinary recommendation history is insufficient for reliable policy comparison. Their news results do not predict MealRec's benefit or data requirements. [Li et al., 2010](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/p661.pdf)

Doubly robust evaluation combines a reward predictor with an importance-weighted correction. Its error depends on the quality of those components; small logging probabilities can create high variance. It does not make missing exposure information harmless. [Dudík, Langford, and Li, 2011](https://icml.cc/2011/papers/554_icmlpaper.pdf)

**MealRec hypothesis:** A bounded amount of exploration can discover useful meal-feature preferences that greedy selection repeatedly misses, eventually improving explicit positive reactions enough to repay early exploration cost. Whether MealRec has sufficient repeat use to reach that point is unknown.

## Fit to the current repository

The [core](../../../packages/core/src/recommender.ts) already randomizes through surprise noise and weighted sampling from its best five. Randomness alone is not a logged learning policy. The [API](../../../meal-rec/src/app/api/recommend/route.ts) first samples 50 meals, then filters and scores. Neither stage records candidate membership, policy version, or a final action probability.

The [home page](../../../meal-rec/src/app/page.tsx) requests another card after every reaction; its separate “Get Another Recommendation” button records nothing. The [feedback endpoint](../../../meal-rec/src/app/api/feedback/route.ts) overwrites the latest user/meal reaction. No impression links an outcome to the decision that caused it. Guest reactions return 401, so guest policy learning is not currently available.

Ingredient avoidances remain hard exclusions defining eligibility before the policy sees actions. Exploration never resurrects an excluded meal. Existing aliases are limited; an empty allergen list is not proof of allergen-free food. Neither exploration nor a high predicted reward repairs that metadata boundary.

## Proposed mechanism

Begin with a simple per-person content reward predictor using quiz/meal features. Use the same predictor family, initialization, and update rule in both arms; fitted weights will differ with their feedback histories. No latent user-neighbor system is required. At each decision, build eligible set `A`, compute predicted reward for each meal, and break any best-score tie deterministically.

Use a provisional exploration fraction of 0.10:

```text
best = highest predicted-reward meal in A
q(a | context, A) = 0.90 × indicator(a = best) + 0.10 / size(A)
sample one meal using q; log q(selected meal) before returning it
```

This epsilon-greedy mixture provides an exactly computable action probability. Official Vowpal Wabbit documentation describes the same mixture and contextual-bandit examples carrying action, cost, probability, and action-dependent features. It is a methodological reference, not a dependency recommendation. [Vowpal Wabbit documentation](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html)

The exploration fraction is a research parameter, not the existing surprise slider. A desire for unfamiliar food and the information needed to improve a model are different objectives; draft 05 owns the former.

For the pilot, use a frozen, reviewed catalog and the same eligibility construction in both arms. If production retains the upstream random-50 retrieval, record its realized candidate set and retrieval version. Then off-policy evaluation covers alternative selectors on those same sets, not a hypothetical selector over meals retrieval omitted. Evaluating different retrieval policies requires their own support/accounting.

## Reward and attribution contract

Use one narrow initial reward: a successfully persisted **like** during a visible decision window. The first like, interested, dislike, another-card action, or two minutes of confirmed foreground visibility closes the window. Like yields one; other observed closures yield zero for this positive-reaction objective. Interested and another-card are not thereby declared negative taste labels.

The server decision ID must accompany the render acknowledgement and resulting action. Deduplicate retries, retain the first qualifying terminal outcome, and never credit several reactions or a later replay to one decision. Keep pending or unobserved windows separate; missing telemetry is not a negative reward. Differential missingness invalidates a simple comparison until addressed. Offline fallback cards need an explicit replay flag and should be excluded from the first policy-learning experiment.

This rewards a UI event, not choosing, buying, cooking, or consuming food. Add an independently sampled yes/no end-session helpfulness question to check whether a tap improvement corresponds to a better experience. Do not silently redefine like as that answer.

## Hypothetical example

A person avoids shellfish and initially tends to like rich dishes. The model favors Chicken Tikka Masala, but eligible Fattoush sometimes appears through exploration. If Fattoush receives a like, the linked decision updates that person's predictor. If another card is requested, the logged event earns no like reward, without asserting a permanent dislike.

Tom Yum Soup stays outside the action set because its shellfish label conflicts with the avoidance. None of these reactions or preferences is an observed MealRec result.

## Existing and required data

Existing quiz values, meal attributes, session identity, and reaction types are usable context. Weather defaults to normal and the browser sends no weather value, so do not claim weather adaptation without a real observation channel.

Required additions are append-only decision/render/outcome events; candidate IDs and metadata version; context available **at decision time**; selected meal and exact probability; policy/model versions; timestamps; experiment assignment; and visible-window state. Preserve historical events rather than reusing the unique latest-feedback row. Logging only the selected action's probability is sufficient for basic importance weighting, while the full candidate distribution makes validation easier.

## Smallest falsifiable experiment

First run a prospective logging/A–A audit, with identical policies assigned to both labels. Require normalized distributions, selected actions inside the eligible set, reproducible probabilities, and idempotent outcome joins. No retrospective propensity estimates from the current latest-feedback table qualify.

Next compare epsilon-greedy with the same content predictor selected greedily, randomizing signed-in participants by user and updating each arm only from information available at that time. Use the current rule scorer as an additional matched-data ranking benchmark. Freeze exploration, reward definition, and update schedule before evaluation; estimate enrollment needs from measured baseline rates and repeat usage rather than seed count.

For a frozen target policy, evaluate prospectively logged decisions with inverse-propensity weighting and a cross-fitted doubly robust estimate:

```text
average[ sum_a target(a|x) × predicted_reward(x,a)
       + target(chosen|x)/logged_q × (reward - predicted_reward(x,chosen)) ]
```

The estimator and its model/probability correction follow [Dudík et al.](https://icml.cc/2011/papers/554_icmlpaper.pdf). Require positive logging support wherever the target acts, hold model training separate from evaluation, inspect maximum weights/effective sample size, and report any clipping and its bias. User histories and adaptation also require user-clustered uncertainty estimates; frozen-policy replay does not prove long-run learning performance.

**Provisional gates:** at least 99% complete decision/outcome joins; zero exclusion violations; off-policy effective sample size at least 20% of evaluation records; then at least 5% relative improvement in like-per-visible-decision with a 95% user-clustered interval excluding zero. Separately, require the dislike rate to increase by no more than two percentage points and the proportion reporting a helpful session to fall by no more than two points; assess both margins with uncertainty intervals. Reject deployment if logging/support fails or the adequately measured policy loses; wide intervals or too little repeat use mean “not established.”

## Costs, readiness, and boundaries

Uniform exploration can be unpleasant, and tiny probabilities across many meals can make evaluation unusably noisy. If users rarely return, an exploration investment may never repay its immediate cost. A simple content ranker may win.

This direction is **not ready for a learning rollout** until logging and reward attribution are trustworthy. Draft 01 estimates preferences; this draft decides what to expose while learning. Draft 03 asks deliberate comparison questions. Draft 04 owns longer session dynamics; a one-step bandit cannot claim to optimize those downstream effects.

## Sources read

- [Li et al. (2010)](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/p661.pdf): contextual recommendation and randomized-log evaluation.
- [Dudík et al. (2011)](https://icml.cc/2011/papers/554_icmlpaper.pdf): direct, propensity-weighted, and doubly robust evaluation.
- [Vowpal Wabbit official guide](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html): probability-bearing logs and epsilon-greedy action selection.
