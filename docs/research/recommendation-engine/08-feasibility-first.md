# 08 — Feasibility before taste

**Thesis:** Recommend an actual meal option that fits the user's current practical situation before optimizing how appealing it sounds.

The unique objective is reducing unusable recommendations: too slow to make, outside the budget, missing essential ingredients, or unavailable where the user can obtain them. This is a conditional product direction because MealRec currently describes dishes, not actionable recipes or local offers.

## Evidence and hypothesis

Constraint reasoning separates finding a satisfying option from explaining why no option satisfies the requirements. QuickXplain formalizes small conflicting requirement sets and distinguishes a background of constraints that cannot be relaxed. This supports understandable no-match responses; it does not imply MealRec needs a general-purpose solver. [Junker, QuickXplain](https://cdn.aaai.org/AAAI/2004/AAAI04-027.pdf)

Official recipe metadata distinguishes cooking time, preparation time, total time, ingredients, and yield. Those distinctions matter: a short cooking time does not imply dinner is ready quickly, and a named ingredient without quantity does not establish pantry sufficiency. A schema provides fields, not guarantees that a publisher's values are accurate. [Schema.org Recipe](https://schema.org/Recipe)

For purchasing, offer metadata provides price, currency, availability, and validity information. A dish's name alone cannot establish any of these. The proposed engine would need an actual offer associated with a place and time, including relevant fees, rather than an invented universal price for the dish. [Schema.org Offer](https://schema.org/Offer)

**App-specific hypothesis:** for users trying to decide what to eat now, removing practical dead ends produces more useful sessions than improving taste prediction on an unconstrained dish catalog. This may be false if the game is primarily playful discovery.

## Current repository fit

The [quiz](../../../meal-rec/src/app/quiz/page.tsx) collects avoided ingredients, spice tolerance, and surprise. The [home page](../../../meal-rec/src/app/page.tsx) requests one card and records reactions; it never asks whether the user will cook, buy, or simply browse. A like is not a confirmed decision or consumption event.

The [meal schema](../../../packages/database/src/models/meal.ts) has no preparation duration, price, pantry quantities, location, offer availability, or complete recipes. `timeOfDay` is not preparation time. In [seed data](../../../data/meals.json), its categories also include snacks and occasions; weather labels include “hangover cure.” These labels cannot serve as verified operational or health facts.

The [API](../../../meal-rec/src/app/api/recommend/route.ts) samples 50 meals before the [core](../../../packages/core/src/recommender.ts) filters exclusions. Tight additional constraints make omissions more consequential. A feasibility experiment must examine the complete relevant catalog before declaring no match, rather than confusing candidate omission with infeasibility.

## Concrete mechanism

At a session's start, optionally establish intent: **discover**, **cook now**, or **buy now**. Discover continues with the existing dish-level experience. The other two modes are offered only where the required metadata exists. Ask only questions that can change the available recommendations.

For cooking, relevant requirements are total elapsed time, servings, equipment, and pantry sufficiency. Budget is meaningful only when recipe quantities, missing purchases, and local prices are known. For buying, relevant requirements are location, opening/availability, total price, and realistic obtainment time. Pantry is irrelevant to a restaurant offer. These are different option types even when both are called “Margherita Pizza.”

Represent each user-specified requirement as hard or soft. Keep a simple eligibility rule:

`eligible(option) = exclusionsPass(option) AND everyHardSessionRequirementIsKnownAndSatisfied(option)`.

Unknown, stale, or incomplete data does not count as passing a hard requirement. Preserve every existing hard ingredient exclusion; incomplete composition cannot establish an allergen-safe option. Do not silently relax a safety restriction, budget ceiling, or other user-marked must. Taste ranking, including surprise, runs only on eligible options. Soft wishes can affect ordering without hiding their limitations.

If no option remains, distinguish “none meets these requirements” from “we lack the necessary information.” Explain the relevant blockers using the actual catalog. For a few requirements and a small catalog, ordinary filtering and checking requirement subsets are enough. Offer explicit edits to practical requirements only when the user chooses; never automatically trade off an exclusion for convenience.

## Hypothetical worked example

Suppose Ori selects “cook now,” dinner within 25 minutes, two servings, no nuts, and a confirmed pantry list. The existing Shakshuka card does not establish whether it is feasible: it lacks a complete recipe and timing.

In a hypothetical curated catalog, a specific Shakshuka recipe has a reviewed 22-minute total duration, complete quantities, appropriate equipment requirements, and no known conflict with the exclusion. A linked recipe for another appealing meal takes 70 minutes. The latter never enters taste ranking for this session, even if its cuisine is Ori's favorite.

If the Shakshuka recipe needs peppers the pantry record does not contain, “pantry only” excludes it. The engine can explain that missing ingredient, but cannot claim a substitution preserves recipe performance or safety. Ori can explicitly change the pantry requirement or choose another recipe.

In a buying session, the same dish instead needs a fresh local offer. A hypothetical 11-unit menu price fails a 12-unit ceiling if mandatory fees bring the total to 14. Every value here is illustrative, not present in the repository or a measured offer.

## Existing data and required evidence

Existing taste attributes and quiz exclusions remain useful after the feasibility gate. Everything operational is missing.

The smallest expansion is one audited cooking collection with total durations, complete ingredients/quantities, servings, equipment, provenance, and review dates. An optional session form can collect a time ceiling without a permanent pantry inventory. Pantry tracking, shopping budgets, and restaurant integrations remain conditional later directions, each needing its own reliable data source and freshness policy.

Evaluation needs session intent, declared hard requirements, available candidate IDs, exclusion reasons, and a separate “this works for my situation” judgment. Continue distinguishing that judgment from purchase or eating. Guests could participate with explicit session-only research consent; their current feedback is not saved by the [feedback API](../../../meal-rec/src/app/api/feedback/route.ts).

## Smallest falsifiable experiment

First verify that users actually want help acting now. Then test one dimension: total preparation time in an audited recipe subset. Compare the current taste scorer against the same scorer preceded by the declared time gate. Both use the same complete candidate pool and ingredient exclusions; neither gets a retrieval advantage. Include no-match and missing-data cases.

Use a counterbalanced pilot, provisionally 30 participants completing realistic cooking decisions. Independently audit recipe timing assumptions and have participants judge whether recommendations are usable with their stated circumstances. Measure unusable cards per session, time to a usable decision including form effort, no-match frequency, unknown-data exclusions, and taste acceptance among feasible meals.

**Provisional advancement gates:** at least 25% fewer unusable cards, no increase in median decision time, and less than a 5 percentage-point decline in taste acceptance among feasible options. All hard-requirement checks must be correct in fixtures. Report uncertainty; a small pilot establishes direction, not population effect size.

**Reject or defer:** stop if fewer than half of intended sessions seek an actionable decision, if dependable metadata cannot cover at least 80% of the pilot collection, or if input/maintenance effort erases the benefit. Reject any policy that serves a known hard violation. If uncertainty is broad, gather evidence rather than expanding into pantry and ordering features.

## Costs, failures, and readiness

Metadata acquisition and freshness dominate algorithm work. Preparation skill, shared equipment, delivery fees, and stock changes make apparently precise values unreliable. Overstrict unknown handling can yield many empty sessions; that is a data problem to expose, not solve through fabricated precision.

Readiness is **conditional**: good for discovery research and a small audited recipe study; unready for general time/budget/pantry/availability promises. Unlike **04**, this is about practical feasibility rather than sequence or fatigue. Unlike **06**, it serves one person's situation. **10** may supply an explicit “too slow today” critique, but this draft supplies the verified operational facts required to honor it.

## Sources actually read

- [Junker, QuickXplain (2004)](https://cdn.aaai.org/AAAI/2004/AAAI04-027.pdf): conflicting requirements and nonrelaxable background constraints.
- [Schema.org Recipe](https://schema.org/Recipe): distinct duration, ingredient, and yield fields.
- [Schema.org Offer](https://schema.org/Offer): purchase-specific price, currency, availability, and validity fields.
