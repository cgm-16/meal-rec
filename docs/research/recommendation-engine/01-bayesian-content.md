# 01 — A Bayesian model of one person's taste

**Thesis:** Replace fixed similarity bonuses with an interpretable, regularized model of an individual's preferences that reports how much the available evidence supports each prediction; its contribution is better estimation and honest cold-start confidence.

## Evidence and hypothesis

Bayesian logistic regression can use coefficient priors to stabilize estimates when a small set of observations perfectly separates likes from dislikes. Gelman and colleagues describe both normal and Student-t priors, including their behavior under separation. This supports regularization, not a claim that any particular prior will suit meals. [Gelman et al., 2008](https://sites.stat.columbia.edu/gelman/research/published/priors11.pdf)

A probability estimate and its uncertainty need evaluation. Strictly proper scoring rules, including logarithmic and Brier scores, assess probabilistic forecasts; calibration concerns agreement between predictions and observed frequencies. A concentrated posterior alone does not establish that agreement. [Gneiting and Raftery, 2007](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf)

**MealRec hypothesis:** A few broad feature preferences, strongly shrunk toward the quiz-based starting point, will generalize better than the current equal-weight cuisine/heaviness/spice similarity. Neither paper establishes this for MealRec, its sparse labels, or its manually authored catalog.

## Fit to the current repository

The [core scorer](../../../packages/core/src/recommender.ts) currently adds exact-meal feedback and a capped similarity bonus, then applies spice/weather adjustments and surprise noise. It has no learned coefficients or confidence estimates. The [meal schema](../../../packages/database/src/models/meal.ts) already supplies cuisine, heaviness, spiciness, ingredients, and flavor tags.

However, the [recommendation route](../../../meal-rec/src/app/api/recommend/route.ts) populates feedback with only cuisine/heaviness/spiciness, so richer feature learning needs meal metadata at training time. It samples 50 database meals before filtering. The [feedback route](../../../meal-rec/src/app/api/feedback/route.ts) and [unique feedback schema](../../../packages/database/src/models/feedback.ts) retain only the latest reaction per user/meal; the [retrieval helper](../../../packages/database/src/feedback-helpers.ts) uses a 14-day window. Guests currently contribute no saved labels.

The model must operate only on eligible meals. Ingredient avoidances remain hard exclusions before scoring; posterior confidence can never override them. Existing exact-string matching and limited aliases do not establish comprehensive allergen coverage.

## Proposed mechanism

Start with a fixed, small feature vocabulary: normalized heaviness, distance from the quiz spice preference, and a few sufficiently common flavor tags. Add cuisine only if validation justifies the additional sparse coefficients. Do not initially create a coefficient for every ingredient string or seed meal.

For one user, define `y=1` for like and `y=0` for dislike:

```text
P(y=1 | meal, beta) = sigmoid(intercept + beta · features(meal))
beta_j ~ Normal(prior_mean_j, prior_scale_j²)
posterior ∝ prior × likelihood of that user's evaluative reactions
prediction = average probability over posterior coefficient draws
```

This is an app-specific content model using the regularized regression structure described above. The predicted event is **like rather than dislike, conditional on giving one of those two evaluative responses**. “Interested,” unanswered cards, and requesting another card supply no binary taste label. Predicting consumption or unconditional like-per-exposure would require another observation model.

At zero reactions, use the stated spice preference as a modest prior direction and keep other taste effects near zero. Priors encode engineering assumptions, not measured population taste. Choose their scale by inspecting simulated probabilities across the actual eligible catalog: an ordinary starting profile should not confidently love or hate most meals. Prior and posterior predictive simulation are established checks for implausible model behavior. [Stan User's Guide](https://mc-stan.org/docs/stan-users-guide/posterior-predictive-checks.html)

After each new evaluative event, update the same user's posterior. Retain coefficient covariance: correlated features such as “creamy” and heaviness should not masquerade as independently established preferences. Evaluate approximation error against a more careful reference fit on the small pilot before trusting narrow intervals.

Rank eligible candidates by posterior mean probability. Keep the existing surprise setting fixed between experimental arms so it cannot explain a taste-model gain. Do not add an uncertainty bonus, Thompson sampling, or information-seeking presentations: those belong to draft 02. Confidence initially serves diagnostics and abstention from strong explanations.

## Hypothetical example

A person sets spice tolerance to two, then likes Hummus Bowl and dislikes Chicken Tikka Masala. Both contain the catalog tag “creamy,” while their heaviness differs. The model should not immediately conclude “dislikes creamy food.” With two observations, competing explanations remain plausible.

Fattoush could receive a promising mean prediction through its lighter/fresh features, accompanied by broad uncertainty. If the person avoids sesame, Hummus Bowl is excluded regardless of any positive prediction. These are illustrative possibilities, not fitted probabilities or observed outcomes.

## Existing and required data

Existing inputs are quiz answers, catalog attributes, authenticated identity, and latest reactions. A first exploratory fit can use those reactions, with explicit disclosure that earlier revisions are lost.

A credible evaluation additionally requires append-only reaction events, event times, metadata versions, the feature vocabulary/prior version, and the prediction recorded **before** its outcome. Store whether feedback was evaluative, interested, skipped, or unavailable; do not reconstruct unseen impressions. Exposure identity is useful for auditing selection, although this draft does not require bandit propensities to fit its initial conditional-response model. Guest learning needs an explicit session-storage/identity design before being promised.

## Smallest falsifiable experiment

Use a consenting panel, provisionally targeting 30 participants with 20 usable, individually rated eligible meals each. This is a recruitment target, not an estimate of existing traffic. Shuffle meals independently of the competing scorers; allow “unfamiliar/skip” and report missing ratings and attrition. Freeze the last five usable ratings as an untouched test set and inspect learning after five, ten, and fifteen earlier ratings.

Compare three predictors on the same test observations: the proposed model, a smoothed per-person like-rate baseline for probabilities, and the current scorer for ranking. Give the current scorer the same prior reactions, quiz, candidate meals, weather, and surprise setting. A regularized point-estimate ablation can determine whether uncertainty adds useful information beyond feature fitting.

Measure Brier loss, log loss, top-ranked held-out meal like rate, and reliability plots by history length. Resample whole participants for intervals; repeated ratings from one person are not independent users. Inspect calibration separately for zero/few-reaction profiles. Posterior checks on training data do not substitute for held-out checks.

**Provisional advancement gates:** at fifteen ratings, at least 10% lower mean Brier loss than the personal-rate baseline, with a participant-bootstrap interval supporting improvement; ranking no worse than the current scorer by more than five percentage points; and absolute probability-frequency gaps below 0.10 in sufficiently populated prespecified bins. Report sparse bins as unassessed. Reject the proposed benefit if it remains confidently miscalibrated or consistently loses to the simpler baseline; classify wide intervals as inconclusive, not success.

## Costs, failures, and readiness

The main risks are label ambiguity, correlated metadata, individual sparsity, changing tastes, and a model becoming certain about catalog quirks. A dislike can mean “not tonight”; draft 10 addresses that missing distinction. A person's responses may also depend on which cards were shown. An independent evaluation pool limits that bias in the pilot without proving production-wide accuracy.

This is ready for a small research fit, after observation/version capture, but not for claims of calibrated production confidence. It uses no other users' preference patterns: draft 09 owns collective taste. Draft 03 chooses questions; this draft only learns from the observations it receives. Preserve the current ranker as the fallback when fitting fails or evidence remains inadequate.

## Sources read

- [Gelman et al. (2008)](https://sites.stat.columbia.edu/gelman/research/published/priors11.pdf): regularized logistic coefficients, separation, normal/t priors.
- [Gneiting and Raftery (2007)](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf): proper probability scoring and calibration.
- [Stan predictive-check documentation](https://mc-stan.org/docs/stan-users-guide/posterior-predictive-checks.html): prior simulation and replicated-data diagnostics.
