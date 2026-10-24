# 05. Calibrated serendipity: give the surprise slider a meaning

**Thesis:** Make `surpriseFactor` control the share of personally unfamiliar, taste-relevant discoveries, while preserving the user's smaller interests and checking whether the surprise was welcome.

The unique contribution is an explicit delivery objective: useful novelty and relevant diversity. It remains meaningful even if the engine knows a person's tastes perfectly; it does not select uncertain meals to learn a model.

## Evidence and hypothesis

Steck's calibrated recommendation method balances relevance with a match between the category distribution in recommendations and the user's demonstrated interests. His movie experiments illustrate how lesser interests can otherwise disappear. Calibration concerns representation of interests, not predictive-probability calibration or maximal variety. [Calibrated Recommendations, 2018](https://www.researchgate.net/publication/327949770_Calibrated_recommendations)

Vargas and Castells define novelty/diversity metrics that account for relevance and rank. Their experiments show why a random recommender can look good on pure novelty metrics but poorly serve the person. This motivates measuring useful discovery rather than counting different cuisines alone. [Rank and Relevance in Novelty and Diversity Metrics, 2011](https://castells.github.io/papers/recsys2011.pdf)

Adamopoulos and Tuzhilin formalize unexpectedness relative to a user's expectations, and combine it with utility. They distinguish an item being distant from expectations from an item being valuable. Their evidence uses movie/book datasets and proxies, not verified pleasant food surprises. [On Unexpectedness in Recommender Systems, NYU working paper, 2013](https://archive.nyu.edu/bitstream/2451/31832/2/Adamopoulos_13.03.pdf)

**MealRec hypothesis:** a measurable familiarity target with a taste-quality floor will make the slider more predictable and increase welcome discoveries. A cuisine the engine has not seen in feedback is not necessarily new to the person. Nor does an unfamiliar meal become serendipitous merely because a scorer assigns it a high number.

## Fit with the current repository

The [quiz](../../../meal-rec/src/app/quiz/page.tsx) promises a range from familiar foods to “totally surprise me.” The [core engine](../../../packages/core/src/recommender.ts) instead multiplies each score by random noise scaled by the slider, then samples from the top five. This changes selection variability without measuring familiarity or pleasant surprise.

The [meal model](../../../packages/database/src/models/meal.ts) has cuisine, ingredients, flavor tags, spice, and heaviness. The [seed catalog](../../../data/meals.json) contains 91 meals across 40 cuisine labels, but these labels are not 40 equally meaningful taste categories. The current scorer uses coarse attribute similarity, not flavor tags. The [feedback route](../../../meal-rec/src/app/api/feedback/route.ts) overwrites latest reactions; the [home page](../../../meal-rec/src/app/page.tsx) records no exposures or familiarity. Production familiarity cannot be reconstructed from these inputs.

## Proposed mechanism

Separate four quantities before combining them:

- **Relevance:** the existing taste score, initially treated as an ordering rather than a probability of enjoyment.
- **Familiarity:** the person explicitly recognizes a dish; “have tried” is a separate answer. Missing input means unknown, not unfamiliar.
- **Unexpectedness:** distance from their stated expected/favorite meals, using a small, inspectable feature comparison.
- **Serendipity:** the person's later judgment that a discovery was both unexpected and worthwhile.

Apply hard exclusions first and keep them hard at every slider setting. Existing string/alias filtering has limited coverage; empty allergen metadata does not establish that a meal is safe. Novelty never overrides a known conflict.

For the first experiment, retain only a reasonable taste-score band, then use `q = surpriseFactor / 10` as a provisional target share of unfamiliar discoveries. It is a preference target, subject to eligible supply, rather than permission to return irrelevant meals. At zero, novel items receive no discovery preference; at ten, unfamiliar items are preferred whenever the quality floor permits. Display an honest limitation if the requested level cannot be met.

Within that band, choose from the familiar or unfamiliar bucket according to its deficit against `q` among cards actually displayed. Credit an unfamiliar meal only on its first display in the measurement block. A repeated untried dish is not another discovery. Keep unanswered familiarity separate and report its coverage.

Among similarly relevant candidates, favor coverage of the person's demonstrated interests rather than uniform cuisine counts. For example, a smaller stated interest in tangy food should not disappear behind a dominant preference for rich food. A calibration penalty can compare the delivered attribute proportions with an explicitly reviewed interest profile; zero-history users fall back to their quiz and declared favorites. Do not infer a broad cuisine distribution from one like.

This is a proposal to adapt category calibration to a one-card interface. Only reached cards count; an unseen planned list does not earn diversity credit. The discovery target can include unfamiliar dishes within a favorite cuisine. Relevant diversity remains a secondary tie-breaker, not a requirement to traverse every category.

## Hypothetical meal scenario

Suppose someone likes Bibimbap and Nasi Goreng, wants spice level 2, and excludes nuts. They recognize both meals but declare Jollof Rice unfamiliar. At a low surprise setting, familiar rice dishes can dominate. At a higher setting, Jollof Rice is a plausible discovery because the seed entry retains rice, chicken, moderate spice, and medium heaviness while changing cuisine and flavor emphasis.

Satay remains excluded because its metadata includes peanut sauce and peanuts, however novel or relevant it appears. If the person recognizes Jollof Rice already, it cannot count as an unfamiliar discovery for them. If they see it and report “unexpected but not appealing,” the experiment records novelty without serendipity. These are hypothetical inputs, not measured preferences or outcomes.

## Existing and required data

Current quiz and meal fields provide initial exclusions and taste features. Required study inputs are explicit dish familiarity, a few favorites or expected meals, and a reviewed statement of smaller interests. Required events are actual exposures, reaction attribution, slider value, policy version, and candidate pool. Add a lightweight separate response for “unexpected” and “worth considering now”; neither is consumption.

Sparse ingredient and flavor labels limit interpretable distances. Begin with inspected catalog features, not an unvalidated embedding or popularity-based novelty estimate. The [API's 50-meal random sample](../../../meal-rec/src/app/api/recommend/route.ts) can omit a whole novelty bucket, so candidate availability must be recorded and controlled in research.

## Smallest falsifiable experiment

Provisionally recruit 40 consenting participants, randomly assigned across two policies and two slider settings. Each completes one task capped at ten cards: seeing meals changes familiarity, so a policy crossover would contaminate the comparison. Preclassify familiarity by name, collect favorites, and compare current noise with familiarity targeting. Freeze initial taste inputs; balance eligible candidate sets and presentation across assignments. Preclassification itself may alter expectations, so measure that limitation in debriefing. This is proposed study design, not existing usage.

The primary metric is **welcome-discovery rate**: first displays of previously declared unfamiliar meals rated both unexpected and worth considering, divided by all displayed cards. Also report unfamiliarity share, explicit shortlisting, and how closely relevant interest coverage matches the reviewed profile. Analyze uncertainty by participant; repeated cards from one person are not independent observations.

**Provisional gates:** high versus low settings should increase unfamiliarity share by at least 20 percentage points when both buckets have adequate supply. Treatment should improve welcome-discovery rate by at least 10 points over noise at the high setting, with shortlisting no more than 5 points worse. Require zero known hard-exclusion violations. Reject if only entropy or unfamiliarity improves, if users find the slider less predictable, or if useful minority interests disappear. Insufficient precision is inconclusive. Choose a powered follow-up size after observing pilot variation; do not convert the pilot target into a statistical guarantee.

## Costs, failures, and readiness

People may recognize a dish name but dislike its actual recipe; catalog descriptions are not verified recipes. Familiarity questions add burden and become stale after discovery. Calibration can preserve narrow historical exposure rather than true taste, so users need to review the target profile. Sparse eligible supply makes exact proportions impossible. Strong novelty objectives can reward disliked obscurities unless usefulness is measured directly.

**Readiness:** prototype-ready after explicit familiarity collection; production optimization needs exposure/outcome logging. Draft 04 models temporal fatigue and repeat timing, whereas this objective is familiarity and interest coverage without a time-decay assumption. Draft 02 studies epistemic exploration; draft 03 chooses informative questions. This draft does neither, and a neural model is unnecessary for its first test.

## Primary sources read

- Steck, linked above: category calibration and relevance tradeoffs; original full text read via ResearchGate.
- Vargas and Castells, linked above: relevance-aware novelty/diversity evaluation and rank effects.
- Adamopoulos and Tuzhilin, linked above: expectation-relative unexpectedness, utility, and the limits of offline proxies.
