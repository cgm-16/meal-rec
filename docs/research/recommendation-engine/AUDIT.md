# Research delivery audit

Date: 2026-10-17. Current-code baseline: `4574611`. Scope: research directions for the MealRec discovery loop, not an engine implementation.

## Requirement evidence

| Requirement | Evidence checked |
| --- | --- |
| Research ten drafts | Ten separate substantive files, numbered 01 through 10. Each contains primary-source evidence and an app-specific hypothesis. |
| Each adds a meaningful contribution | Parent read all ten and compared information source, objective, interaction, state, and mechanism; distinctions are recorded below and in the index. |
| Dispatch Sol agents at max reasoning | Three explicit `gpt-6.1-sol` / `max` research assignments produced 01–03, 04–06, and 07–10. A separate portfolio review used a resumed Sol max agent. |
| Document for easy reading | An index, comparison table, suggested first studies, separate drafts, and a shared baseline/evaluation note. |
| Use graphics when useful | The SVG maps all ten directions by intervention point; its title, description, XML, numbered labels, and full rendered image were inspected. |
| Ground work in current state | Core, request routes, UI, quiz, models, constants, seed data, and feedback queries were read; the old retrospective's superseded claims were identified. |
| Research rather than unsupported ideation | The drafts cite 31 distinct primary source documents. Original papers or official specifications/manuals support methods; application benefits are explicitly hypotheses. |
| Verify the deliverable | Numbering, required content, source counts, code fences, local links, diagram labels, documented probe commands, and the documentation-only diff were checked. |

## Contribution and falsification matrix

| Draft | Contribution that must remain distinct | What could make it fail |
| --- | --- | --- |
| 01 | Individual feature preference estimation and uncertainty | A simple personal-rate or existing-score baseline predicts equally well, or probabilities remain miscalibrated. |
| 02 | Learning through a probability-bearing exploration policy | Logging/support is inadequate, or repeat use cannot repay exploration cost. |
| 03 | Deliberate adaptive questions with a burden budget | Ordinary single-card ratings or fixed duels provide equal quality with less total effort. |
| 04 | Ordered exposure state and temporary fatigue | Exact-repeat memory adds no usefulness, or attribute penalties hide requested favorites. |
| 05 | Personally useful novelty and interest calibration | Unfamiliarity increases without welcome discoveries or acceptable meals. |
| 06 | A social objective for shared agreement and minority satisfaction | Weighting fails to improve agreement/fairness or adds unacceptable negotiation burden. |
| 07 | Curated, traceable semantic relationships | Direct tag normalization accounts for the same improvement with less curation. |
| 08 | Practical feasibility before taste | Users primarily want discovery, reliable metadata is unavailable, or input effort erases the benefit. |
| 09 | Information from other users' co-reactions | Real overlap is insufficient, or popularity/content controls explain the apparent gain. |
| 10 | User correction with explicit reversible scope | People misunderstand what persists, or correction effort outweighs better next cards. |

## Verification performed

The local catalog audit measured 91 meals, 40 cuisines, 163 ingredient strings, and 86 flavor tags. All 17 named meal examples used for scenarios were checked against the seed; cited spice/allergen examples match its entries. This verifies the document's catalog references, not real recipes.

The current core ran on 1,000 deterministic seeds with a fixed candidate list. It produced five distinct meals and 191 adjacent repeats under the documented conditions. A synthetic full-pool/subset check reproduced an omitted eligible meal. The exact reproduction commands in [the baseline note](baseline-and-evaluation.md) were rerun successfully with clean stderr. These are narrow mechanical probes, not production metrics or evidence of user benefit.

Every draft has at least two independently read primary sources; in fact each has three, except 04, which has four. The parent also reopened source documents across all ten areas to check identity, relevance, and access. ResearchGate links point to full original papers, not summaries. Bibliographies describe what each source supports; proposed mechanisms and thresholds are labeled as adaptations or hypotheses.

Review corrections added a direct single-card comparison for 03, carryover controls for 04/06/10, parallel assignment for 05 because familiarity cannot reset, and identical fully judged ranking pools with coverage reporting for 07/09. Independent portfolio review confirmed distinctness and readiness ordering. It found a temporal example that implied a broader cooldown than proposed; the parent corrected the example. It also confirmed a graph-study confound: graph and normalized-tag variants now share positive-only transfer semantics, while the shipped signed-transfer scorer is a separate benchmark. No broader scientific blocker was found.

The SVG was visually inspected using a square preview wrapper because the system thumbnail renderer cropped the non-square preview. The delivered SVG retains its intended `1200 × 820` viewBox. No rendering dependency was added.

## Limits

No application behavior, dependency, schema, or production data was changed. Application unit/integration/end-to-end suites were not run for this documentation-only work. No live database or traffic audit, model training, user study, or prospective policy experiment was performed. Numeric gates and participant counts are proposed starting points, not measured effects or statistical power guarantees.

The meal-app interpretation of “this game” is stated in the index. All directions preserve recorded hard exclusions, while the existing metadata does not establish comprehensive allergen safety. Directions 06/08 require product-demand evidence, and 02/09 require data-readiness evidence. The goal achieved here is a verified research pool of ten distinct drafts; it is not evidence that any candidate engine should ship.
