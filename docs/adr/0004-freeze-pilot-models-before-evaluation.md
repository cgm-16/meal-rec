# Freeze pilot models before evaluation

Use the first pilot week for development, then freeze the fitted parameters, learned preprocessing, and response-derived histories of all three models before evaluating the second week. Second-week answers are used only to evaluate predictions, with common calendar cutoffs and no fitting or tuning on those answers; current context available before a response may still be an input. This creates a shared future holdout and keeps development separate from the final comparison.
