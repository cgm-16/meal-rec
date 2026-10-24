# Preserve pilot exposures and responses separately

The existing feedback record keeps only the latest reaction to a user–meal pair, while the pilot needs repeated presentations and their original context. Store pilot exposures and their appeal responses separately as append-only records, preserving unanswered exposures and preventing duplicate responses to the same exposure. This retains the evidence needed for temporal evaluation without changing the meaning of existing feedback.
