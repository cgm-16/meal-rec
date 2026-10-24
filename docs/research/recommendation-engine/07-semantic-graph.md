# 07 — A curated semantic graph for traceable taste transfer

**Thesis:** Replace coarse cuisine equality with a small, reviewed graph of meal, ingredient, texture, and flavor concepts so that feedback can transfer across cuisines through inspectable relationships.

The unique contribution is a better representation of what meals share. It does not require other users, a Bayesian preference model, or a new exploration policy.

## Evidence and hypothesis

FoodOn demonstrates how stable identifiers, synonyms, and typed relationships can reduce ambiguity in food descriptions. Its ontology covers food sources, products, and processes; it does not establish which meals a particular person will enjoy. Borrowing its vocabulary discipline is justified; assuming its hierarchy is a taste metric is not. [FoodOn paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC6550238/)

The W3C SKOS specification distinguishes hierarchical concepts from associative relationships. These are different semantics: “related to” does not mean “contains,” “equivalent,” or “safe substitute.” That distinction supports a deliberately restricted graph rather than unrestricted traversal. [SKOS semantic relations](https://www.w3.org/TR/skos-reference/#semantic-relations)

Ahn and colleagues found different ingredient compound-sharing patterns across regional recipe collections. Their study concerns recipe structure, not individual preference prediction, and notes preparation and compound-data limitations. Chemical overlap therefore offers no universal shortcut to “tastes alike.” [Flavor network paper](https://arxiv.org/html/1111.6074)

**App-specific hypothesis:** a few reviewed sensory relationships will transfer likes more accurately across MealRec's cuisine labels than the existing coarse similarity term. Whether graph structure adds anything beyond cleaning the strings is an open question.

## Current repository fit

The [core scorer](../../../packages/core/src/recommender.ts) generalizes recent likes and dislikes through cuisine equality and nearby heaviness/spiciness, with a maximum contribution of 0.2. It does not compare ingredients or flavor tags. Exact meal reactions have a larger ±0.4 effect.

The [seed catalog](../../../data/meals.json) contains 91 meals, 40 cuisine labels, 163 ingredient strings, and 86 flavor tags. Examples include `egg`/`eggs`, `tomato`/`tomatoes`, and `crisp`/`crispy`. Other tags, such as `classic`, `colorful`, and `healthy`, are not equivalent kinds of sensory evidence. These are seed measurements, not a database census.

The [meal schema](../../../packages/database/src/models/meal.ts) already supplies ingredients, tags, description, and cuisine. The [recommendation route](../../../meal-rec/src/app/api/recommend/route.ts) currently populates only cuisine, heaviness, and spiciness on feedback meals, so a graph proposal would eventually reach that boundary as well as the core. This draft proposes no code changes.

## Concrete mechanism

Start with a curated vocabulary for the existing catalog, not a graph database or a learned graph neural network. Preserve the authored text and map it to reviewed concept IDs. Do not map ambiguous terms such as `vegetables`, `spices`, or `broth` to a precise ingredient or recipe composition.

Maintain two separate relation sets:

- **Taste relations:** meal has a documented texture/flavor; ingredient belongs to a culinary concept; two sensory concepts have a reviewed broader relationship. Each edge records provenance and a version.
- **Exclusion relations:** known ingredient identity, verified containment, and explicit avoidance rules. Taste edges never create, remove, or satisfy an exclusion rule.

For taste transfer, form a sparse vector `v(m)` of reviewed sensory concepts. Direct annotations receive weight 1; one approved parent step receives, provisionally, weight 0.5. Ignore generic roots such as “food,” and prevent duplicate evidence from synonymous tags. Longer paths are initially disabled. A weighted Jaccard similarity is easy to inspect:

`sim(a,b) = Σz min(v(a,z), v(b,z)) / Σz max(v(a,z), v(b,z))`.

A first experiment replaces only the existing attribute-similarity term. Use a bounded positive transfer from liked meals, capped at 0.2; retain exact meal likes/dislikes and the remaining score terms. Keep dislikes item-specific during this pilot because a rejection does not reveal which shared feature caused it. The displayed explanation names a real contributing path, such as “both have a reviewed aromatic-herbal profile,” rather than generating an attractive story after selection.

Apply all hard ingredient exclusions before taste scoring. The current exact-string rules and limited aliases remain mandatory, and reviewed mappings may conservatively add known conflicts. Missing composition remains unknown. An empty allergen list or an ingredient's culinary family never establishes safety or authorizes relaxing an exclusion.

## Hypothetical worked example

Suppose Ori likes Pho Bo. The catalog describes it as aromatic, light, and herbal. A reviewed graph might connect `herbal` to a broader aromatic profile, allowing a modest transfer to an eligible meal from another cuisine whose documented tags support that same profile.

Thai Green Curry shares `aromatic`, but its higher spiciness still receives the ordinary quiz penalty. Beef Ramen shares broth ingredients, but the graph does not assume identical flavor merely because both contain an unspecified `broth`. A reviewer might decline that relation entirely.

If Ori excludes soy, a known soy conflict removes a meal before this comparison. A taste path cannot rescue it. The explanation also cannot infer that a generic green curry recipe is soy-free from its empty seed allergen array. These are illustrative decisions, not measured model improvements.

## Existing data and required evidence

Existing inputs are catalog attributes, quiz exclusions/spiciness, and signed-in recent reactions. The [feedback model](../../../packages/database/src/models/feedback.ts) preserves one latest reaction per user/meal, not the reason for the reaction; guest reactions are not learned.

Required additions are a reviewed concept mapping, typed edge provenance, a compact annotation guide, and graph-version identifiers in evaluation records. Record unmapped and disputed terms rather than forcing coverage. No embeddings, external recipe scraping, or compound database is necessary for the first test. Complete recipe/allergen verification would be a separate data undertaking, not a benefit automatically delivered by this graph.

## Smallest falsifiable experiment

Compare three frozen scorers on the same eligible candidate pool: the shipped coarse-similarity scorer; canonicalized direct-tag similarity without parent edges; and the curated graph. The tag and graph variants must share identical positive-only feedback transfer, caps, and exact-label handling. Keep spice/weather terms and selection randomness matched. Their contrast isolates graph edges from simpler metadata cleanup and from the route's random pre-sampling of 50 meals. The shipped scorer's signed transfer differs, so beating it alone cannot establish a graph benefit.

Recruit a small consenting pilot, provisionally 30 people, to provide a few initial likes and independently judge withheld eligible meals across cuisines. Separate participant-level training and test judgments. Every scorer ranks the same fully judged held-out subset for each person; unjudged meals and abstentions remain unknown. Report participants with fewer than five judged candidates or no relevant judgments separately, alongside evaluation coverage. Evaluate held-out ranking, acceptable cross-cuisine recommendations, and whether users agree that the stated shared attribute is present. Do not call these likes consumption outcomes.

**Provisional advancement gates:** graph transfer improves held-out NDCG@5 by at least 5% over both controls, explanation attribute agreement reaches 90%, and there are zero hard-exclusion violations in adversarial fixtures. Report participant-level uncertainty; an interval spanning no improvement is inconclusive, not a pass.

**Reject or simplify:** reject the graph if direct-tag normalization matches it, if any exclusion is weakened, or if more than 10% of reviewed explanations rely on disputed sensory relationships. Prefer the smaller normalization change when that accounts for the benefit.

## Costs, failures, and readiness

The main expense is curation, especially for mixed dishes and culture-dependent descriptors. Generic graph hubs can make everything similar; duplicated parents can overcount one feature; reviewer taste can become hidden policy. Track unmapped coverage, edge disagreements, and maintenance time alongside ranking results.

This direction is ready for a bounded catalog study, with uncertain value. It differs from **01** by changing representation rather than estimating personal posteriors; from **05** by not optimizing novelty; from **09** by using no other-user correlations; and from **10** by not asking why a particular card was rejected. Those methods could later consume the graph, but are unnecessary to test this thesis.

## Sources actually read

- [Dooley et al., FoodOn (2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6550238/): identifiers, ambiguity, vocabulary facets, and food-source relationships.
- [W3C, SKOS Reference (2009)](https://www.w3.org/TR/skos-reference/): typed hierarchical versus associative semantics.
- [Ahn et al., Flavor network (2011)](https://arxiv.org/html/1111.6074): regional recipe patterns and limits of compound-sharing assumptions.
