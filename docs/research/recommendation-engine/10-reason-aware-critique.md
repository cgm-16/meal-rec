# 10 — Explicit critiques with faithful steering and reversible scope

**Thesis:** Let a user say what should change after a disappointing card, and apply that instruction at the scope they chose instead of treating every rejection as a stable dislike.

The unique contribution is explicit, user-controlled correction: “less spicy this session,” “not this meal now,” or “remember that I avoid this ingredient.” It is neither an inferred sequence model nor a system-selected preference duel.

## Evidence and hypothesis

Chen and Pu evaluated user-motivated and system-proposed critiquing interfaces using decision accuracy, effort, and confidence. Their study supports testing user-initiated corrections, but its shopping tasks and differing display designs do not predict a meal-app effect size. [Evaluating Critiquing-based Recommender Agents](https://cdn.aaai.org/AAAI/2006/AAAI06-025.pdf)

Viappiani, Faltings, and Pu describe preference-based search in which people incrementally state preferences by reacting to examples, balancing decision accuracy against interaction effort. This motivates an optional correction after a card; their suggested-example machinery is unnecessary for the narrower proposal here. [Example-critiquing paper](https://arxiv.org/html/1110.0026)

CountER formulates explanations through changes that actually reverse a model's recommendation decision and distinguishes explanation complexity from strength. Borrow the requirement to test the claimed model change, not its particular neural model or synthetic item edits. A model counterfactual does not establish the causal reason a human disliked a meal. [CountER](https://arxiv.org/html/2108.10539)

**App-specific hypothesis:** distinguishing an explicit temporary obstacle from a persistent preference improves the next useful recommendation while reducing unwanted long-term preference changes. Whether users want the extra interaction remains uncertain.

## Current repository fit

The [home page](../../../meal-rec/src/app/page.tsx) sends like/interested/dislike and immediately requests another card. Its separate “Get Another Recommendation” action records no skip. The [feedback API](../../../meal-rec/src/app/api/feedback/route.ts) saves no reason and overwrites the latest user/meal reaction. Guests receive 401.

The [core](../../../packages/core/src/recommender.ts) treats an exact dislike as −0.4 and also generalizes it through coarse attributes for 14 days. The same stored event could mean “I dislike this dish,” “too spicy today,” or “I already ate.” The system cannot distinguish those meanings from its current labels.

The [quiz](../../../meal-rec/src/app/quiz/page.tsx) supplies avoided ingredients and a spice setting through local storage. There is no separate session instruction, persistent preference editor, critique provenance, or undo history. The [meal schema](../../../packages/database/src/models/meal.ts) can support spice/heaviness and documented ingredient/tag corrections, but not price or preparation-time critiques without draft 08's additional evidence.

## Concrete mechanism

Add one optional correction affordance alongside the existing reaction loop. A person can move on immediately or select a small, grounded instruction: not now; less spicy; lighter; avoid a named ingredient. Avoid an open-ended conversation or requiring a reason for every rejection. Plain dislike remains an item-level negative with unknown reason; do not invent its underlying feature.

Store an explicit instruction conceptually as:

`(meal shown, feature, operator/value, scope, expiry, user-confirmed origin)`.

Default corrective instructions to the current session, with visible scope and undo. Persist only when the user explicitly chooses “remember.” “Not now” suppresses that meal in the session without overwriting a previous stable like. A declared stable dislike can update the persistent item preference. An ingredient avoidance updates the relevant hard exclusion set at the user's chosen scope.

Translate the supported controls literally. For example, a user-selected spice ceiling of 2 limits candidates to known spiciness ≤2. “Lighter than this” can offer the corresponding numeric heaviness ceiling, while explaining that the catalog's scale is subjective. Do not interpret “creamy” as verified dairy content, or transform a generic dislike into a cuisine ban. If a request cannot be evaluated from the metadata, disclose that rather than guessing.

All existing hard ingredient exclusions remain hard. A critique never silently relaxes them, and an expired temporary taste instruction cannot erase a persistent exclusion. When the revised eligible set is empty, report the conflict and offer edits to the user's practical or taste instructions. Incomplete ingredient/allergen metadata still prevents a comprehensive safety claim.

Make the explanation a direct consequence of the applied instruction: “Your session limit removed meals above spice level 2.” A what-if preview changes one permitted instruction and reports actual eligibility or deterministic score-term differences before surprise. Hold catalog, candidate pool, and model version fixed. Since the current policy samples among its best five, “became eligible” is more faithful than asserting that the highest score must be shown. Claims about stochastic selection would additionally require controlled per-meal random draws; the same seed alone is insufficient when filtering changes draw order. Never claim a random change proves the critique worked.

## Hypothetical worked example

Suppose Ori previously liked Thai Green Curry. Tonight's card feels too spicy, so Ori selects a spice ceiling of 2 and “this session.” The stored like remains a positive preference; the curry's seed spiciness of 4 makes it ineligible tonight. Pho Bo, with seed spiciness 1, can enter consideration if it satisfies every hard exclusion.

The explanation attributes the change to the explicit ceiling, not to a guessed dislike of Thai cuisine. A preview with ceiling 3 still excludes the curry; claiming otherwise would fail a faithful-policy check. If every remaining meal violates an ingredient exclusion, the system reports no match rather than weakening that exclusion.

In a later session, the temporary ceiling is gone. The curry can again be eligible, subject to the unchanged persistent restrictions and quiz. This scenario demonstrates intended behavior, not measured acceptance or proof of why Ori rejected the original card.

## Existing data and required evidence

Existing meal features and explicit quiz answers cover a deliberately small instruction vocabulary. Required additions are scoped critique events, session identity, expiry, undo provenance, and the exact policy/candidate context needed to reproduce a preview. Persistent edits must be inspectable and correctable.

The current latest-label record alone cannot preserve a stable like plus a temporary rejection. The event semantics need separation before training on critiques. Session-only controls could work for guests without implying their reactions are presently learned. Collect a distinct “this suits me now” research judgment; neither that nor a like demonstrates eating or purchase.

## Smallest falsifiable experiment

First specify behavioral checks: a temporary critique cannot alter persistent preference state; undo restores that state; hard exclusions survive every supported edit; and every explanation matches a rerun on frozen inputs. A false explanation or exclusion violation blocks advancement regardless of user satisfaction.

Then compare the current generic-rejection experience with optional scoped critiques in a counterbalanced pilot, provisionally 24 participants. Use the same real catalog, candidate pool, and scorer. Clone/reset initial preference and session state between conditions, using independent comparable tasks to limit familiarity and update carryover. Keep each two-session scope task intact within its condition. Include ordinary free-choice tasks and a two-session task where a declared temporary need changes. The person initiates each correction.

Measure a useful card within the next three recommendations, total task time including correction effort, abandonment, scope comprehension, undo use, and unintended persistence. Ask users to explain what will be remembered rather than treating a scope toggle click as proof of understanding.

**Provisional advancement gates:** a 15 percentage-point increase in useful-within-three sessions, no more than a 10% increase in median task time, at least 90% correct scope comprehension, and zero incorrect persistent changes or policy-explanation mismatches. Report participant-level uncertainty; imprecise findings remain inconclusive.

**Reject or simplify:** reject if users cannot reliably distinguish session and persistent effects, if correction effort outweighs improved recommendations, or if reason labels merely rename generic dislike without changing behavior. Start with “not now” alone if that captures most of the benefit.

## Costs, failures, and readiness

Users may choose convenient reasons rather than complete ones; contradictory instructions can produce empty sets; metadata errors can make a literal correction disappointing. Explicit reasons improve observability, not access to hidden causes. Randomized comparisons can estimate the interface's effect, while ordinary reaction histories cannot identify the causal effects of ingredients on satisfaction.

Readiness is good for a narrow interaction study. **03** asks system-chosen questions to reduce uncertainty; this draft executes user-initiated corrections. **04** infers short-term state from sequence; this draft records declared scope. **08** supplies missing operational facts, and **07** supplies semantic relationships; neither is required for the initial numeric-spice and not-now controls.

## Sources actually read

- [Chen and Pu (2006)](https://cdn.aaai.org/AAAI/2006/AAAI06-025.pdf): critiquing interfaces and effort/accuracy evaluation, with task/display limitations.
- [Viappiani, Faltings, and Pu (2006)](https://arxiv.org/html/1110.0026): incremental explicit preferences and interaction cost.
- [Tan et al., CountER (2021)](https://arxiv.org/html/2108.10539): model-tested counterfactual explanations and explanation strength.
