# Current engine and a fair comparison

Research baseline: commit `4574611`, inspected 2026-10-17. This file records observations and proposed evaluation rules; the ten numbered files contain the research directions.

## What exists

The home page sends stored quiz answers to `/api/recommend`. The API loads signed-in feedback from the preceding 14 days, samples 50 meals, and calls the core engine. Weather defaults to `normal`; the browser does not supply weather. The core applies ingredient/allergen string exclusions with a small alias list, scores the survivors, perturbs scores according to `surpriseFactor`, and samples proportionally to score from the top five. This is a working heuristic path. ([Home](../../../meal-rec/src/app/page.tsx), [API](../../../meal-rec/src/app/api/recommend/route.ts), [constants](../../../meal-rec/src/lib/constants.ts), [core](../../../packages/core/src/recommender.ts).)

The score before the surprise multiplier is:

```text
1
+ exact feedback: +0.4 like / -0.4 dislike / 0 interested
+ signed coarse attribute similarity: bounded by ±0.2
- 0.05 × distance from requested spiciness
+ 0.2 if the weather label matches
```

Similarity uses cuisine equality and whether heaviness and spiciness differ by at most one. It does not learn feature weights. `timeOfDay`, ingredient similarity, and flavor tags do not contribute to this score. ([Core](../../../packages/core/src/recommender.ts).)

Each like, interested, or dislike requests another card. The separate “Get Another Recommendation” action records no reaction. Guests can browse and submit requests, but `/api/feedback` returns 401 and their reactions do not become learned preferences. Feedback is one latest record per user and meal, with the type and timestamp overwritten. Thus a timestamped preference table exists; an interaction sequence does not. ([Home](../../../meal-rec/src/app/page.tsx), [feedback endpoint](../../../meal-rec/src/app/api/feedback/route.ts), [schema](../../../packages/database/src/models/feedback.ts), [recent-feedback query](../../../packages/database/src/feedback-helpers.ts).)

The [older retrospective](../../architecture-retrospective.md) was checked against `01f48a2`. Its dead recommendation route, argmax selection, raw identity header, and unsafe old PRNG findings must not be treated as current facts. Current source uses the recommendation route, session identity, weighted sampling, and mulberry32. The retrospective remains useful historical context.

## What the catalog can support

These are counts from the seed file, not a production database audit.

| Dimension | Measured in `data/meals.json` | Research implication |
| --- | --- | --- |
| Meals | 91 | Exhaustive offline comparisons are practical; no need to assume a retrieval-scale problem. |
| Cuisines | 40 strings | Many categories have little within-category evidence. |
| Ingredients | 163 strings | Raw equality misses semantic relations and synonyms. |
| Flavor tags | 86 strings | There are usable features, but many are sparse; vocabulary cleanup is a separate intervention. |
| Allergen labels | 10 strings; 19 meals have an empty list | An empty list does not establish absence of allergens. |
| Weather labels | 5, including `hangover cure` | Semantic categories need review before using them as context. |
| Time labels | 8, including `appetizer` and `when sick` | These mix time, course, and occasion. |

Every meal has nonempty cuisine, ingredient, flavor, weather, and time metadata. Price, preparation duration, pantry, availability, nutrition, verified recipes, and a semantic ontology are absent from the seed and meal schema. User counts, traffic, feedback density, and live catalog contents are unknown. ([Seed](../../../data/meals.json), [meal schema](../../../packages/database/src/models/meal.ts).)

The existing exclusions are useful preferences, but manually authored metadata and a few aliases do not establish comprehensive food or allergen safety. Every draft retains a shared exclusion gate; semantic similarity and exploration must never override it.

## Two controlled probes

### Top-five behavior is visible in the current core

The current TypeScript engine was run for seeds 0–999 with the same full seed catalog in its original order, no feedback, spiciness 2, `normal` weather, and surprise 0.

| Returned meal | Count |
| --- | ---: |
| Banh Mi | 185 |
| Shakshuka | 198 |
| Jollof Rice | 195 |
| Bibimbap | 219 |
| Butter Chicken | 203 |

There were five distinct outputs and 191 exact repeats across 999 adjacent pairs. This verifies the top-five sampler under fixed inputs. **It is not the production diversity or repeat rate:** the API samples a new candidate set on each request. It establishes neither user satisfaction nor the advantage of any proposed draft.

### Sampling before exclusions can miss an eligible meal

A synthetic pool with one allowed meal and 90 blocked meals returned the allowed meal when the entire pool was scored. Scoring a 50-meal subset that omitted it returned `null`. The API maps a null result to a 404. ([API](../../../meal-rec/src/app/api/recommend/route.ts).)

If the catalog has 91 meals, exactly `k` are eligible, and the candidate stage is a uniform 50-item sample without replacement, the probability of missing every eligible item is:

```text
P(miss all eligible) = C(91 - k, 50) / C(91, 50)
```

| Eligible meals, k | Conditional probability of missing all |
| --- | ---: |
| 1 | 45.05% |
| 2 | 20.02% |
| 3 | 8.77% |
| 5 | 1.61% |
| 10 | 0.0174% |

These are exact combinatorial illustrations under the stated assumptions, **not observed production error rates**. Before comparing sophisticated rankers, compare the shipped candidate stage with filtering the full small catalog. Keep candidate generation identical between arms when the experiment concerns another mechanism. Otherwise a better candidate set can be mistaken for a better learner.

## The events a future experiment would need

No telemetry is added by this research. A future experiment should add only the events its question needs.

