# Collect pilot responses and benchmark offline

Extend MealRec to collect the agreed pilot and use an offline Python runner to train and compare logistic regression, CatBoost, and the context-aware factorization machine. Live prediction serving and shadow scoring are outside this implementation. This keeps the shared comparison reproducible without requiring a second hosted application during the pilot.
