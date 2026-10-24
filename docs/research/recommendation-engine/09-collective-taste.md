# 09 — Collective taste with a strict sparsity gate

**Thesis:** Add a small, support-weighted collaborative signal to the individual content scorer only when enough other users have rated overlapping meals.

The unique information source is other people's reactions. It can discover a connection that cuisine, ingredients, and flavor tags fail to describe, while falling back completely to content when the shared evidence is weak.

## Evidence and hypothesis

Sarwar and colleagues derive item-based recommendations from relationships in a user–item rating matrix, including similarities between co-rated items and weighted predictions. This establishes a concrete collaborative mechanism; their movie-rating experiments do not establish its value for MealRec's short-lived, three-way reactions. [Item-based collaborative filtering paper](https://files.grouplens.org/papers/www10_sarwar.pdf)

Hu, Koren, and Volinsky distinguish explicit preferences from implicit observations and distinguish confidence from preference strength. A missing interaction may mean lack of exposure rather than dislike. MealRec's like/dislike buttons are explicit labels; they should not be turned into consumption counts, and absent ratings should remain unobserved. [Implicit-feedback paper](https://yifanhu.net/PUB/cf.pdf)

Schnabel and colleagues show how selection-biased observed ratings can mislead ordinary offline evaluation and develop propensity-based evaluation under explicit assumptions. MealRec has no impression or propensity history, so this paper supports caution and better experimental collection, not an assertion that historical evaluation can already be debiased. [Recommendations as Treatments](https://proceedings.mlr.press/v48/schnabel16.html)

**App-specific hypothesis:** sufficiently supported co-reactions reveal useful taste relationships beyond the existing attributes. Population size, overlap, and reaction density are unknown; the hypothesis may be untestable with present live data.

## Current repository fit

The [feedback schema](../../../packages/database/src/models/feedback.ts) stores user, meal, type, and timestamp with one unique user/meal record. The [API](../../../meal-rec/src/app/api/feedback/route.ts) overwrites that record on another reaction and rejects guests. The [helper](../../../packages/database/src/feedback-helpers.ts) retrieves the last 14 days for a user.

The [core](../../../packages/core/src/recommender.ts) uses only that individual's recent labels and coarse meal attributes. `interested` currently has no score effect. The [recommendation route](../../../meal-rec/src/app/api/recommend/route.ts) has no collective lookup. The 91 meals in [seed data](../../../data/meals.json) say nothing about how many people have reacted, or whether any meal pair has enough overlap.

A current snapshot could support an overlap audit. It cannot reconstruct previous reaction states after overwrites or prove that an unrated meal was shown. Any prospective evaluation must preserve its own frozen training snapshot and subsequent study events.

## Concrete mechanism

Begin with item neighborhoods, not latent factors. Encode observed likes as +1 and dislikes as −1. Keep `interested` separate and initially exclude it from similarity estimation. Never fill missing cells with dislike.

Estimate regularized global, user, and item baselines from training labels to reduce broad positivity and popularity effects. Let `d(u,i)` be the observed label minus its fitted baseline. For two meals, compute residual cosine similarity over users who rated both. Set similarity to zero if overlap or residual variation is insufficient.

Shrink each supported relationship toward zero:

`w(i,j) = n(i,j) / (n(i,j) + λ) × residualSimilarity(i,j)`.

Here `n` counts distinct other co-raters, not repeated reactions. A provisional overlap floor of 10 and `λ = 20` are starting hypotheses, not validated settings. Tune them only within training/validation data. Exclude the target user's evidence when constructing the relationship used to predict that user's held-out label.

For candidate `i`, use the user's previously rated neighboring meals: `H(u,i) = clip(Σj w(i,j)d(u,j) / (η + Σj |w(i,j)|), −1, 1)`. The positive denominator regularizer, provisionally `η = 1`, prevents normalization from canceling shrinkage when evidence is weak. Add this to the existing score with a provisional maximum magnitude of 0.2. Exact meal reactions remain stronger. Zero supported neighbors means exactly zero collaborative contribution, including for guests, new users, and new meals.

Hard ingredient exclusions run first and remain hard. No amount of neighborhood support, popularity, or apparent similarity restores an excluded meal. Missing composition does not become safe because other users liked it. Keep any additional session requirements equally outside this soft score.

## Hypothetical worked example

Suppose Ori likes Pho Bo and Shakshuka. Other consenting users who rated both those meals and an unfamiliar third meal show a consistent positive residual association, after broad liking tendencies are accounted for. That third meal could receive a modest bonus even if its cuisine and tags differ from Ori's previous choices.

Two enthusiastic people are insufficient: the gate returns the existing content ranking. Likewise, a popular dish does not get a personalized bonus merely because many people like it; the neighborhood must connect to Ori's own reactions.

If the third meal conflicts with Ori's excluded soy, it is removed before the collaborative score exists. An egg dislike applies only as recorded feedback unless Ori explicitly adds eggs as a hard exclusion. These are hypothetical patterns; no such population or correlation has been measured.

## Existing data and required evidence

Existing signed-in latest labels and meal IDs are the raw ingredients for the audit. Required evidence includes distinct co-rater counts, supported-neighbor coverage, label distributions, and how coverage changes under the existing 14-day window. Do not expand retention automatically to make the method work.

A research dataset needs consented cross-user use, pseudonymous identifiers, frozen training versions, and prospective exposure/reaction events. Access to raw neighbor identities should not be exposed in explanations. Small cohorts also need protection against one person's labels becoming recognizable. Deletion must remove the person's contributions when aggregates are rebuilt.

Explanation wording should describe aggregate evidence without invented counts or identity claims. “People like you” is unjustified when the actual mechanism only knows a few item co-ratings.

## Smallest falsifiable experiment

**First, a readiness audit:** provisionally require 70% of intended signed-in trial users to have at least five explicit labels and at least three eligible candidates connected through qualifying item relationships. Check that support is distributed across users rather than dominated by a few accounts. If this fails, defer collaborative work; no amount of model sophistication creates overlap.

If it passes, compare three frozen policies: current individual scorer, individual scorer plus smoothed item popularity, and the shrunk neighborhood hybrid. Use identical hard filters, candidate pools, and randomness. The popularity control checks whether apparent collaborative improvement is just recommending common favorites.

Collect fresh, consenting judgments on a sampled eligible evaluation pool with recorded assignment probabilities, independently of which policy prefers each item. Hold out the target person's evaluation labels and all future data. Every scorer ranks the same fully judged held-out subset per person. Compare NDCG@5, with relevance 1 for likes and 0 for dislikes, and top-five dislike rate. Unjudged meals and abstentions remain unknown. Report participants with fewer than five judged candidates or no relevant judgments separately, alongside evaluation coverage and supported versus fallback cases. Historical latest-label holdouts can be a diagnostic but cannot substitute for this controlled evidence.

**Provisional advancement gates:** at least 5% relative NDCG@5 improvement over both controls, no more than a 5 percentage-point deterioration for the lowest-support quartile, and zero hard-exclusion violations. Include participant-level uncertainty; an interval including no improvement is inconclusive.

**Reject or defer:** reject if popularity matches the hybrid, if gains disappear under independent judgments, or if a few accounts dominate the relationships. Defer if the overlap gate fails or collecting enough consented evidence costs more than the likely benefit. Do not report a supported-subset gain as an all-user gain.

## Costs, failures, and readiness

Popularity feedback loops, coordinated ratings, context-dependent dislikes, and short retention can destabilize similarities. Shrinkage limits influence; it does not remove those biases. Operational costs include aggregate rebuilds, deletion handling, and monitoring supported coverage.

Readiness is **unknown and conditional**, with an audit before model investment. This differs from **01**, which learns from one person's attributes, and **07**, which supplies curated semantic relationships. It is not **06** group consensus: other users inform prediction rather than negotiate a shared meal. It can later feed **02**, but adaptive exploration is unnecessary to test whether collective information helps.

## Sources actually read

- [Sarwar et al. (2001)](https://files.grouplens.org/papers/www10_sarwar.pdf): item relationships from co-ratings and weighted prediction.
- [Hu, Koren, and Volinsky (2008)](https://yifanhu.net/PUB/cf.pdf): explicit/implicit distinction, confidence, and missing observations.
- [Schnabel et al. (2016)](https://proceedings.mlr.press/v48/schnabel16.html): selection bias, evaluation assumptions, and controlled assignment.
