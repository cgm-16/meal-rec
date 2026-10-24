# 03 — Adaptive meal duels with a question budget

**Thesis:** Offer a few optional, deliberately chosen meal comparisons that resolve uncertainty relevant to the next recommendation, stopping when their value no longer justifies the person's effort; the contribution is a different cold-start interaction.

## Evidence and hypothesis

Houlsby and colleagues derive an active-learning criterion based on information about model parameters and extend it to pairwise preference learning. Their distinction between model uncertainty and noisy responses explains why repeatedly asking an intrinsically ambiguous comparison can waste questions. Their benchmarks do not establish that meal duels are pleasant or effective. [Houlsby et al., 2011](https://mlg.eng.cam.ac.uk/pub/pdf/HouHusGha11a.pdf)

Bonilla, Guo, and Sanner select preference queries using expected value of information: answers should improve the eventual recommendation rather than merely identify every uncertain preference. Their model also incorporates other users; this draft borrows the decision criterion, not that collective information source. [Bonilla et al., 2010](https://proceedings.neurips.cc/paper/2010/file/46922a0880a8f11f8f69cbb52b1396be-Paper.pdf)

Boutilier explicitly models question cost, including time and mental burden, and compares the value of further elicitation with making a decision now. That principle motivates a stopping rule, without requiring MealRec to implement a full POMDP. [Boutilier, 2002](https://cdn.aaai.org/AAAI/2002/AAAI02-037.pdf)

**MealRec hypothesis:** Up to three relevant comparisons can produce a better initial recommendation than the same number of ordinary single-card reactions, with tolerable extra effort. No reviewed source tests this app, catalog, or interaction.

## Fit to the current repository

The [quiz](../../../meal-rec/src/app/quiz/page.tsx) collects ingredient avoidances, spice tolerance, and a surprise setting. It does not ask which actual dishes the person prefers. The [home interaction](../../../meal-rec/src/app/page.tsx) shows one card and immediately advances after each reaction. A pairwise answer has a different meaning: choosing A over B does not imply liking A or disliking B.

The [meal schema](../../../packages/database/src/models/meal.ts) supplies names, descriptions, ingredients, flavor tags, spice, and heaviness for comparison cards. Images are optional and should not become a prerequisite for answering. The [feedback schema](../../../packages/database/src/models/feedback.ts) stores one latest reaction per user/meal, with no pair, prompt, position, skip, or query history. Consequently, existing feedback must not be recast as pairwise observations.

Keep the constraint quiz intact. Apply its hard ingredient exclusions to both sides of every duel and to final recommendations; never present a prohibited item to “learn” whether the constraint is real. The current string/alias filter still has limited coverage, so eligibility means consistent with recorded metadata, not verified allergen safety.

## Proposed mechanism

After the existing quiz, offer an optional “Help me tune your recommendations” step. Present two eligible meal cards with equally detailed names/descriptions and actions for A, B, “neither/unsure,” and skip. Randomize left/right placement. Permit ending immediately. Neither/unsure and skip remain distinct recorded abstentions, without a fabricated preference edge.

Start with a small content utility model for this person:

```text
utility(meal) = weights · features(meal)
P(A preferred to B | weights) = sigmoid(utility(A) - utility(B))
posterior(weights) updates only after a decisive A/B response
```

Use broad features already present, such as heaviness, spice distance, and common flavor tags. Center initial preferences on the quiz where applicable and shrink unsupported effects. Absolute utility is not identified by pairwise answers: only differences matter, and a winner may still be unappealing.

Enumerate pairs within a small, human-reviewed eligible set. Require understandable descriptions and plausible candidates, so the policy does not spend its budget on obscure, irrelevant duels. For each possible decisive answer, estimate how the posterior would change the best final recommendation. Score the pair by:

```text
expected best-meal utility after answering
minus best-meal utility with present information
```

This adapts the expected-information-value objective in [Bonilla et al.](https://proceedings.neurips.cc/paper/2010/file/46922a0880a8f11f8f69cbb52b1396be-Paper.pdf). For the first prototype, assume an answer is decisive when calculating that score, then measure abstention; this optimistic assumption must not be hidden in claimed efficiency. Never repeat a skipped or unfamiliar pair within the session.

As a diagnostic comparator, information gain can identify disagreement between plausible preference models. High predicted response entropy alone also includes unavoidable indecision; it is not sufficient evidence of a valuable question. [Houlsby et al.](https://mlg.eng.cam.ac.uk/pub/pdf/HouHusGha11a.pdf)

Stop at three **presented** duels, 45 seconds of active setup, an explicit stop, or a prespecified negligible-value threshold. Skips consume the burden budget. Select the value threshold before the outcome study, using the model's stated utility scale and pilot usability observations. These caps and conversion assumptions are provisional engineering choices, not literature-derived constants.

## Hypothetical example

A person avoids nuts and selects spice tolerance two. The model is uncertain between rich, creamy dishes and lighter, tangy dishes. It asks Chicken Tikka Masala versus Fattoush. A Fattoush preference changes the next question: perhaps another eligible pair that helps distinguish lightness from tanginess.

This is not a controlled intervention on one attribute: the meals differ in several ways, so the answer cannot prove “creaminess caused rejection.” If the person does not recognize a dish, they can skip without acquiring a dislike. Massaman Curry remains excluded because its recorded peanuts conflict with the avoidance. After the cap, the system recommends using the evidence it has rather than demanding a complete profile.

## Existing and required data

Existing content metadata and quiz values support a small research prototype. No pantry, cost, preparation time, nutrition, or real availability may be inferred from these comparisons.

Required data includes append-only query IDs, both meal IDs and metadata versions, exact prompt and left/right order, model/query-policy version, timestamp, active answering time, decisive answer or abstention, remaining budget, and a session identifier. Final recommendation and its independent evaluation must be linked to the session. Keep duel events separate from ordinary reaction records and do not write the losing item as a dislike.

A guest prototype could retain a session-local profile only after an explicit storage decision; current guest feedback is not persisted. Long-term merging of guest and signed-in profiles is outside this draft's initial experiment.

## Smallest falsifiable experiment

First observe whether users understand relative preference and can skip. Then provisionally recruit 80 cold-start participants, randomly assigned to: quiz only; quiz plus three nonadaptive single-card ratings; quiz plus three fixed eligible duels; or quiz plus adaptive duels capped at three. Use the same content features, priors, catalog, eligibility, final-selection rule, and surprise setting. Single-card ratings use like/dislike likelihoods; duel answers use relative-preference likelihoods. Record unfamiliarity and dropout for everyone.

Quiz-only is the current onboarding baseline. Single-card ratings test the interaction claim directly; fixed duels isolate adaptive query selection. Equal question counts do not imply equal effort, so measure actual time.

After setup, independently evaluate five recommendation cards and held-out comparisons, keeping judgments out of training until measurement closes. Define success as at least one explicitly acceptable card within five; report it per assigned participant, including abandonment as failure to demonstrate success. Like or “would consider this” is stated preference, never an actual meal choice. Measure prediction accuracy, success rate, question count, setup time, total time to first acceptable card, and abandonment. Report unreached outcomes rather than dropping them from timing results.

**Provisional advancement gates:** adaptive elicitation matches fixed-duel success within five percentage points while reducing median setup time by at least 20%; beats quiz-only and single-card ratings by at least five points success; and requires no greater median total decision time than single-card ratings. Allow at most five points additional abandonment versus either baseline. Use participant-level intervals and prespecify a larger follow-up when 20 per arm cannot resolve margins. Reject the interaction claim if single-card ratings perform similarly with less effort, adaptive queries lose to fixed duels, or unfamiliarity dominates. Wide intervals remain inconclusive.

## Costs, readiness, and boundaries

Preferences can be inconsistent, context-dependent, or influenced by a vivid photograph. Identical presentation and randomized position reduce obvious confounds; they do not eliminate them. Broad tags can also make the selected comparisons systematically uninformative. A sophisticated query policy cannot compensate for descriptions the user cannot interpret.

This direction is ready for a bounded UX research prototype, not a production cold-start claim. Draft 01 owns passive preference estimation; draft 02 explores through ordinary meal presentation. This draft explicitly asks questions and pays their burden. Draft 10 owns reason-aware corrections after rejection; no comparison is treated as a causal explanation or a new hard exclusion.

## Sources read

- [Houlsby et al. (2011)](https://mlg.eng.cam.ac.uk/pub/pdf/HouHusGha11a.pdf): active information gain, noisy responses, and pairwise preference learning.
- [Bonilla, Guo, and Sanner (2010)](https://proceedings.neurips.cc/paper/2010/file/46922a0880a8f11f8f69cbb52b1396be-Paper.pdf): selecting queries for final recommendation value.
- [Boutilier (2002)](https://cdn.aaai.org/AAAI/2002/AAAI02-037.pdf): elicitation cost, decision value, and stopping.