| Event or field | Why it matters | Current state |
| --- | --- | --- |
| Decision ID, policy version, candidate/item versions, context | Reproduce what the policy could choose | Absent |
| Rendered impression linked to decision and session | Distinguish an API result from a card actually seen | Absent |
| Reaction linked to its impression | Attribute repeated reactions without overwriting history | Latest user–meal reaction only |
| Skip, session end, optional explicit choice | Measure rejection, abandonment, and decision completion separately | Not recorded |
| Selection probability and complete conditioning information | Evaluate a different policy on logged outcomes | Absent |
| Reason, pairwise answer, or group vote | Support drafts 03, 06, and 10 | Absent |

Offline display of the cached last card should not create a new server decision. A like, an interested reaction, an explicit choice, and consumption are different events. The current app measures reactions; it does not establish choice or consumption. If an experiment uses “time to choice,” it must introduce and validate a choice event or collect it in a moderated study.

## Evaluate the question each draft actually asks

Observed reactions depend on which meals were exposed and which people responded. A random split of that table does not make selection bias disappear. The primary research on propensity-weighted recommendation evaluation makes the assignment mechanism central. This motivates caution about interpreting the current feedback table as unbiased preference data. ([Schnabel et al., 2016](https://proceedings.mlr.press/v48/schnabel16.html).)

Replay evaluation has assumptions about the logging policy, support, and the event-generating process. The classic contextual-bandit paper studies randomized logs; it does not authorize replaying arbitrary reaction histories. For MealRec, existing records lack the required impressions and probabilities. A seed or a top-five normalized score alone is not the complete probability of a policy that also samples candidates and perturbs scores. ([Li et al., WSDM 2011](https://arxiv.org/abs/1003.5956).)

Use a staged comparison:

1. **Check invariants and mechanics.** Exclusions, empty pools, reproducibility, probability normalization, state resets, and claims made by explanations. Synthetic data can establish these properties.
2. **Run a small human falsification study.** Use real catalog meals; measure the draft's proposed benefit and friction. This can reject a poor interaction or reveal label confusion without claiming population-wide uplift.
3. **Compare policies prospectively.** Preserve the same candidate stage, UI, and baseline except for the tested intervention. Randomize at the person or group level when preference learning carries across sessions. Examine repeat users, new users, and constrained users separately.

Choose one primary outcome before collecting data: held-out preference prediction for 01; learning value for 02; elicitation efficiency for 03; repetition and session satisfaction for 04; useful surprise for 05; member fairness for 06; semantic transfer for 07; feasibility for 08; value from other users for 09; successful correction for 10. Extra rerolls or time spent can reflect frustration. Satisfaction, relevance, abandonment, and zero hard-constraint violations are guardrails, not an excuse to combine every goal into one score.

All numeric success thresholds in the drafts are **provisional design targets**. Participant counts in small studies are for falsification and usability, not power calculations. Estimate baseline rates, user clustering, outcome variance, and the smallest worthwhile effect before choosing a confirmatory sample size. Report uncertainty and inconclusive results. None of the proposed experiments has been run, and no draft is proven to outperform the shipped engine.

## Reproduce the local evidence

Run from the repository root. Python uses its standard library; the core probe was run with Node `v24.15.0`, which can load this erasable TypeScript directly. No packages were installed.

```bash
python3 - <<'PY'
import json, collections, math
from pathlib import Path
meals = json.loads(Path('data/meals.json').read_text())
assert len(meals) == 91
for key in ['cuisine', 'primaryIngredients', 'flavorTags',
            'allergens', 'weather', 'timeOfDay']:
    values = [v for m in meals for v in
              (m[key] if isinstance(m[key], list) else [m[key]])]
    print(key, len(set(values)), 'empty', sum(not m[key] for m in meals))
for k in [1, 2, 3, 5, 10]:
    print(k, math.comb(91-k, 50) / math.comb(91, 50))
PY

node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectRecommendation } from './packages/core/src/recommender.ts';
const meals = JSON.parse(fs.readFileSync('data/meals.json', 'utf8'))
  .map((meal, i) => ({ ...meal, _id: `seed-${i}` }));
const input = {
  quiz: { ingredientsToAvoid: [], spiciness: 2, surpriseFactor: 0 },
  recentFeedback: [], weather: 'normal', candidateMeals: meals
};
const picks = Array.from({ length: 1000 }, (_, randomSeed) =>
  selectRecommendation({ ...input, randomSeed })._id);
assert.equal(new Set(picks).size, 5);
for (const id of new Set(picks)) {
  console.log(meals.find(m => m._id === id).name,
    picks.filter(p => p === id).length);
}
console.log('Adjacent repeats', picks.slice(1)
  .filter((id, i) => id === picks[i]).length, '/', picks.length - 1);
const pool = meals.map(m => ({ ...m, primaryIngredients: ['blocked'], allergens: [] }));
pool[0] = { ...pool[0], primaryIngredients: ['allowed'] };
const constrained = { ...input,
  quiz: { ...input.quiz, ingredientsToAvoid: ['blocked'] } };
assert.equal(selectRecommendation({ ...constrained, candidateMeals: pool })._id, pool[0]._id);
assert.equal(selectRecommendation({ ...constrained, candidateMeals: pool.slice(1, 51) }), null);
JS
```

Primary evaluation sources were read as full paper text, with attention to assumptions: [Schnabel et al. PDF, §3](https://proceedings.mlr.press/v48/schnabel16.pdf) and [Li et al. PDF, §2–3](https://arxiv.org/pdf/1003.5956). Their findings establish evaluation methods in their own settings; applying them to this app remains an engineering proposal.
