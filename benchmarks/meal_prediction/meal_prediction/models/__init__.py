# ABOUTME: Exposes the shared fitted-model contract and structured fitting errors.
# ABOUTME: Keeps candidate implementations independent of artifact orchestration.

from meal_prediction.models.base import FitError, FitFailure, FittedModel, NotEstimable, load_fitted

__all__ = ["FitError", "FitFailure", "FittedModel", "NotEstimable", "load_fitted"]
