# ABOUTME: Fits the native categorical CPU CatBoost meal-prediction candidate.
# ABOUTME: Freezes shared row columns and reports unsupported or failed fits.

from dataclasses import dataclass
from numbers import Integral, Real
from typing import Mapping
import warnings

from catboost import CatBoostClassifier, CatBoostError, Pool
import numpy as np

from meal_prediction.models.base import FitFailure, FittedModel, NotEstimable, validate_batch
from meal_prediction.records import FeatureBatch


CATBOOST_GRID = tuple({"depth": depth, "l2_leaf_reg": float(l2)} for depth in (2, 4, 6) for l2 in (1, 3, 10))


def _aligned_pool(rows, columns, categorical, label=None):
    # Omitted native categories must stay distinct from the learned missing category.
    return Pool(
        [[row.get(name, "" if index in categorical else 0.0) for index, name in enumerate(columns)] for row in rows],
        label=label, cat_features=list(categorical), feature_names=list(columns), thread_count=1,
    )


@dataclass(frozen=True)
class FittedCatBoost(FittedModel):
    columns: tuple[str, ...]
    categorical: tuple[int, ...]
    estimator: CatBoostClassifier

    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        validate_batch(batch)
        if not batch.ids:
            return np.empty(0, dtype=float)
        probabilities = self.estimator.predict_proba(_aligned_pool(batch.rows, self.columns, self.categorical), thread_count=1)[:, 1]
        if not np.isfinite(probabilities).all() or not ((0 <= probabilities) & (probabilities <= 1)).all():
            raise ValueError("catboost: invalid predicted probabilities")
        return probabilities


def fit_catboost(batch: FeatureBatch, y: np.ndarray, params: Mapping[str, int | float], seed: int) -> FittedModel:
    validate_batch(batch)
    if (set(params) != {"depth", "l2_leaf_reg"} or isinstance(params["depth"], bool)
            or not isinstance(params["depth"], Integral) or params["depth"] not in (2, 4, 6)
            or isinstance(params["l2_leaf_reg"], bool) or not isinstance(params["l2_leaf_reg"], Real)
            or params["l2_leaf_reg"] not in (1, 3, 10)):
        raise ValueError("params: expected only depth in (2, 4, 6) and l2_leaf_reg in (1, 3, 10)")
    params = {"depth": int(params["depth"]), "l2_leaf_reg": float(params["l2_leaf_reg"])}
    labels = np.asarray(y)
    if (labels.ndim != 1 or len(labels) != len(batch.ids) or labels.dtype.kind not in "iuf"
            or not np.isin(labels, (0, 1)).all()):
        raise ValueError("y: expected aligned binary 0/1 targets, never booleans")
    if not len(labels):
        raise NotEstimable("catboost", "empty_fit", params=params)
    if len(np.unique(labels)) != 2:
        raise NotEstimable("catboost", "single_class", params=params)
    columns = tuple(sorted({name for row in batch.rows for name in row}))
    if not columns:
        raise NotEstimable("catboost", "no_features", params=params)
    categorical_names = {name for row in batch.rows for name, value in row.items() if isinstance(value, str)}
    categorical = tuple(index for index, name in enumerate(columns) if name in categorical_names)
    estimator = CatBoostClassifier(
        loss_function="Logloss", task_type="CPU", thread_count=1, learning_rate=0.05, iterations=300,
        depth=params["depth"], l2_leaf_reg=params["l2_leaf_reg"], random_seed=seed,
        allow_writing_files=False, verbose=False,
    )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            estimator.fit(_aligned_pool(batch.rows, columns, categorical, labels))
    except Warning as error:
        raise FitFailure("catboost", "solver_warning", params=params, detail=str(error)) from error
    except (CatBoostError, ValueError, FloatingPointError, OverflowError) as error:
        raise FitFailure("catboost", "solver_error", params=params, detail=str(error)) from error
    return FittedCatBoost(columns, categorical, estimator)
