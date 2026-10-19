# ABOUTME: Exposes the shared fitted-model contract and fixed candidate order.
# ABOUTME: Keeps all three actual adapters and their approved grids available together.

from meal_prediction.models.base import FitError, FitFailure, FittedModel, NotEstimable, load_fitted
from meal_prediction.models.logistic import LOGISTIC_GRID, fit_logistic
from meal_prediction.models.catboost import CATBOOST_GRID, fit_catboost
from meal_prediction.models.fm import FM_GRID, fit_fm

FAMILIES = (("M1", LOGISTIC_GRID, fit_logistic), ("M2", CATBOOST_GRID, fit_catboost), ("M3", FM_GRID, fit_fm))

__all__ = ["FitError", "FitFailure", "FittedModel", "NotEstimable", "load_fitted", "FAMILIES"]
