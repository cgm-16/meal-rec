# Food benchmark datasets: access verified 2026-10-18

**Use Food.com as the common recipe-preference benchmark for at least three models.** Its author-linked raw data, processed recipe features and supplied interaction splits are publicly downloadable without credentials in this check. Use contextual Food as a separate, small experiment on hunger-dependent ratings. These test different targets; neither establishes prediction of a MealRec user's immediate meal choice or supports an observed-weather join.

This follow-up resolves the prior note's Food.com access uncertainty. Checks used anonymous metadata requests and bounded HTTP Range reads, plus complete reads of the small contextual split files. No accounts, dependencies, implementation or large dataset downloads were needed. The companion [benchmark shortlist](benchmark-shortlist.md) covers UCI Restaurant & Consumer, Meituan TRD, and Delivery Hero.

## Evidence-backed dataset fit

| Dataset | Actual labels and available predictors | Time/context and weather feasibility | Current access, reuse caveat, appropriate task |
|---|---|---|---|
| **Food.com / UCSD recipe and review release** | User–recipe review rating, with review date; raw recipe names, ingredients, tags, nutrition, preparation minutes, submission date and directions. Processed splits retain `user_id,recipe_id,date,rating,u,i`; processed recipe features include ingredient IDs, techniques and calorie level. | Absolute **review dates**, not eating/choice times. No user/event geography in inspected schema. Calendar features are possible; local-weather linkage is not defensible. | UCSD's [official dataset page](https://cseweb.ucsd.edu/~jmcauley/datasets.html#foodcom) and [original authors' repository](https://github.com/majumderb/recipe-personalization) point to **the same Kaggle release**, not two independent datasets. Anonymous listing and bounded downloads work; details below. Metadata labels license **“Data files © Original Authors”**; no open reuse grant established. Appropriate: rating prediction conditional on someone reviewing a recipe; secondary positive-review ranking with explicitly chosen labels/candidates. Not a restaurant purchase or consumption dataset. |
| **Contextual Food used by Rendle et al. 2011; current AIN implementation release** | Original paper: 1–5 menu ratings and hunger/real-versus-imagined context. Current processed file actually contains **6,104 rows, 212 user IDs, 20 item IDs, two categorical contexts and ratings 1–5**. Raw file includes menu calorie/salt/category attributes, survey user attributes, context fields and rating reasons. | No timestamp or geography among original CSV headers or processed columns. Some ratings concern imagined hunger. Therefore **no weather join or chronological forecasting evaluation**. | Original [Rendle et al. paper, §5.1](https://www.ismll.uni-hildesheim.de/pub/pdfs/Rendle_et_al2011-Context_Aware.pdf) reports 6,360 ratings; [libFM's linked supplementary page](https://cms.uni-konstanz.de/informatik/rendle/pub0/sigir-2011/) returned **404**. Current public [AIN release](https://github.com/alexmay21/AIN/tree/master/dataset) contains actual raw/processed files; this is a later implementation release, not verification that its preprocessing equals the 2011 experiment. No LICENSE in its complete tree; GitHub license metadata is null. Appropriate: small contextual-rating interpolation benchmark, after split repair/audit below. |
| **MealRec+ course-rating metadata — optional independent sensitivity set** | `user_course.csv`: `user_id,course_id,rating,dateLastModified`. `course.csv`: course ID/name, ingredients, directions, nutrition, tags and aggregate review fields. These support a **course/recipe-rating** target. Its user–meal bundle interactions are a different constructed target and must not be reported as observed meal choices. | `dateLastModified` is a review modification timestamp; original creation/consumption time and timezone were not established. No event location in inspected schema. **No weather join**. | [SIGIR 2024 authors' release](https://github.com/WUT-IDEA/MealRecPlus) documents schemas. Actual H-variant ZIP bytes and headers work anonymously through Git LFS; details below. Complete tree has no LICENSE and repository license metadata is null. Appropriate: independent recipe-rating replication after rights, timestamp semantics and duplicate-review checks. Do not use aggregate review counts/ratings or target review text as historical predictors without point-in-time reconstruction. |

## Food.com: concrete file availability and schema

The anonymous [metadata endpoint](https://www.kaggle.com/api/v1/datasets/view/shuyangli94/food-com-recipes-and-user-interactions) and [file-list endpoint](https://www.kaggle.com/api/v1/datasets/list/shuyangli94/food-com-recipes-and-user-interactions) both returned HTTP **200**. Listing identifies these eight files, totaling **892,407,202 uncompressed bytes**; this is file metadata, not a new full-data count:

| File | Listed bytes | Header or purpose verified |
|---|---:|---|
| `interactions_train.csv` | 28,248,536 | `user_id,recipe_id,date,rating,u,i` |
| `interactions_validation.csv` | 292,316 | Same interaction header |
| `interactions_test.csv` | 522,731 | Same interaction header |
| `RAW_interactions.csv` | 349,436,524 | `user_id,recipe_id,date,rating,review` |
| `RAW_recipes.csv` | 294,520,189 | `name,id,minutes,contributor_id,submitted,tags,nutrition,n_steps,steps,description,ingredients,n_ingredients` |
| `PP_recipes.csv` | 204,912,912 | `id,i,name_tokens,ingredient_tokens,steps_tokens,techniques,calorie_level,ingredient_ids` |
| `PP_users.csv` | 13,555,204 | `u,techniques,items,n_items,ratings,n_ratings` |
| `ingr_map.pkl` | 918,790 | Listed only; not downloaded or deserialized |

For each CSV above, requesting bytes `0–16383` returned HTTP **206** and enough bytes to verify its header. Larger files arrive as ZIPs; bounded local-header decompression exposed the CSV header. The [training-file endpoint](https://www.kaggle.com/api/v1/datasets/download/shuyangli94/food-com-recipes-and-user-interactions/interactions_train.csv) reported a **9,291,208-byte ZIP** via Content-Range. Validation and test requests returned CSV directly. One observed training record had an absolute date and numerical rating; no location was present. No full interaction or recipe file was downloaded.

The [metadata description](https://www.kaggle.com/api/v1/datasets/view/shuyangli94/food-com-recipes-and-user-interactions) explicitly calls the interaction files supplied splits and the PP files data for result reproduction. It describes tokenized recipe metadata. The [paper, §4](https://aclanthology.org/D19-1613.pdf) describes per-user review ordering, latest review for test, second latest for validation, and recipe filtering. Those splits were built for its generation experiment; they are **not automatically the right common split for a deployment benchmark**. Actual full-file split counts, rating-zero semantics and timestamp ties were not audited here.

The companion [benchmark shortlist](benchmark-shortlist.md) proposes the common M1 regularized-logistic, M2 CatBoost, and M3 factorization-machine comparison. This access note does not prescribe a different set of algorithms. Rebuild user histories, means and popularity from training data; do not assume `PP_users` summaries are safe for a revised split. Exclude target-review text. Resolve zeros/unrated reviews before interpreting star labels. For ranking, preregister the positive-rating rule and candidate set; missing reviews are not verified dislikes. The same retained labels and split must reach all models.

## Contextual Food: exact current-file audit

The [raw original CSV](https://raw.githubusercontent.com/alexmay21/AIN/master/dataset/original/Food/FoodData.csv) is listed at **1,436,091 bytes**; a 16 KiB prefix returned HTTP 206. Headers include `AnswerID`, `MenuID`, `VirtualFlag`, `situation`, `rating`, `situation_virtual_hungryness`, `situation_real_hungryness`, menu attributes and `reason_*` fields. The latter explain the rating and should not be treated as pre-outcome context. No date/location column appeared.

These public processed files were read completely; all returned HTTP 206 with matching byte ranges:

| Actual file | Bytes | Rows counted | Important audit result |
|---|---:|---:|---|
| [ratings.dat](https://raw.githubusercontent.com/alexmay21/AIN/master/dataset/processed/Food/ratings.dat) | 73,404 | 6,104 | 804 repeated keys when keyed by the first four columns |
| [ratings_train.txt](https://raw.githubusercontent.com/alexmay21/AIN/master/dataset/processed/Food/ratings_train.txt) | 58,354 | 4,853 | 212 users, 20 items |
| [ratings_valid.txt](https://raw.githubusercontent.com/alexmay21/AIN/master/dataset/processed/Food/ratings_valid.txt) | 7,845 | 650 | 150 distinct first-four-column keys also occur in train |
| [ratings_test.txt](https://raw.githubusercontent.com/alexmay21/AIN/master/dataset/processed/Food/ratings_test.txt) | 7,205 | 601 | 135 distinct first-four-column keys also occur in train |

Files have five comma-separated columns and no header; the [release loader](https://github.com/alexmay21/AIN/blob/master/LoadData.py) treats the first two as user/item indices, the next two as context and the last as rating. Example format: `0,1,1,3,3`. Observed context code sets are `{0,1}` and `{2,3,4}`; exact code-to-real/imagined/full/hungry/normal mapping was not verified. Five star labels `{1,2,3,4,5}` were observed. These are **current file counts**, deliberately distinguished from the original paper's 6,360.

Do not present the supplied split as independent unseen user–item–context cells. Group repeated first-four-column keys before assigning folds if that is the claimed target; inspect conflicting repeated ratings and report the treatment. The supplied loader also computes its global mean over `ratings.dat`, including held-out ratings; recompute any baseline mean on training labels. This dataset can compare biases/MF/context-aware FM on one shared rating target, but its small catalog and imagined situations limit transfer to MealRec.

## MealRec+ LFS verification

The complete author [file tree](https://api.github.com/repos/WUT-IDEA/MealRecPlus/git/trees/main?recursive=1) was untruncated at revision `8bd7d7d7effb505be4a7d2074b28abad802fe0f7`. Under `MealRec+/MealRec+H/meta_data/`, Git stores **134-byte `course.zip` and 132-byte `user_course.zip` LFS pointers**, not CSV files. The authors' [DateNote](https://github.com/WUT-IDEA/MealRecPlus/blob/main/MealRec%2B/MealRec%2BH/meta_data/DateNote.txt) explicitly explains this.

Anonymous Range requests through the real LFS media links returned HTTP **206**:

| Working payload | Total payload bytes | Header verified by bounded ZIP decompression |
|---|---:|---|
| [course.zip](https://media.githubusercontent.com/media/WUT-IDEA/MealRecPlus/main/MealRec%2B/MealRec%2BH/meta_data/course.zip) | 195,052,658 | `course_id,course_name,review_nums,category,aver_rate,image_url,ingredients,cooking_directions,nutritions,reviews,tags` |
| [user_course.zip](https://media.githubusercontent.com/media/WUT-IDEA/MealRecPlus/main/MealRec%2B/MealRec%2BH/meta_data/user_course.zip) | 1,880,922 | `user_id,course_id,rating,dateLastModified` |

Only **32,768 bytes per ZIP** were read. One interaction's modification-time prefix was `2001-03-26T07:36:16.653`; that verifies a timestamp string, not its timezone or eating-time meaning. H/L overlap and full rating distributions were not checked. The [repository metadata](https://api.github.com/repos/WUT-IDEA/MealRecPlus) returned `license: null`; a citation request is not an explicit reuse license.

## Decision and unresolved facts

Food.com now has the strongest verified recipe-content-plus-rating access among this subtask's sources. Use one common Food.com task for the three primary variants, then contextual Food for a deliberately separate context ablation; MealRec+ raw course ratings are an optional independent replication. Use the order datasets examined in the companion shortlist for claims about ordering behavior. None of these three can identify MealRec users, establish actual food consumption, or test local-weather value.

Public downloadability is established for the files above; intended reuse permission remains unresolved for all three releases. Do not substitute a software license, Kaggle availability or a paper's copyright notice for dataset terms. Before implementation, resolve those terms, freeze exact versions/checksums, and finalize label cleaning and splits. No empirical model performance or universal sample-size claim is made here.

## Permission follow-up and licensed fallback

A further check of the original Kaggle metadata, UCSD listing, and author repository did not establish an explicit Food.com research/noncommercial reuse grant or license URL. Downloadability and citation instructions remain separate from that unresolved permission; this finding does not establish that every use is prohibited.

The [official UCI Restaurant & Consumer release](https://archive.ics.uci.edu/dataset/232/restaurant+consumer+data) explicitly declares CC BY 4.0. Its 39,674-byte ZIP has SHA-256 `dc61ec3779db8d3bd2cde8d65abf87dc07e9b22ae94f9b9ad6375d57f627e333`; all 1,161 user–restaurant rows are unique. A proposed `food_rating == 2` task has 516 high and 645 lower ratings; exclude companion overall/service ratings from predictors.

Aggregate multivalued metadata before joining and retain all observations: restaurant cuisine is missing for 35 restaurants covering 288 rated rows. The restaurant-profile CSV required CP1252 decoding in the audit. This provides a small explicitly licensed static proxy for all three models; it has no rating-event time, hunger, or weather and cannot validate immediate dish appetite. Source selection and task choice remain proposed design adjustments.
