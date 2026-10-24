# 04. Temporal sequence memory: familiar meals at better moments

**Thesis:** Keep durable taste separate from temporary exposure fatigue so the next card responds to the order and timing of this session, while familiar favorites can return later.

The distinct contribution is state over a sequence: two people with the same likes can receive different next meals because one just saw ramen repeatedly. This addresses repetition and possible satiation, rather than making every recommendation novel.

## Evidence and hypothesis

Kapoor and colleagues model gaps between repeated music consumption using latent engagement and boredom states. Their work supports investigating when familiar items become timely again; it does not establish that repeated meal cards cause boredom. [Just in Time Recommendations, 2015](https://www.researchgate.net/publication/282187462_Just_in_Time_Recommendations_Modeling_the_Dynamics_of_Boredom_in_Activity_Streams)

Quadrana and colleagues separate session state from information carried across sessions in a hierarchical recurrent model, evaluated on job and video interactions. That is evidence for distinguishing the two timescales, not a reason to introduce a recurrent network into MealRec. [Personalizing Session-based Recommendations, 2017](https://arxiv.org/html/1706.04148)

RepeatNet explicitly separates returning to a previously encountered item from selecting a new item, with experiments on shopping and music datasets. Repetition can therefore be a legitimate behavior to model, rather than an error to eliminate permanently. [RepeatNet, 2019](https://arxiv.org/html/1812.02646)

There is an important competing explanation: Benson and colleagues reproduce some apparent boredom patterns with a combinatorial consumption model that contains no psychological boredom mechanism. A long gap or rejection does not identify a user's mental state. [Modeling User Consumption Sequences, 2016](https://www.cs.cornell.edu/~arb/papers/sequences-www2016.pdf)

**MealRec hypothesis:** modest exposure memory will reduce tedious repetition without suppressing useful familiar meals. Whether feature-level satiation exists here remains an open empirical question. Card viewing, meal choice, and eating require separate evidence.

## Fit with the current repository

The [core engine](../../../packages/core/src/recommender.ts) gives recent exact likes a positive bonus and samples from its five highest scorers. It has no exposure input. The [home page](../../../meal-rec/src/app/page.tsx) advances after every reaction; “Get Another Recommendation” advances without recording a skip. Consequently, repeatedly displayed favorites can remain attractive to the scorer without the engine knowing they were just shown.

The [feedback schema](../../../packages/database/src/models/feedback.ts) stores one record per user and meal. The [feedback route](../../../meal-rec/src/app/api/feedback/route.ts) overwrites that record's type and timestamp, while [retrieval](../../../packages/database/src/feedback-helpers.ts) uses a 14-day window. These records cannot reconstruct repeated interactions or a consumption sequence. Guests' reactions are not saved. Also, the [recommendation route](../../../meal-rec/src/app/api/recommend/route.ts) samples 50 meals before filtering: an absent alternative may reflect candidate omission rather than temporal policy quality.

## Proposed mechanism

Start with an interpretable session policy, not sequence-model training:

1. Apply every hard ingredient/allergen exclusion before temporal ranking. Preserve current exclusions; do not imply that the limited alias matching is comprehensive food-safety validation.
2. Maintain `L(m)`, the ordinary taste score from prior-session evidence, separately from this session's events. Initially this can be the existing feedback-based score, explicitly a limited-history approximation rather than a learned lifetime profile.
3. Track actual displayed meal IDs and times. A server response alone is insufficient if the browser never renders it. Record reactions and no-reaction advances as different event types.
4. Avoid the immediately preceding meal when an alternative passes the same hard filters. If only that meal remains, explain the limited pool and allow an explicit repeat or stop; never relax an exclusion.
5. Test a small, capped recency penalty for repeated coarse attributes, then let it decay or reset when a new session starts.

An illustrative score for eligible meals is:

`score(m,t) = L(m) + a*sessionAffinity(m) - b*exposureLoad(m,t)`

`exposureLoad(m,t) = sum(exp(-(t-time(e))/tau) * similarity(m, meal(e)))`

Here `similarity` initially uses existing cuisine, spice, and heaviness fields. `sessionAffinity` comes only from explicit reactions; a no-reaction advance contributes exposure, not dislike. Cap both adjustments so a few views cannot erase durable preference. The decay constant and coefficients are experiment settings, not established satiation rates.

First test exact-repeat suppression with the attribute term disabled. Only test the attribute term if users still report repetitive suggestions. Consumption-based cooldowns would require a separate explicit “ate this” event and a later study. They cannot be inferred from likes.

## Hypothetical meal sequence

Suppose a person likes Beef Ramen, tolerates spice level 2, and excludes shellfish. They see Beef Ramen, like it, and request the next card. A memoryless taste scorer can return Beef Ramen immediately. The initial session policy blocks that immediate repeat while allowing eligible alternatives such as Pho Bo or Congee to compete. A subsequent advance without a reaction records exposure, not a new dislike of noodles.

On another day, the exposure state resets and Beef Ramen can return. If they explicitly ask to revisit it, that overrides the presentation cooldown, while shellfish exclusions still remove Tom Yum Soup. Names and attributes come from the [seed catalog](../../../data/meals.json); the user's history and behavior are illustrative, not observed results.

## Existing and required data

Existing inputs cover meal attributes, quiz exclusions, spice tolerance, and latest authenticated reactions. Required observations are session ID, displayed-card ID, meal ID, display time, event order, advance reason, and reaction attribution. Deduplicate retries and distinguish offline redisplay from a newly selected card. Any guest memory should have a stated browser-local or consented persistence scope.

A stable cross-session taste model needs a retention decision and richer history; the current 14-day retrieval is not that model. Record policy version and candidate pool for diagnosis. Confirmed choice and consumption remain optional, separate additions.

## Smallest falsifiable experiment

Run a counterbalanced prototype study, provisionally 24 consenting participants completing two comparable meal-discovery tasks, each capped at eight cards. This is a proposed recruitment target, not existing traffic. Clone initial prior-session preference inputs and clear exposure state before each condition. Use matched, independent meal sets from the fully enumerated eligible seed catalog, balancing their assignment across conditions to avoid both model carryover and the API's random-candidate confound.

**Control:** current scoring and weighted selection, including the same surprise setting. **Treatment:** identical policy plus exact-repeat memory. Add the attribute penalty only in a subsequent comparison against exact-repeat suppression. A prototype can collect these observations without deploying an engine.

The primary outcome is sessions ending in an explicit “I would choose this now” shortlist within eight cards. Report card count, repeated-meal exposures, and a short repetitiveness rating. Reactions remain secondary preference signals. Ask whether a suppressed favorite was missed; unique-card count alone rewards novelty without usefulness.

**Provisional gates:** proceed if shortlist completion improves by at least 10 percentage points, or median cards-to-shortlist falls by one with completion no worse than 5 points below control. Require zero known hard-filter violations and lower reported repetitiveness. Reject attribute penalties if they add no benefit over exact-repeat memory or repeatedly hide requested favorites. Report participant-level uncertainty; an inconclusive pilot calls for another study, not a success claim. A later powered trial would be needed for production conclusions.

## Costs, failures, and readiness

Wrong session boundaries can carry yesterday's fatigue into today's decision. Cuisine equality is a crude repetition proxy; repeated soup may be desired, and two different cuisines may feel identical. Small eligible pools make broad cooldowns harmful. Missing display events, multiple tabs, and offline fallback can corrupt state. These are reasons to start with exact exposure memory and measure complaints before estimating satiation.

**Readiness:** suitable for a small instrumented prototype; learned timing models are premature. Draft 01 estimates taste, while this draft changes its short-term timing. Draft 05 controls unfamiliarity and interest coverage even without fatigue. Draft 02 explores uncertainty, and draft 10 asks what a rejection meant. None substitutes for an ordered exposure history.

## Primary sources read

- Kapoor et al., linked above: temporal revisit modeling; original full text read, including its music-data setting.
- Quadrana et al., linked above: separate within-session and cross-session representations.
- Ren et al., linked above: explicit repeat versus new-item recommendation mechanisms.
- Benson et al., linked above: sequence evidence and a nonpsychological explanation for apparent boredom patterns.
